/**
 * The window listing the devices connected to the router.
 *
 * It is deliberately not a popover. The panel is 320×520 with almost every
 * pixel spent and nothing scrolls in it, so a list of unknown length gets a
 * window of its own: a title bar, an entry in the window list, and a close
 * button that closes the list rather than quitting an app that lives in the
 * menu bar.
 *
 * This file owns the window and nothing else. What the list *says* is the
 * renderer's business, and where the list comes from is T-66's.
 */

import { BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";

/** Wide enough for a name, an address and a MAC on one line. */
export const DEVICES_WINDOW_WIDTH = 520;

/** Tall enough for a household's worth of devices before anything scrolls. */
export const DEVICES_WINDOW_HEIGHT = 420;

/** The tray menu entry that opens it, shared so the menu and the tests agree. */
export const DEVICES_MENU_LABEL = "Connected devices…";

/** What the title bar reads. */
const DEVICES_WINDOW_TITLE = "Connected devices";

/**
 * The page, as the build leaves it. `npm run build` copies it into
 * `dist/renderer/` beside the script `tsc` emits there, and that copy is the one
 * the app loads: a packaged bundle carries `dist/` and drops `src/`, so a path
 * into the source tree would start fine and then fail to find its own page.
 *
 * This module sits two directories deep whether it runs from `src/` under Vitest
 * or from `dist/` after a build, so the same walk reaches `dist/` either way.
 */
function defaultHtmlPath(): string {
  return fileURLToPath(
    new URL("../../dist/renderer/devices.html", import.meta.url),
  );
}

export interface DevicesWindowOptions {
  /** Path to the page. Injected so tests never touch the filesystem. */
  htmlPath?: string;
  width?: number;
  height?: number;
}

export interface DevicesWindow {
  /** Opens the window, or brings the one that already exists to the front. */
  open(): void;
  close(): void;
  isOpen(): boolean;
  destroy(): void;
}

export function createDevicesWindow(
  options: DevicesWindowOptions = {},
): DevicesWindow {
  const width = options.width ?? DEVICES_WINDOW_WIDTH;
  const height = options.height ?? DEVICES_WINDOW_HEIGHT;
  const htmlPath = options.htmlPath ?? defaultHtmlPath();

  let window: BrowserWindow | null = null;

  function alive(): BrowserWindow | null {
    return window !== null && !window.isDestroyed() ? window : null;
  }

  function create(): BrowserWindow {
    const created = new BrowserWindow({
      width,
      height,
      show: false,
      title: DEVICES_WINDOW_TITLE,
      // Everything the popover is not: the user manages this one, so it has a
      // frame, it resizes, and it takes its place in the window list.
      frame: true,
      resizable: true,
      skipTaskbar: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        // The list is pushed from the main process, and Chromium defers work in
        // a renderer it believes nobody is watching — the pushes would then queue
        // up behind a window that only looks idle. The panel needs this for the
        // same reason.
        backgroundThrottling: false,
      },
    });

    // Closing really does dispose of the window, so the reference has to go with
    // it or the next open would focus a corpse.
    created.on("closed", () => {
      window = null;
    });

    void created.loadFile(htmlPath);
    window = created;

    return created;
  }

  return {
    open(): void {
      const existing = alive();
      const open = existing ?? create();

      // Nothing remembers what the user dragged the window to: a list that
      // reopens at whatever size it was last left is a setting nobody asked
      // for, so every open starts at the stated default.
      open.setSize(width, height);
      open.show();
      // A second open is the same window brought forward, never another one.
      open.focus();
    },
    close(): void {
      alive()?.close();
    },
    isOpen(): boolean {
      return alive() !== null;
    },
    destroy(): void {
      alive()?.destroy();
      window = null;
    },
  };
}
