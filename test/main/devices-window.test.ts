/**
 * The connected-devices window, exercised without an Electron runtime.
 *
 * The panel is a popover — frameless, fixed and dismissed on blur — and this is
 * deliberately the opposite: a normal window the user manages. The fake below
 * records the constructor options and the handlers `devices-window.ts`
 * registers, so window shape, single-instance opening and the close behaviour
 * can all be asserted without a screen.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEVICES_SET_BLOCKED_CHANNEL,
  DEVICES_WINDOW_HEIGHT,
  DEVICES_WINDOW_WIDTH,
  buildDevicesModel,
  createDevicesWindow,
  type DeviceBlockRequest,
} from "../../src/main/devices-window.js";
import type { Device } from "../../src/hilink/devices.js";
import type { MacFilter } from "../../src/hilink/macfilter.js";

const electron = vi.hoisted(() => ({
  windows: [] as FakeWindow[],
  /** Every `ipcMain.on` subscription still registered, by channel. */
  channels: new Map<string, Set<(...args: unknown[]) => void>>(),
}));

interface FakeWindow {
  options: Record<string, unknown>;
  destroyed: boolean;
  handlers: Map<string, () => void>;
  webContents: {
    handlers: Map<string, () => void>;
    executeJavaScript: ReturnType<typeof vi.fn>;
  };
  loadFile: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  show: ReturnType<typeof vi.fn>;
  close(): void;
  isDestroyed(): boolean;
  destroy(): void;
}

vi.mock("electron", () => {
  class BrowserWindow {
    options: Record<string, unknown>;
    destroyed = false;
    handlers = new Map<string, () => void>();
    loadFile = vi.fn(() => Promise.resolve());
    setSize = vi.fn();
    focus = vi.fn();
    show = vi.fn();
    webContents = {
      handlers: new Map<string, () => void>(),
      executeJavaScript: vi.fn(() => Promise.resolve()),
      on(event: string, handler: () => void) {
        this.handlers.set(event, handler);
      },
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      electron.windows.push(this as unknown as FakeWindow);
    }

    on(event: string, handler: () => void) {
      this.handlers.set(event, handler);
    }

    /** What the title bar's close button does: the window is gone for good. */
    close() {
      this.destroyed = true;
      this.handlers.get("closed")?.();
    }

    isDestroyed() {
      return this.destroyed;
    }

    destroy() {
      this.destroyed = true;
    }
  }

  /**
   * A stand-in for `ipcMain`: the renderer never runs here, so a "press" is
   * this suite calling the handler `devices-window.ts` registered, with the
   * sender it chooses.
   */
  const ipcMain = {
    on(channel: string, handler: (...args: unknown[]) => void) {
      const listeners =
        electron.channels.get(channel) ??
        new Set<(...args: unknown[]) => void>();

      listeners.add(handler);
      electron.channels.set(channel, listeners);

      return ipcMain;
    },
    removeListener(channel: string, handler: (...args: unknown[]) => void) {
      electron.channels.get(channel)?.delete(handler);

      return ipcMain;
    },
  };

  return { BrowserWindow, ipcMain };
});

function lastWindow(): FakeWindow {
  const window = electron.windows.at(-1);

  if (window === undefined) {
    throw new Error("no devices window was created");
  }

  return window;
}

function readRendererFile(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../src/renderer/${name}`, import.meta.url)),
    "utf8",
  );
}

/** The `content` of a page's Content-Security-Policy meta tag. */
function contentSecurityPolicy(page: string): string {
  const meta =
    /http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]*)"/.exec(page);

  if (meta?.[1] === undefined) {
    throw new Error("the page declares no Content-Security-Policy");
  }

  return meta[1].replace(/\s+/g, " ").trim();
}

describe("createDevicesWindow", () => {
  beforeEach(() => {
    electron.windows.length = 0;
  });

  it("opens a normal window with a title bar and a place in the window list", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });
    devices.open();

    // The opposite of the popover on every count: this one is managed by the
    // user, so it has a frame, it resizes and it is not hidden from the switcher.
    expect(lastWindow().options).toMatchObject({
      frame: true,
      resizable: true,
      skipTaskbar: false,
    });

    devices.destroy();
  });

  it("keeps the renderer unthrottled so pushed updates are not queued", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });
    devices.open();

    // The list is pushed from the main process, and Chromium defers work in a
    // renderer it thinks nobody is watching — the same reason the panel needs it.
    expect(lastWindow().options["webPreferences"]).toMatchObject({
      backgroundThrottling: false,
      contextIsolation: true,
      nodeIntegration: false,
    });

    devices.destroy();
  });

  it("renders under the same policy as the panel, so nothing remote can load", () => {
    expect(contentSecurityPolicy(readRendererFile("devices.html"))).toBe(
      contentSecurityPolicy(readRendererFile("index.html")),
    );
    expect(contentSecurityPolicy(readRendererFile("devices.html"))).toContain(
      "default-src 'none'",
    );
  });

  it("does not open a window until it is first asked to", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });

    expect(electron.windows).toHaveLength(0);

    devices.destroy();
  });

  it("focuses the window it already has instead of opening a second", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });

    devices.open();
    devices.open();
    devices.open();

    expect(electron.windows).toHaveLength(1);
    expect(lastWindow().focus).toHaveBeenCalled();

    devices.destroy();
  });

  it("opens a fresh window once the user has closed the last one", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });

    devices.open();
    lastWindow().close();

    expect(devices.isOpen()).toBe(false);

    devices.open();

    expect(electron.windows).toHaveLength(2);
    expect(devices.isOpen()).toBe(true);

    devices.destroy();
  });

  it("restores the stated default size on every open rather than remembering one", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });

    devices.open();
    const window = lastWindow();

    expect(window.setSize).toHaveBeenLastCalledWith(
      DEVICES_WINDOW_WIDTH,
      DEVICES_WINDOW_HEIGHT,
    );

    // Whatever the user dragged it to is not carried into the next open: no
    // size is stored anywhere, so every open starts from the same figures.
    window.setSize.mockClear();
    devices.open();

    expect(window.setSize).toHaveBeenCalledWith(
      DEVICES_WINDOW_WIDTH,
      DEVICES_WINDOW_HEIGHT,
    );

    devices.destroy();
  });

  it("states a default size rather than leaving it to Electron", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });
    devices.open();

    expect(lastWindow().options).toMatchObject({
      width: DEVICES_WINDOW_WIDTH,
      height: DEVICES_WINDOW_HEIGHT,
    });

    devices.destroy();
  });

  it("loads the page from the build output, not from the source tree", () => {
    // A packaged app carries `dist/` and drops `src/`, so a default that walks
    // into `src/renderer/` starts fine and then cannot find its own page — the
    // same trap T-22 found under the panel.
    const devices = createDevicesWindow();
    devices.open();

    const loaded = lastWindow().loadFile.mock.calls[0]?.[0] as string;
    expect(loaded).toContain("dist/renderer/devices.html");
    expect(loaded).not.toContain("src/renderer");

    devices.destroy();
  });

  it("closes on request without destroying anything the app still needs", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });
    devices.open();
    const window = lastWindow();

    devices.close();

    expect(window.isDestroyed()).toBe(true);
    expect(devices.isOpen()).toBe(false);

    devices.destroy();
  });

  it("survives a close it was not told about", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });
    devices.open();
    lastWindow().close();

    expect(() => {
      devices.close();
      devices.destroy();
    }).not.toThrow();
  });

  it("releases the window when destroyed", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });
    devices.open();
    const window = lastWindow();

    devices.destroy();

    expect(window.isDestroyed()).toBe(true);
    expect(devices.isOpen()).toBe(false);
  });
});

function device(overrides: Partial<Device> = {}): Device {
  return {
    mac: "A2:00:5E:00:00:01",
    ip: "192.168.8.100",
    name: "MacBookPro",
    ssid: "HUAWEI-B310-XXXX",
    associatedSeconds: 21_125,
    ...overrides,
  };
}

/** Every script the window has run in its page, in order. */
function pushedScripts(): string[] {
  return lastWindow().webContents.executeJavaScript.mock.calls.map(
    (call) => call[0] as string,
  );
}

/** A filter in one mode, remembering the addresses given. */
function macFilter(
  mode: MacFilter["mode"],
  ...entries: { mac: string; name: string }[]
): MacFilter {
  return { mode, entries, ssids: [] };
}

describe("buildDevicesModel", () => {
  it("spells one row per device, the way the window reads them", () => {
    const model = buildDevicesModel({ online: true, devices: [device()] });

    expect(model).toEqual({
      state: "listed",
      devices: [
        {
          name: "MacBookPro",
          ip: "192.168.8.100",
          mac: "A2:00:5E:00:00:01",
          network: "HUAWEI-B310-XXXX",
          connectedFor: "5h 52m",
          blocked: false,
          present: true,
        },
      ],
    });
  });

  it("reads every device as allowed when no filter has been read yet", () => {
    // The filter needs the password and a second call; until one has landed the
    // window states what it knows rather than guessing at a block.
    const model = buildDevicesModel({ online: true, devices: [device()] });

    expect(
      model.state === "listed" ? model.devices.map((one) => one.blocked) : [],
    ).toEqual([false]);
  });

  it("marks a blacklisted device blocked in the row it spells", () => {
    const model = buildDevicesModel(
      { online: true, devices: [device()] },
      macFilter("blacklist", { mac: "a2-00-5e-00-00-01", name: "" }),
    );

    expect(
      model.state === "listed" ? model.devices[0]?.blocked : undefined,
    ).toBe(true);
  });

  it("spells a remembered but absent device as a row of its own", () => {
    const model = buildDevicesModel(
      { online: true, devices: [] },
      macFilter("blacklist", { mac: "A6:00:5E:00:00:03", name: "iPad" }),
    );

    expect(model).toEqual({
      state: "listed",
      devices: [
        {
          name: "iPad",
          ip: "",
          mac: "A6:00:5E:00:00:03",
          network: "",
          connectedFor: "",
          blocked: true,
          present: false,
        },
      ],
    });
  });

  it("falls back to the MAC for a host the router named nothing", () => {
    const model = buildDevicesModel({
      online: true,
      devices: [device({ name: "" })],
    });

    expect(model).toEqual({
      state: "listed",
      devices: [expect.objectContaining({ name: "A2:00:5E:00:00:01" })],
    });
  });

  it("puts the devices in the domain's stable order", () => {
    const model = buildDevicesModel({
      online: true,
      devices: [device(), device({ mac: "00:1A:2B:00:00:02", name: "iPad" })],
    });

    expect(
      model.state === "listed" ? model.devices.map((one) => one.name) : [],
    ).toEqual(["iPad", "MacBookPro"]);
  });

  it("states an empty list as a list of no devices", () => {
    expect(buildDevicesModel({ online: true, devices: [] })).toEqual({
      state: "listed",
      devices: [],
    });
  });

  it("states an unreachable router as offline, never as an empty list", () => {
    // The reason never reaches the page: unreachable is a normal state, and the
    // panel's own model drops it for the same reason.
    expect(buildDevicesModel({ online: false, reason: "unreachable" })).toEqual(
      { state: "offline" },
    );
    expect(buildDevicesModel({ online: false, reason: "timeout" })).toEqual({
      state: "offline",
    });
  });
});

describe("createDevicesWindow — pushing the list", () => {
  beforeEach(() => {
    electron.windows.length = 0;
  });

  it("hands the page the model it was given", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });
    devices.open();

    devices.setDevices({ state: "listed", devices: [] });

    expect(pushedScripts().at(-1)).toBe(
      'window.applyDevicesModel({"state":"listed","devices":[]})',
    );

    devices.destroy();
  });

  it("pushes again once the page has finished loading", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });
    devices.open();
    devices.setDevices({ state: "offline" });

    const window = lastWindow();
    window.webContents.executeJavaScript.mockClear();
    window.webContents.handlers.get("did-finish-load")?.();

    // The first push lands while the page is still loading and is rejected;
    // without this one an opened window would sit empty until the next poll.
    expect(pushedScripts().at(-1)).toBe(
      'window.applyDevicesModel({"state":"offline"})',
    );

    devices.destroy();
  });

  it("pushes the last model into a window opened after it arrived", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });

    // A poll can land before the user has ever opened the window.
    expect(() => devices.setDevices({ state: "offline" })).not.toThrow();

    devices.open();

    expect(pushedScripts().at(-1)).toBe(
      'window.applyDevicesModel({"state":"offline"})',
    );

    devices.destroy();
  });

  it("pushes nothing into a window the user has closed", () => {
    const devices = createDevicesWindow({ htmlPath: "/tmp/devices.html" });
    devices.open();
    const window = lastWindow();
    window.close();

    expect(() => devices.setDevices({ state: "offline" })).not.toThrow();
    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();

    devices.destroy();
  });
});

/** Delivers a message on a channel, as `ipcMain` would. */
function send(channel: string, sender: unknown, payload?: unknown): void {
  for (const handler of electron.channels.get(channel) ?? []) {
    handler({ sender }, payload);
  }
}

/**
 * The press that reaches the main process.
 *
 * Unlike the model, which only ever flows main → renderer and rides a global on
 * the page, a block travels the other way and touches the router — so it goes
 * over a named channel through a preload bridge, exactly as the panel's own
 * writes do, and every message is checked against this window's own page.
 */
describe("createDevicesWindow — a block pressed in the page", () => {
  beforeEach(() => {
    electron.windows.length = 0;
    electron.channels.clear();
  });

  it("gives the page a bridge to talk back through", () => {
    const devices = createDevicesWindow({
      htmlPath: "/tmp/devices.html",
      preloadPath: "/tmp/preload.cjs",
    });
    devices.open();

    // Without a preload the page could render the control and never send it.
    expect(lastWindow().options["webPreferences"]).toMatchObject({
      preload: "/tmp/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
    });

    devices.destroy();
  });

  it("forwards a press from its own page", () => {
    const pressed: DeviceBlockRequest[] = [];
    const devices = createDevicesWindow({
      htmlPath: "/tmp/devices.html",
      onSetBlocked: (request) => pressed.push(request),
    });
    devices.open();

    send(DEVICES_SET_BLOCKED_CHANNEL, lastWindow().webContents, {
      mac: "A2:00:5E:00:00:01",
      blocked: true,
    });

    expect(pressed).toEqual([{ mac: "A2:00:5E:00:00:01", blocked: true }]);

    devices.destroy();
  });

  it("forwards an unblock as the other half of the same press", () => {
    const pressed: DeviceBlockRequest[] = [];
    const devices = createDevicesWindow({
      htmlPath: "/tmp/devices.html",
      onSetBlocked: (request) => pressed.push(request),
    });
    devices.open();

    send(DEVICES_SET_BLOCKED_CHANNEL, lastWindow().webContents, {
      mac: "00:1A:2B:00:00:02",
      blocked: false,
    });

    expect(pressed).toEqual([{ mac: "00:1A:2B:00:00:02", blocked: false }]);

    devices.destroy();
  });

  it("ignores a message from anywhere but its own page", () => {
    const pressed: DeviceBlockRequest[] = [];
    const devices = createDevicesWindow({
      htmlPath: "/tmp/devices.html",
      onSetBlocked: (request) => pressed.push(request),
    });
    devices.open();

    // `ipcMain` is process-wide, and this channel reaches the router.
    send(
      DEVICES_SET_BLOCKED_CHANNEL,
      { notThisWindow: true },
      {
        mac: "A2:00:5E:00:00:01",
        blocked: true,
      },
    );

    expect(pressed).toEqual([]);

    devices.destroy();
  });

  it("ignores a payload that is not a block request", () => {
    const pressed: DeviceBlockRequest[] = [];
    const devices = createDevicesWindow({
      htmlPath: "/tmp/devices.html",
      onSetBlocked: (request) => pressed.push(request),
    });
    devices.open();
    const sender = lastWindow().webContents;

    for (const payload of [
      undefined,
      null,
      "A2:00:5E:00:00:01",
      { mac: "A2:00:5E:00:00:01" },
      { mac: 12, blocked: true },
      { mac: "A2:00:5E:00:00:01", blocked: "yes" },
      { blocked: true },
    ]) {
      send(DEVICES_SET_BLOCKED_CHANNEL, sender, payload);
    }

    expect(pressed).toEqual([]);

    devices.destroy();
  });

  it("ignores a press arriving before the window exists", () => {
    const pressed: DeviceBlockRequest[] = [];
    const devices = createDevicesWindow({
      htmlPath: "/tmp/devices.html",
      onSetBlocked: (request) => pressed.push(request),
    });

    send(
      DEVICES_SET_BLOCKED_CHANNEL,
      {},
      {
        mac: "A2:00:5E:00:00:01",
        blocked: true,
      },
    );

    expect(pressed).toEqual([]);

    devices.destroy();
  });

  it("gives its subscription back when destroyed", () => {
    const pressed: DeviceBlockRequest[] = [];
    const devices = createDevicesWindow({
      htmlPath: "/tmp/devices.html",
      onSetBlocked: (request) => pressed.push(request),
    });
    devices.open();
    const sender = lastWindow().webContents;

    devices.destroy();
    send(DEVICES_SET_BLOCKED_CHANNEL, sender, {
      mac: "A2:00:5E:00:00:01",
      blocked: true,
    });

    // `ipcMain` outlives the window, so a destroyed one that kept answering
    // would act for the next.
    expect(pressed).toEqual([]);
    expect(electron.channels.get(DEVICES_SET_BLOCKED_CHANNEL)?.size ?? 0).toBe(
      0,
    );
  });
});
