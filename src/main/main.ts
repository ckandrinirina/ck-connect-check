/**
 * The Electron main process — the only file in the app that touches Electron.
 *
 * It does three things: hide the Dock icon so the app lives solely in the menu
 * bar, create the tray item, and let {@link UsagePoller} drive its title. Every
 * decision about what the title says belongs to `tray.ts`, and every decision
 * about when to ask the router belongs to `poller.ts`.
 */

import { Menu, Tray, app, nativeImage } from 'electron';

import { loadConfig } from '../config/config.js';
import { defaultConfigPath } from '../config/defaults.js';
import { RouterClient } from '../hilink/client.js';
import { UsagePoller, type SnapshotSource } from './poller.js';

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

  const client = options.client ?? new RouterClient({ baseUrl: `http://${config.host}` });
  const tray = new Tray(nativeImage.createEmpty());
  const poller = new UsagePoller({
    client,
    config,
    onTitle: (title) => tray.setTitle(title),
  });

  // Without this the app could only be stopped by killing the process; the
  // click-to-open popover arrives with T-07.
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Quit', role: 'quit' }]));
  tray.setTitle(poller.title);
  poller.start();

  return {
    stop() {
      poller.stop();
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
