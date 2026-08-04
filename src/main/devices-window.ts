/**
 * The window listing the devices connected to the router.
 *
 * It is deliberately not a popover. The panel is 320×520 with almost every
 * pixel spent and nothing scrolls in it, so a list of unknown length gets a
 * window of its own: a title bar, an entry in the window list, and a close
 * button that closes the list rather than quitting an app that lives in the
 * menu bar.
 *
 * This file owns the window and the strings that reach it. Where the list comes
 * from is the poll's business (`poller.ts`), and how it is laid out is the
 * page's — exactly the division `popover.ts` and `view-model.ts` keep, with the
 * model small enough to live here rather than in a file of its own.
 */

import { BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";

import type { IpcMainEvent } from "electron";

import {
  deviceAssociatedFor,
  deviceDisplayName,
  listDevices,
  type DeviceBlockRefusal,
  type ListedDevice,
} from "../domain/devices.js";
import type { HostListResult, RouterFailure } from "../hilink/client.js";
import { MAC_FILTER_OFF, type MacFilter } from "../hilink/macfilter.js";

/** Wide enough for a name, an address and a MAC on one line. */
export const DEVICES_WINDOW_WIDTH = 520;

/** Tall enough for a household's worth of devices before anything scrolls. */
export const DEVICES_WINDOW_HEIGHT = 420;

/** The tray menu entry that opens it, shared so the menu and the tests agree. */
export const DEVICES_MENU_LABEL = "Connected devices…";

/** What the title bar reads. */
const DEVICES_WINDOW_TITLE = "Connected devices";

/**
 * The page asking for a device to be blocked or unblocked.
 *
 * The model rides a global on the page because it only ever flows main →
 * renderer. This goes the other way and ends in an authenticated `POST`, so it
 * takes a named channel through a preload bridge, exactly as the panel's own
 * writes do.
 */
export const DEVICES_SET_BLOCKED_CHANNEL = "devices:set-blocked";

/** One press: the device, and the state being asked for. */
export interface DeviceBlockRequest {
  mac: string;
  /** `true` blocks, `false` unblocks. */
  blocked: boolean;
}

/**
 * A block request out of a renderer message, or null when the payload is not
 * one.
 *
 * The page is ours and its CSP lets nothing else run in it, but a channel that
 * reaches the router validates its own input rather than trusting that — the
 * same rule the password channel keeps.
 */
function readBlockRequest(payload: unknown): DeviceBlockRequest | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }

  const { mac, blocked } = payload as Record<string, unknown>;

  if (typeof mac !== "string" || typeof blocked !== "boolean") {
    return null;
  }

  return { mac, blocked };
}

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

/**
 * The compiled preload script, found by the same walk. It is the panel's own —
 * one bridge file serves both pages, each reaching only the sends it uses.
 */
function defaultPreloadPath(): string {
  return fileURLToPath(
    new URL("../../dist/renderer/preload.cjs", import.meta.url),
  );
}

/**
 * One line of the table, already spelled the way it appears on screen.
 *
 * There is no medium column and no active dot, which the window was sketched
 * with: T-62's probe found no band, frequency or medium element in `host-list`
 * and no `Active` element either, and the endpoint reports only the hosts
 * currently associated — so an active dot would be lit on every row it drew.
 * {@link DeviceRow.network} is `AssociatedSsid` shown as itself, which is the
 * one network field the router really sends.
 */
export interface DeviceRow {
  name: string;
  ip: string;
  mac: string;
  network: string;
  /** Empty for a device the router is not reporting; the page says so itself. */
  connectedFor: string;
  /** The domain's verdict over the filter's mode and list, never a lookup. */
  blocked: boolean;
  /** Whether the router reports it as associated right now. */
  present: boolean;
  /**
   * Whether this row is the Mac the app is running on, decided by MAC against
   * the local interfaces. The page withholds the block control on a row that
   * says so: blocking this machine severs the connection the undo would have to
   * travel over, and no confirmation dialog makes that reasonable to offer.
   */
  local: boolean;
}

/**
 * Why a block or unblock changed nothing.
 *
 * The two halves are the vocabularies that already exist, joined rather than
 * replaced: a {@link DeviceBlockRefusal} is settled here before any request
 * goes out, and a {@link RouterFailure} is the router's own word on one that
 * did — including a numeric code nobody has named, carried whole as a
 * `RouterRefusal` with the endpoint that produced it.
 *
 * Every member is either a word or an object with a `kind`, so one `typeof`
 * and one `kind` tell all of them apart. There is deliberately no third
 * vocabulary and no "something went wrong" catch-all: a refusal the window
 * cannot name is exactly the one whose number matters most.
 */
export type DeviceRefusal = DeviceBlockRefusal | RouterFailure;

/**
 * What the window shows, in the three shapes it can be in.
 *
 * One discriminated state rather than a set of flags, because the states are
 * mutually exclusive and a pair of booleans could represent combinations that
 * are not answers to anything:
 *
 * - `listed` with devices is the list. `listed` with none is a genuine answer —
 *   the router says nothing is connected — and the page states it as such.
 * - `offline` is the router not having answered at all, which is a normal state
 *   rendered like the panel's, never an error dialog: the app runs unattended.
 * - `no-password` is nothing having been asked of the router, because there is
 *   nothing to sign in with. It used to arrive as `offline`, which blamed the
 *   router for something the user settles in the panel in ten seconds.
 *
 * {@link DevicesModel.refusal} rides the list rather than replacing it, and
 * that is the point: a write that failed says nothing about which devices are
 * connected, so emptying the table over one would throw away the very thing the
 * window exists to show.
 *
 * The offline *reason* deliberately does not travel, exactly as it does not
 * reach the panel — an unreachable router is one state however it is
 * unreachable. A refusal is not, because someone pressed something.
 */
export type DevicesModel =
  | { state: "listed"; devices: DeviceRow[]; refusal?: DeviceRefusal }
  | { state: "offline" }
  | { state: "no-password" };

/** One device, spelled for the table. */
function rowFor(listed: ListedDevice): DeviceRow {
  const { device } = listed;

  return {
    name: deviceDisplayName(device),
    ip: device.ip,
    mac: device.mac,
    network: device.ssid,
    // A device the router is not reporting has been connected for nothing at
    // all, and "0s" would be a duration it never stated.
    connectedFor: listed.present ? deviceAssociatedFor(device) : "",
    blocked: listed.blocked,
    present: listed.present,
    local: listed.local,
  };
}

/**
 * The window's contents for one reading of the host list and one of the MAC
 * filter.
 *
 * The ordering is the domain's — stable across polls, so a row cannot move
 * under a click — and so are the naming, the duration and the blocked verdict.
 * This function only routes between them.
 *
 * The filter defaults to off, which is the router's own state at rest and the
 * only honest assumption before one has been read: reading it needs the stored
 * password and a second call, so the window must be able to list devices before
 * anything is known about the filter without claiming any of them are blocked.
 *
 * `localMacs` defaults to none for the same kind of reason, and marks no row as
 * this machine. Reading the interfaces belongs to the process that has them —
 * this only routes what it is handed.
 *
 * `refusal` is why the last press changed nothing, and it is attached to the
 * list rather than shown instead of it. A refusal reaching an unreachable
 * router is dropped: "the router is not answering" is the larger and truer
 * statement, and stacking a second complaint on top of it says nothing more.
 */
export function buildDevicesModel(
  result: HostListResult,
  filter: MacFilter = MAC_FILTER_OFF,
  localMacs: readonly string[] = [],
  refusal?: DeviceRefusal,
): DevicesModel {
  if (!result.online) {
    return { state: "offline" };
  }

  const devices = listDevices(result.devices, filter, localMacs).map(rowFor);

  // Written only when there is one, so a model with nothing to complain about
  // is the same object it has always been — and every existing assertion about
  // it goes on meaning what it meant.
  return refusal === undefined
    ? { state: "listed", devices }
    : { state: "listed", devices, refusal };
}

export interface DevicesWindowOptions {
  /** Path to the page. Injected so tests never touch the filesystem. */
  htmlPath?: string;
  /** Path to the preload bridge. Injected for the same reason. */
  preloadPath?: string;
  width?: number;
  height?: number;
  /**
   * The user pressed a row's block control, having confirmed it. The window
   * starts nothing itself — what that costs the router is decided in `main.ts`.
   */
  onSetBlocked?: (request: DeviceBlockRequest) => void;
}

export interface DevicesWindow {
  /** Opens the window, or brings the one that already exists to the front. */
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Hands the page a new list; safe before the window exists and after it goes. */
  setDevices(model: DevicesModel): void;
  destroy(): void;
}

export function createDevicesWindow(
  options: DevicesWindowOptions = {},
): DevicesWindow {
  const width = options.width ?? DEVICES_WINDOW_WIDTH;
  const height = options.height ?? DEVICES_WINDOW_HEIGHT;
  const htmlPath = options.htmlPath ?? defaultHtmlPath();
  const preloadPath = options.preloadPath ?? defaultPreloadPath();

  let window: BrowserWindow | null = null;
  let model: DevicesModel | null = null;

  function alive(): BrowserWindow | null {
    return window !== null && !window.isDestroyed() ? window : null;
  }

  /**
   * `ipcMain` is process-wide, so every message is checked against this
   * window's own page before it is acted on.
   */
  function fromThisWindow(event: IpcMainEvent): boolean {
    const open = alive();

    return open !== null && event.sender === open.webContents;
  }

  function onSetBlockedMessage(event: IpcMainEvent, payload: unknown): void {
    if (!fromThisWindow(event)) {
      return;
    }

    const request = readBlockRequest(payload);

    if (request !== null) {
      options.onSetBlocked?.(request);
    }
  }

  ipcMain.on(DEVICES_SET_BLOCKED_CHANNEL, onSetBlockedMessage);

  /**
   * Pushes the current list into the page. The renderer exposes a single global
   * entry point rather than an IPC channel, for the reason the panel's does:
   * there is one message and it only ever flows main → renderer.
   */
  function push(): void {
    const open = alive();

    if (open === null || model === null) {
      return;
    }

    // Rejects if the page is still loading; `did-finish-load` pushes again.
    void open.webContents
      .executeJavaScript(`window.applyDevicesModel(${JSON.stringify(model)})`)
      .catch(() => undefined);
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
        // The one way the page can talk back: a bridge exposing a single send
        // and nothing else. Without it a row could draw its block control and
        // never be able to press it.
        preload: preloadPath,
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
    // The first push lands while the page is still loading and is rejected, so
    // a freshly opened window would otherwise sit empty until the next poll.
    created.webContents.on("did-finish-load", () => {
      push();
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
      // Before the window is shown, so it appears holding whatever the last
      // poll found rather than filling in a moment later.
      push();
      open.show();
      // A second open is the same window brought forward, never another one.
      open.focus();
    },
    setDevices(next: DevicesModel): void {
      model = next;
      push();
    },
    close(): void {
      alive()?.close();
    },
    isOpen(): boolean {
      return alive() !== null;
    },
    destroy(): void {
      // `ipcMain` outlives the window, so the subscription has to be given back
      // explicitly or a destroyed window keeps answering for the next one.
      ipcMain.removeListener(DEVICES_SET_BLOCKED_CHANNEL, onSetBlockedMessage);
      alive()?.destroy();
      window = null;
    },
  };
}
