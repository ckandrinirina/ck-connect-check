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

import { BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";

import type { IpcMainEvent, Rectangle, Tray } from "electron";

import type { RouterCredential } from "../hilink/types.js";
import type { PopoverModel } from "./view-model.js";

/** Wide enough for a rate and its unit on one line without wrapping. */
export const POPOVER_WIDTH = 320;

/** Tall enough for the whole layout, so nothing ever scrolls. */
export const POPOVER_HEIGHT = 520;

/** The panel asking for a sync. Renderer → main, and nothing travels back. */
export const POPOVER_SYNC_CHANNEL = "popover:sync";

/** The password prompt's submit, carrying the credential the user typed. */
export const POPOVER_SAVE_PASSWORD_CHANNEL = "popover:save-password";

/** The plan-size field's submit, carrying the characters typed into it. */
export const POPOVER_SET_PLAN_LIMIT_CHANNEL = "popover:set-plan-limit";

/** The plan-length field's submit, carrying the characters typed into it. */
export const POPOVER_SET_PLAN_DAYS_CHANNEL = "popover:set-plan-days";

/** An alternative forfait pressed, carrying the label the carrier gave it. */
export const POPOVER_CHOOSE_FORFAIT_CHANNEL = "popover:choose-forfait";

/**
 * The page, as the build leaves it. `npm run build` copies it and its stylesheet
 * into `dist/renderer/`, and that copy is the one the app loads: a packaged
 * bundle carries `dist/` and drops `src/`, so a path into the source tree would
 * start fine and then fail to find its own page.
 *
 * This module sits two directories deep whether it runs from `src/` under Vitest
 * or from `dist/` after a build, so the same walk reaches `dist/` either way.
 */
function defaultHtmlPath(): string {
  return fileURLToPath(
    new URL("../../dist/renderer/index.html", import.meta.url),
  );
}

/**
 * The compiled preload script, found by the same walk as the page above — `tsc`
 * emits it into `dist/renderer/` beside the compiled renderer.
 */
function defaultPreloadPath(): string {
  return fileURLToPath(
    new URL("../../dist/renderer/preload.cjs", import.meta.url),
  );
}

export interface PopoverOptions {
  /** Path to the page. Injected so tests never touch the filesystem. */
  htmlPath?: string;
  /** Path to the preload bridge. Injected for the same reason. */
  preloadPath?: string;
  width?: number;
  height?: number;
  /** The user pressed Sync. The panel starts nothing itself. */
  onSync?: () => void;
  /** The user submitted the password prompt with a username and a password. */
  onSavePassword?: (credential: RouterCredential) => void;
  /** The user submitted the plan-size field, with whatever they typed into it. */
  onSetPlanLimit?: (value: string) => void;
  /** The user submitted the plan-length field, on the same terms. */
  onSetPlanDays?: (value: string) => void;
  /** The user picked one of the carrier's other forfaits, by its own label. */
  onChooseForfait?: (label: string) => void;
}

/**
 * A credential out of a renderer message, or null when the payload is not one.
 *
 * The page is ours and its CSP lets nothing else run in it, but a channel that
 * reaches the Keychain validates its own input rather than trusting that.
 */
function readCredential(payload: unknown): RouterCredential | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const { username, password } = payload as Record<string, unknown>;

  if (typeof username !== "string" || typeof password !== "string") {
    return null;
  }

  return { username, password };
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
  const preloadPath = options.preloadPath ?? defaultPreloadPath();

  let window: BrowserWindow | null = null;
  let model: PopoverModel | null = null;

  function alive(): BrowserWindow | null {
    return window !== null && !window.isDestroyed() ? window : null;
  }

  /**
   * `ipcMain` is process-wide, so every message is checked against this
   * panel's own page before it is acted on.
   */
  function fromThisPanel(event: IpcMainEvent): boolean {
    const open = alive();

    return open !== null && event.sender === open.webContents;
  }

  function onSyncMessage(event: IpcMainEvent): void {
    if (fromThisPanel(event)) {
      options.onSync?.();
    }
  }

  function onSavePasswordMessage(event: IpcMainEvent, payload: unknown): void {
    if (!fromThisPanel(event)) {
      return;
    }

    const credential = readCredential(payload);

    if (credential !== null) {
      options.onSavePassword?.(credential);
    }
  }

  function onSetPlanLimitMessage(event: IpcMainEvent, payload: unknown): void {
    // A channel that writes to the config validates its own input rather than
    // trusting that only our page can reach it.
    if (fromThisPanel(event) && typeof payload === "string") {
      options.onSetPlanLimit?.(payload);
    }
  }

  function onSetPlanDaysMessage(event: IpcMainEvent, payload: unknown): void {
    if (fromThisPanel(event) && typeof payload === "string") {
      options.onSetPlanDays?.(payload);
    }
  }

  function onChooseForfaitMessage(event: IpcMainEvent, payload: unknown): void {
    if (fromThisPanel(event) && typeof payload === "string") {
      options.onChooseForfait?.(payload);
    }
  }

  ipcMain.on(POPOVER_SYNC_CHANNEL, onSyncMessage);
  ipcMain.on(POPOVER_SAVE_PASSWORD_CHANNEL, onSavePasswordMessage);
  ipcMain.on(POPOVER_SET_PLAN_LIMIT_CHANNEL, onSetPlanLimitMessage);
  ipcMain.on(POPOVER_SET_PLAN_DAYS_CHANNEL, onSetPlanDaysMessage);
  ipcMain.on(POPOVER_CHOOSE_FORFAIT_CHANNEL, onChooseForfaitMessage);

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

  /**
   * Puts the page back on its main view.
   *
   * The window is hidden rather than destroyed between opens, so a panel left
   * on its settings would still be on them the next time the tray item is
   * clicked. The figures are what the panel is opened for; the settings are
   * typed once a month.
   *
   * Rejects while the page is still loading, which is exactly the case where
   * there is nothing to reset — a freshly loaded page opens on the main view.
   */
  function resetView(): void {
    const open = alive();

    if (open === null) {
      return;
    }

    void open.webContents
      .executeJavaScript("window.resetPopoverView?.()")
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
        // The one way the page can talk back: a bridge exposing two sends and
        // nothing else. Without it the panel could render but never sync.
        preload: preloadPath,
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

    // Before the push, so the model lands on the view the user is about to see.
    resetView();
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
      // `ipcMain` outlives the window, so the subscriptions have to be given
      // back explicitly or a destroyed panel keeps answering for the next one.
      ipcMain.removeListener(POPOVER_SYNC_CHANNEL, onSyncMessage);
      ipcMain.removeListener(
        POPOVER_SAVE_PASSWORD_CHANNEL,
        onSavePasswordMessage,
      );
      ipcMain.removeListener(
        POPOVER_SET_PLAN_LIMIT_CHANNEL,
        onSetPlanLimitMessage,
      );
      ipcMain.removeListener(
        POPOVER_SET_PLAN_DAYS_CHANNEL,
        onSetPlanDaysMessage,
      );
      ipcMain.removeListener(
        POPOVER_CHOOSE_FORFAIT_CHANNEL,
        onChooseForfaitMessage,
      );
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
