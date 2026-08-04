/**
 * The Electron main process — the only file in the app that touches Electron.
 *
 * It hides the Dock icon so the app lives solely in the menu bar, creates the
 * tray item, lets {@link UsagePoller} drive its title, and hangs the popover off
 * a click. Every decision about what the title says belongs to `tray.ts`, what
 * the popover says to `view-model.ts`, and when to ask the router to
 * `poller.ts`. This file only connects them.
 */

import { Menu, Tray, app } from "electron";

import {
  loadConfig,
  readPlanDaysEntry,
  readPlanLimitEntry,
  saveConfig,
  type PlanDaysRefusal,
  type PlanLimitRefusal,
} from "../config/config.js";
import { defaultConfigPath } from "../config/defaults.js";
import { isAnchorStale, needsAutomaticSync } from "../domain/allowance.js";
import type { Carrier } from "../domain/carrier.js";
import { createRateHistory } from "../domain/history.js";
import { systemClock } from "../domain/quota.js";
import { RouterClient, type SnapshotResult } from "../hilink/client.js";
import { isRouterRefusal } from "../hilink/ussd.js";
import type { Allowance, RouterSnapshot } from "../hilink/types.js";
import { readInfoConso } from "../orange/portal.js";
import { loadCredential, saveCredential } from "./credentials.js";
import {
  UsagePoller,
  type PortalSource,
  type SnapshotSource,
} from "./poller.js";
import { bindTrayToPopover, createPopover, type Popover } from "./popover.js";
import { createTrayGlyph, trayBarsFor } from "./tray-icon.js";
import {
  createAllowanceSync,
  recordAnchor,
  type AllowanceSource,
  type CredentialStore,
  type SyncState,
} from "./sync.js";
import { buildPopoverModel, type UsageReading } from "./view-model.js";

/**
 * How often the staleness of the anchor is looked at, with the panel shut.
 *
 * A minute, against a window measured in tens of them: this only decides how
 * promptly an elapsed window is noticed, never how often the carrier is dialled
 * — the check is arithmetic on two dates, and almost every one of them decides
 * to do nothing.
 */
const STALE_CHECK_INTERVAL_MS = 60_000;

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
  /**
   * The Orange selfcare portal. Injected for the same reason
   * {@link MenuBarOptions.client} is: no test may reach `123.orange.mg`.
   */
  portal?: PortalSource;
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
  /**
   * Stores a plan size as the panel's field received it. Exposed for the same
   * reason {@link MenuBarApp.sync} is: it is what the panel does, and a test
   * can drive it without an Electron window.
   */
  setPlanLimit(value: string): void;
  /** Stores a plan length the same way, and for the same reason. */
  setPlanDays(value: string): void;
  /**
   * Remembers which of the carrier's forfaits the meter measures, by the label
   * the carrier gave it. Exposed for the same reason the two above are.
   */
  setForfait(label: string): void;
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
  // The glyph starts empty-handed rather than at full signal: no poll has
  // answered yet, so claiming any bars would be inventing one.
  const glyph = createTrayGlyph();
  const tray = new Tray(glyph.imageFor(0));
  const popover =
    options.popover ??
    createPopover({
      onSync: () => void sync.start(),
      onSavePassword: (credential) => void sync.submitPassword(credential),
      onSetPlanLimit: (value) => {
        setPlanLimit(value);
      },
      onSetPlanDays: (value) => {
        setPlanDays(value);
      },
      onChooseForfait: (label) => {
        setForfait(label);
      },
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

  // Why the last typed plan size was refused, if it was. Held here for the same
  // reason the sync state is: a poll landing afterwards must rebuild the model
  // with the complaint still on it.
  let planLimitProblem: PlanLimitRefusal | undefined;

  /** The same, for the plan length typed beside it. */
  let planDaysProblem: PlanDaysRefusal | undefined;

  function refreshPopover(): void {
    popover.setModel(
      buildPopoverModel({
        result,
        lastReading,
        config,
        history: history.samples(),
        sync: syncState,
        portal: poller.portal,
        planLimitProblem,
        planDaysProblem,
      }),
    );
  }

  /**
   * Which network the SIM is on, as the last reading found it.
   *
   * Read from the last successful reading rather than the current result, so an
   * unreachable router does not turn a known carrier into an unknown one — the
   * SIM has not changed just because the device stopped answering.
   */
  function currentCarrier(): Carrier {
    return lastReading?.snapshot.carrier.id ?? "unknown";
  }

  /**
   * Stores the plan size the user typed, or says why it could not be.
   *
   * The renderer sends the characters and converts nothing; the Go-to-bytes
   * scale and the refusal both belong to `config.ts` and `view-model.ts`
   * respectively, so this only routes between them.
   */
  function setPlanLimit(value: string): void {
    const entry = readPlanLimitEntry(value);

    if (!entry.ok) {
      planLimitProblem = entry.reason;
      refreshPopover();

      return;
    }

    planLimitProblem = undefined;
    config.planLimitBytes = entry.bytes;
    // Submitting the cap *is* confirming it, whether the figure changed or not
    // — which is what lets the new-plan prompt cost a single press when the
    // plan size did not actually move.
    config.planCapConfirmed = true;

    try {
      saveConfig(configPath, config);
    } catch (error) {
      // The cap still governs the dial for this run; losing it on quit is
      // better than refusing the setting outright.
      console.warn(`could not record the plan limit: ${String(error)}`);
    }

    refreshPopover();
  }

  /**
   * Stores the plan length the user typed, or says why it could not be.
   *
   * A refused entry writes nothing at all — a blank submission leaves whatever
   * was already stored exactly as it was, rather than clearing the period out
   * from under the pace reading.
   */
  function setPlanDays(value: string): void {
    const entry = readPlanDaysEntry(value);

    if (!entry.ok) {
      planDaysProblem = entry.reason;
      refreshPopover();

      return;
    }

    planDaysProblem = undefined;
    config.planDays = entry.days;

    try {
      saveConfig(configPath, config);
    } catch (error) {
      console.warn(`could not record the plan length: ${String(error)}`);
    }

    refreshPopover();
  }

  /**
   * Remembers which forfait the meter measures.
   *
   * The label is written onto the same config object the poller holds, so the
   * next portal read selects against it — the choice is applied where every
   * poll applies it, rather than being pushed into the panel from here.
   *
   * A blank label is dropped rather than stored. It could only arrive from a
   * page that named no plan, and clearing the stored choice would put the
   * meter back on whichever forfait the portal happens to list first.
   */
  function setForfait(label: string): void {
    const wanted = label.trim();

    if (wanted === "") {
      return;
    }

    config.orangeForfaitLabel = wanted;

    try {
      saveConfig(configPath, config);
    } catch (error) {
      // The choice still governs this run; losing it on quit is better than
      // refusing it outright, exactly as the two typed settings decide.
      console.warn(`could not record the chosen forfait: ${String(error)}`);
    }

    refreshPopover();
  }

  /**
   * Pins the carrier's figure to the router's counter at this instant and
   * writes it down. The anchor has to survive a quit — the router keeps
   * counting while the app is closed — so it goes to the config, not to memory.
   *
   * {@link recordAnchor} also decides, against the anchor being replaced,
   * whether the typed-in cap still describes the plan — the one instant that
   * comparison can be made.
   */
  function anchorAllowance(allowance: Allowance): void {
    const month = lastReading?.snapshot.month;

    if (month === undefined) {
      // No poll has ever answered, so there is no counter to anchor against.
      // Unreachable in practice: the dialogue that produced this figure went
      // over the same router the poll reads.
      return;
    }

    recordAnchor(config, allowance, month);

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
    // The dialogue is the YAS path. On Orange it never starts, so no password
    // is ever asked of the Keychain and no account can be walked towards its
    // five-failure lockout for a figure a plain `GET` already answered.
    carrier: currentCarrier,
    onAllowance: anchorAllowance,
    onStateChange: (state) => {
      if (state.phase === "failed" && isRouterRefusal(state.reason)) {
        // The panel dismisses itself the moment the user clicks elsewhere, so
        // the log is the only place this number survives long enough to report.
        console.warn(
          `sync refused: ${state.reason.source} code ${String(state.reason.code)} at ${state.reason.endpoint}`,
        );
      }

      syncState = state;
      refreshPopover();
    },
  });

  /**
   * Whether the launch dialogue has already been decided. Set on the first
   * reading that arrives, whichever way the decision went, so a failed
   * automatic sync is never retried — the router locks the account after five
   * refused sign-ins, and a timer that keeps trying would walk it there.
   */
  let automaticSyncDecided = false;

  /**
   * Dials the carrier once at launch, if there is nothing worth showing.
   *
   * It waits for a reading because the anchor has to be pinned to a counter,
   * and there is no counter until the router has answered once. With no
   * password stored, `sync.start()` asks for one and dials nothing, which is
   * the same thing a press would do.
   */
  function syncAutomaticallyOnce(snapshot: RouterSnapshot): void {
    if (automaticSyncDecided) {
      return;
    }

    automaticSyncDecided = true;

    if (needsAutomaticSync(config.allowanceAnchor, snapshot.month)) {
      void sync.start();
    }
  }

  /**
   * Re-anchors a figure that has simply gone old.
   *
   * The other half of {@link syncAutomaticallyOnce}: that one asks whether the
   * anchor is *usable*, this one whether a usable anchor is still *recent*. It
   * is evaluated at two moments — the panel opening, and a timer for an app
   * nobody has opened all afternoon — and never on a poll tick, because a poll
   * comes round every few seconds and a dialogue takes tens of them.
   *
   * Everything that could make this the wrong moment is checked here rather
   * than inside the sync: no reading yet means no counter to anchor against,
   * and an unreachable router means the dialogue would fail and park automatic
   * syncing over a problem that fixes itself.
   */
  function syncIfStale(): void {
    if (lastReading === null || result === null || !result.online) {
      return;
    }

    if (
      isAnchorStale(
        config.allowanceAnchor,
        systemClock.now(),
        config.syncStaleAfterMinutes,
      )
    ) {
      void sync.startAutomatic();
    }
  }

  const client: SnapshotSource = {
    async snapshot(): Promise<SnapshotResult> {
      // The panel dismisses itself when the user clicks elsewhere, which the
      // wrapper below never sees. Reading its real visibility on every poll is
      // what stops the fast cadence from outliving the panel that earned it.
      poller.setActive(popover.isOpen());

      result = await router.snapshot();

      // An unreachable router shows no bars — the title already says `offline`,
      // and a glyph still claiming a signal would contradict it.
      glyph.apply(
        tray,
        result.online ? trayBarsFor(result.snapshot.status) : 0,
      );

      if (result.online) {
        lastReading = { snapshot: result.snapshot, at: systemClock.now() };
        syncAutomaticallyOnce(result.snapshot);
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
    // Only ever read on Orange, and only on the idle interval — the poller
    // decides both, from the carrier the router reports.
    portal: options.portal ?? { read: () => readInfoConso() },
    onPortal: () => {
      refreshPopover();
    },
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
      syncIfStale();
    },
    hide() {
      popover.hide();
      poller.setActive(false);
    },
    toggle(bounds) {
      popover.toggle(bounds);
      poller.setActive(popover.isOpen());

      // Only on the way open. Closing the panel is not a moment anyone wants a
      // carrier dialogue to start.
      if (popover.isOpen()) {
        syncIfStale();
      }
    },
  };

  // Its own timer rather than a share of the poll loop: the poll runs every few
  // seconds and this must not. The interval only decides how promptly a window
  // that has come round is noticed — `syncStaleAfterMinutes` decides whether
  // there is anything to notice.
  const staleCheck = setInterval(syncIfStale, STALE_CHECK_INTERVAL_MS);

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
    setPlanLimit,
    setPlanDays,
    setForfait,
    stop() {
      clearInterval(staleCheck);
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
