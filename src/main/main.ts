/**
 * The Electron main process — the only file in the app that touches Electron.
 *
 * It hides the Dock icon so the app lives solely in the menu bar, creates the
 * tray item, lets {@link UsagePoller} drive its title, and hangs the popover off
 * a click. Every decision about what the title says belongs to `tray.ts`, what
 * the popover says to `view-model.ts`, and when to ask the router to
 * `poller.ts`. This file only connects them.
 */

import { Menu, Tray, app, nativeImage } from 'electron';

import { loadConfig } from '../config/config.js';
import { defaultConfigPath } from '../config/defaults.js';
import { systemClock } from '../domain/quota.js';
import { RouterClient, type SnapshotResult } from '../hilink/client.js';
import { UsagePoller, type SnapshotSource } from './poller.js';
import { bindTrayToPopover, createPopover } from './popover.js';
import { buildPopoverModel, type UsageReading } from './view-model.js';

export interface MenuBarOptions {
  /** Where the config lives. Injected so tests never touch the user directory. */
  configPath?: string;
  /** The router client. Injected so tests never touch the network. */
  client?: SnapshotSource;
}

export interface MenuBarApp {
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

  const { config, problem } = loadConfig(options.configPath ?? defaultConfigPath());

  if (problem !== undefined) {
    // A bad config file is never fatal — the app runs on the defaults and says why.
    console.warn(problem);
  }

  const router = options.client ?? new RouterClient({ baseUrl: `http://${config.host}` });
  const tray = new Tray(nativeImage.createEmpty());
  const popover = createPopover();

  // The poller only publishes a title, so the popover's figures are gathered
  // here instead: every poll passes through this wrapper on its way back.
  let result: SnapshotResult | null = null;
  let lastReading: UsageReading | null = null;

  function refreshPopover(): void {
    popover.setModel(buildPopoverModel({ result, lastReading, config }));
  }

  const client: SnapshotSource = {
    async snapshot(): Promise<SnapshotResult> {
      result = await router.snapshot();

      if (result.online) {
        lastReading = { snapshot: result.snapshot, at: systemClock.now() };
      }

      refreshPopover();

      return result;
    },
  };

  const poller = new UsagePoller({
    client,
    config,
    onTitle: (title) => tray.setTitle(title),
  });

  // A context menu would swallow the left click on macOS, so Quit moves to the
  // right button and the left one belongs to the popover.
  const menu = Menu.buildFromTemplate([{ label: 'Quit', role: 'quit' }]);

  tray.on('right-click', () => tray.popUpContextMenu(menu));
  bindTrayToPopover(tray, popover);
  tray.setTitle(poller.title);
  refreshPopover();
  poller.start();

  return {
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

  app.on('will-quit', () => {
    void started.then((menuBarApp) => {
      menuBarApp.stop();
    });
  });
}
