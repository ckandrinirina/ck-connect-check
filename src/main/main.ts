/**
 * The Electron main process — the only file in the app that touches Electron.
 *
 * It hides the Dock icon so the app lives solely in the menu bar, creates the
 * tray item, lets {@link UsagePoller} drive its title, and hangs the popover off
 * a click. Every decision about what the title says belongs to `tray.ts`, what
 * the popover says to `view-model.ts`, and when to ask the router to
 * `poller.ts`. This file only connects them.
 */

import { Menu, Tray, app, nativeImage } from "electron";

import { loadConfig, saveConfig } from "../config/config.js";
import { defaultConfigPath } from "../config/defaults.js";
import { anchorFrom, planTotalBytes } from "../domain/allowance.js";
import { createRateHistory } from "../domain/history.js";
import { systemClock } from "../domain/quota.js";
import { RouterClient, type SnapshotResult } from "../hilink/client.js";
import type { Allowance } from "../hilink/types.js";
import { loadCredential, saveCredential } from "./credentials.js";
import { UsagePoller, type SnapshotSource } from "./poller.js";
import { bindTrayToPopover, createPopover, type Popover } from "./popover.js";
import {
  createAllowanceSync,
  type AllowanceSource,
  type CredentialStore,
  type SyncState,
} from "./sync.js";
import { buildPopoverModel, type UsageReading } from "./view-model.js";

export interface MenuBarOptions {
  /** Where the config lives. Injected so tests never touch the user directory. */
  configPath?: string;
  /** The router client. Injected so tests never touch the network. */
  client?: SnapshotSource;
  /**
   * The USSD side of the router. Injected separately from
   * {@link MenuBarOptions.client} so a test can drive a sync without a poll
   * ever reaching it — and so it is obvious that the poll loop cannot.
   */
  allowance?: AllowanceSource;
  /** The password store. Injected so tests need no Keychain. */
  credentials?: CredentialStore;
  /** The detail panel. Injected so tests can read the model without a window. */
  popover?: Popover;
}

export interface MenuBarApp {
  /**
   * Runs the allowance dialogue once — what the panel's Sync button does. The
   * poll loop never calls this; a dialogue holds carrier-side state and takes
   * tens of seconds, so it only ever happens because someone asked for it.
   */
  sync(): Promise<void>;
  /** Stops polling and releases the tray item. */
  stop(): void;
}

/**
 * Wires the tray to the poller and starts polling.
 *
 * A tray created from an empty image shows its title and nothing else, which is
 * exactly the intent: the usage figure is the icon.
 */
export function startMenuBarApp(options: MenuBarOptions = {}): MenuBarApp {
  // Before anything is drawn: no Dock icon, no app switcher entry, menu bar only.
  app.dock?.hide();

  const configPath = options.configPath ?? defaultConfigPath();
  const { config, problem } = loadConfig(configPath);

  if (problem !== undefined) {
    // A bad config file is never fatal — the app runs on the defaults and says why.
    console.warn(problem);
  }

  // One client serves both the poll loop and the sync: they share a session
  // store, so a login taken out for a dialogue is the same one the poll uses.
  const routerClient = new RouterClient({ baseUrl: `http://${config.host}` });
  const router = options.client ?? routerClient;
  const allowanceRouter = options.allowance ?? routerClient;
  const credentials: CredentialStore = options.credentials ?? {
    // The plaintext exists only inside `credentials.ts`; this file never sees
    // one that it did not receive straight from the panel's prompt.
    load: () => loadCredential(configPath),
    save: (credential) => saveCredential(configPath, credential),
  };
  const tray = new Tray(nativeImage.createEmpty());
  const popover =
    options.popover ??
    createPopover({
      onSync: () => void sync.start(),
      onSavePassword: (credential) => void sync.submitPassword(credential),
    });

  // The poller only publishes a title, so the popover's figures are gathered
  // here instead: every poll passes through this wrapper on its way back.
  let result: SnapshotResult | null = null;
  let lastReading: UsageReading | null = null;

  // Kept out here rather than inside the panel: the router remembers no
  // throughput, so closing the panel must not throw away what it has seen.
  const history = createRateHistory();

  // Where the Sync button has got to. Held here rather than inside the panel so
  // a poll landing mid-dialogue rebuilds the model with the sync still running.
  let syncState: SyncState = { phase: "idle" };

  function refreshPopover(): void {
    popover.setModel(
      buildPopoverModel({
        result,
        lastReading,
        config,
        history: history.samples(),
        sync: syncState,
      }),
    );
  }

  /**
   * Pins the carrier's figure to the router's counter at this instant and
   * writes it down. The anchor has to survive a quit — the router keeps
   * counting while the app is closed — so it goes to the config, not to memory.
   */
  function anchorAllowance(allowance: Allowance): void {
    const month = lastReading?.snapshot.month;

    if (month === undefined) {
      // No poll has ever answered, so there is no counter to anchor against.
      // Unreachable in practice: the dialogue that produced this figure went
      // over the same router the poll reads.
      return;
    }

    const anchor = anchorFrom(allowance, month);
    const total = planTotalBytes(anchor, config.planTotalBytes ?? null);

    config.allowanceAnchor = anchor;

    if (total !== null) {
      config.planTotalBytes = total;
    }

    try {
      saveConfig(configPath, config);
    } catch (error) {
      // A config we cannot write still leaves the figure on screen for this
      // run; losing it on quit is better than losing the sync.
      console.warn(`could not record the allowance anchor: ${String(error)}`);
    }
  }

  const sync = createAllowanceSync({
    router: allowanceRouter,
    credentials,
    onAllowance: anchorAllowance,
    onStateChange: (state) => {
      syncState = state;
      refreshPopover();
    },
  });

  const client: SnapshotSource = {
    async snapshot(): Promise<SnapshotResult> {
      // The panel dismisses itself when the user clicks elsewhere, which the
      // wrapper below never sees. Reading its real visibility on every poll is
      // what stops the fast cadence from outliving the panel that earned it.
      poller.setActive(popover.isOpen());

      result = await router.snapshot();

      if (result.online) {
        lastReading = { snapshot: result.snapshot, at: systemClock.now() };
      }

      // Every poll is offered to the history; an offline one records a gap
      // rather than a zero.
      history.record(
        result.online
          ? {
              downloadBytesPerSecond: result.snapshot.traffic.downloadRateBps,
              uploadBytesPerSecond: result.snapshot.traffic.uploadRateBps,
            }
          : null,
      );

      refreshPopover();

      return result;
    },
  };

  const poller = new UsagePoller({
    client,
    config,
    onTitle: (title) => tray.setTitle(title),
  });

  // The panel is the only reason to poll quickly, so every way of opening or
  // closing it passes through here on its way to the poller.
  const panel: Popover = {
    isOpen: () => popover.isOpen(),
    setModel: (model) => popover.setModel(model),
    destroy: () => popover.destroy(),
    show(bounds) {
      popover.show(bounds);
      poller.setActive(true);
    },
    hide() {
      popover.hide();
      poller.setActive(false);
    },
    toggle(bounds) {
      popover.toggle(bounds);
      poller.setActive(popover.isOpen());
    },
  };

  // A context menu would swallow the left click on macOS, so Quit moves to the
  // right button and the left one belongs to the popover.
  const menu = Menu.buildFromTemplate([{ label: "Quit", role: "quit" }]);

  tray.on("right-click", () => tray.popUpContextMenu(menu));
  bindTrayToPopover(tray, panel);
  tray.setTitle(poller.title);
  refreshPopover();
  poller.start();

  return {
    sync: () => sync.start(),
    stop() {
      poller.stop();
      popover.destroy();
      tray.destroy();
    },
  };
}

// Only inside a real Electron runtime: importing this file under Vitest must
// not launch anything.
if (process.versions.electron !== undefined) {
  const started = app.whenReady().then(() => startMenuBarApp());

  app.on("will-quit", () => {
    void started.then((menuBarApp) => {
      menuBarApp.stop();
    });
  });
}
