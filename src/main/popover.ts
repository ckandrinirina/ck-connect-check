/**
 * The detail panel that drops out of the menu bar item.
 *
 * This file owns every Electron call the popover needs — window creation,
 * placement, and the tray-click and blur wiring. What the panel *says* is
 * decided in `view-model.ts`, which knows nothing about Electron; this file
 * only carries the finished strings across to the page.
 *
 * The window is created lazily, on the first open. An app that lives in the
 * menu bar is usually never clicked, and a window nobody has asked for should
 * not cost a renderer process.
 */

import { BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";

import type { Rectangle, Tray } from "electron";

import type { PopoverModel } from "./view-model.js";

/** Wide enough for a rate and its unit on one line without wrapping. */
export const POPOVER_WIDTH = 320;

/** Tall enough for the whole layout, so nothing ever scrolls. */
export const POPOVER_HEIGHT = 380;

/**
 * The page lives beside its stylesheet in `src/renderer/`, and this module sits
 * two directories deep whether it is running from `src/` under Vitest or from
 * `dist/` after a build — so the same relative walk finds it either way.
 */
function defaultHtmlPath(): string {
  return fileURLToPath(
    new URL("../../src/renderer/index.html", import.meta.url),
  );
}

export interface PopoverOptions {
  /** Path to the page. Injected so tests never touch the filesystem. */
  htmlPath?: string;
  width?: number;
  height?: number;
}

export interface Popover {
  /** Open when closed, close when open — what a tray click does. */
  toggle(bounds?: Rectangle): void;
  show(bounds?: Rectangle): void;
  hide(): void;
  isOpen(): boolean;
  /** Hands the page a new set of display strings; safe before the window exists. */
  setModel(model: PopoverModel): void;
  destroy(): void;
}

export function createPopover(options: PopoverOptions = {}): Popover {
  const width = options.width ?? POPOVER_WIDTH;
  const height = options.height ?? POPOVER_HEIGHT;
  const htmlPath = options.htmlPath ?? defaultHtmlPath();

  let window: BrowserWindow | null = null;
  let model: PopoverModel | null = null;

  function alive(): BrowserWindow | null {
    return window !== null && !window.isDestroyed() ? window : null;
  }

  /**
   * Pushes the current model into the page. The renderer exposes a single
   * global entry point rather than an IPC channel: there is one message, it
   * only ever flows main → renderer, and a preload bridge would be more
   * machinery than that deserves.
   */
  function push(): void {
    const open = alive();

    if (open === null || model === null) {
      return;
    }

    // Rejects if the page is still loading; `did-finish-load` pushes again.
    void open.webContents
      .executeJavaScript(`window.applyPopoverModel(${JSON.stringify(model)})`)
      .catch(() => undefined);
  }

  function create(): BrowserWindow {
    const created = new BrowserWindow({
      width,
      height,
      show: false,
      // Frameless and fixed: a popover is not a window the user manages.
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      // Keeps the panel out of the app switcher and the taskbar; together with
      // `app.dock.hide()` in `main.ts` the app has no window-list presence.
      skipTaskbar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        // The window is hidden rather than destroyed between opens, and Chromium
        // throttles a hidden renderer — the pushes below would then queue up and
        // only run on the next `show`, leaving an open panel frozen. Keep the
        // renderer awake so every poll lands as it arrives.
        backgroundThrottling: false,
      },
    });

    // Clicking anywhere else dismisses the panel, the way a real popover behaves.
    created.on("blur", () => {
      hide();
    });
    created.webContents.on("did-finish-load", () => {
      push();
    });

    void created.loadFile(htmlPath);
    window = created;

    return created;
  }

  /** Centred on the tray item, hanging just below the menu bar. */
  function position(open: BrowserWindow, bounds: Rectangle): void {
    const x = Math.round(bounds.x + bounds.width / 2 - width / 2);
    const y = Math.round(bounds.y + bounds.height);

    open.setPosition(x, y, false);
  }

  function show(bounds?: Rectangle): void {
    const open = alive() ?? create();

    if (bounds !== undefined) {
      position(open, bounds);
    }

    push();
    open.show();
  }

  function hide(): void {
    alive()?.hide();
  }

  return {
    show,
    hide,
    toggle(bounds?: Rectangle): void {
      if (this.isOpen()) {
        hide();

        return;
      }

      show(bounds);
    },
    isOpen(): boolean {
      return alive()?.isVisible() ?? false;
    },
    setModel(next: PopoverModel): void {
      model = next;
      push();
    },
    destroy(): void {
      alive()?.destroy();
      window = null;
    },
  };
}

/**
 * Makes a left click on the menu bar item open and close the panel.
 *
 * The tray must not have a context menu attached for this to fire — macOS shows
 * the menu instead of reporting the click — so `main.ts` pops the Quit menu on
 * right click and leaves the left button to the popover.
 */
export function bindTrayToPopover(tray: Tray, popover: Popover): void {
  tray.on("click", (_event, bounds) => {
    popover.toggle(bounds);
  });
}
