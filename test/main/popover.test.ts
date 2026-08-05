import type { Rectangle, Tray } from "electron";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "../../src/config/defaults.js";
import {
  POPOVER_CHOOSE_FORFAIT_CHANNEL,
  POPOVER_HEIGHT,
  POPOVER_SAVE_PASSWORD_CHANNEL,
  POPOVER_SET_BLOCKED_CHANNEL,
  POPOVER_SET_TAB_CHANNEL,
  POPOVER_SYNC_CHANNEL,
  POPOVER_WIDTH,
  bindTrayToPopover,
  createPopover,
} from "../../src/main/popover.js";
import {
  buildPopoverModel,
  type DevicesModel,
  type PopoverModel,
} from "../../src/main/view-model.js";

import type { RouterSnapshot } from "../../src/hilink/types.js";

/**
 * Electron is never loaded for real. The fake window records the constructor
 * options and the handlers `popover.ts` registers, so window shape and
 * open/close behaviour can both be asserted without a screen.
 */
const electron = vi.hoisted(() => ({
  windows: [] as FakeWindow[],
  /** Every `ipcMain.on` subscription still registered, by channel. */
  channels: new Map<string, Set<(...args: unknown[]) => void>>(),
}));

interface FakeWindow {
  options: Record<string, unknown>;
  visible: boolean;
  destroyed: boolean;
  handlers: Map<string, () => void>;
  loadFile: ReturnType<typeof vi.fn>;
  setPosition: ReturnType<typeof vi.fn>;
  webContents: {
    executeJavaScript: ReturnType<typeof vi.fn>;
    on: (event: string, handler: () => void) => void;
    handlers: Map<string, () => void>;
  };
  on(event: string, handler: () => void): void;
  show(): void;
  hide(): void;
  isVisible(): boolean;
  isDestroyed(): boolean;
  destroy(): void;
}

vi.mock("electron", () => {
  class BrowserWindow {
    options: Record<string, unknown>;
    visible = false;
    destroyed = false;
    handlers = new Map<string, () => void>();
    loadFile = vi.fn(() => Promise.resolve());
    setPosition = vi.fn();
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

    show() {
      this.visible = true;
    }

    hide() {
      this.visible = false;
    }

    isVisible() {
      return this.visible;
    }

    isDestroyed() {
      return this.destroyed;
    }

    destroy() {
      this.destroyed = true;
      this.visible = false;
    }
  }

  /**
   * A stand-in for `ipcMain`: the renderer never runs here, so a "message"
   * is this suite calling the handler `popover.ts` registered, with the sender
   * it chooses.
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

const TRAY_BOUNDS: Rectangle = { x: 900, y: 0, width: 40, height: 24 };

/** A stand-in for the real `Tray`; only the `click` subscription is exercised. */
function fakeTray(): { tray: Tray; click(bounds: Rectangle): void } {
  let listener: ((event: unknown, bounds: Rectangle) => void) | null = null;

  return {
    tray: {
      on(event: string, handler: (event: unknown, bounds: Rectangle) => void) {
        if (event === "click") {
          listener = handler;
        }
        return this;
      },
    } as unknown as Tray,
    click(bounds: Rectangle) {
      listener?.({}, bounds);
    },
  };
}

function lastWindow(): FakeWindow {
  const window = electron.windows.at(-1);

  if (window === undefined) {
    throw new Error("no popover window was created");
  }

  return window;
}

const GB = 1_000_000_000;

function snapshot(usedBytes: number): RouterSnapshot {
  return {
    month: {
      monthDownloadBytes: usedBytes,
      monthUploadBytes: 0,
      monthDurationSeconds: 27_960,
      monthLastClearTime: "2026-7-27",
    },
    traffic: {
      downloadRateBps: 0,
      uploadRateBps: 0,
      connectTimeSeconds: 27_960,
    },
    status: {
      connected: true,
      signalBars: 4,
      maxSignalBars: 5,
      connectedDevices: 3,
      networkTypeCode: 101,
    },
    carrier: { carrier: "Yas", id: "yas" },
    billing: { startDay: 1, routerDataLimitBytes: 0, warnThresholdPercent: 90 },
  };
}

/**
 * Two readings apart, so one pushed payload can be told from the one before it.
 * The cap and the anchor are what give the model a consumed figure at all.
 */
function modelUsing(usedBytes: number): PopoverModel {
  return buildPopoverModel({
    result: { online: true, snapshot: snapshot(usedBytes) },
    lastReading: null,
    config: {
      ...defaultConfig(),
      planLimitBytes: 20 * GB,
      allowanceAnchor: {
        planLabel: "NET MONTH 200 000",
        remainingBytes: 20 * GB - usedBytes,
        expiresAt: null,
        routerMonthBytes: usedBytes,
        routerClearTime: "2026-7-27",
        syncedAt: new Date(2026, 6, 27, 10, 0, 0),
      },
    },
  });
}

/**
 * The model the page was last handed, read back out of the injected script.
 *
 * Picked out by name rather than taken as the last call: the panel pushes the
 * device list and the selected pane down the same channel, so "the last script"
 * stopped meaning "the last model" once there was more than one kind.
 */
function lastPushed(window: FakeWindow): PopoverModel {
  const script = (
    window.webContents.executeJavaScript.mock.calls as [string][]
  )
    .map(([source]) => source)
    .filter((source) => source.startsWith("window.applyPopoverModel("))
    .at(-1);

  if (script === undefined) {
    throw new Error("no model was pushed to the page");
  }

  return JSON.parse(
    script.slice(script.indexOf("(") + 1, script.lastIndexOf(")")),
  ) as PopoverModel;
}

describe("createPopover", () => {
  beforeEach(() => {
    electron.windows.length = 0;
  });

  it("creates the window frameless, non-resizable and out of the app switcher", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    expect(lastWindow().options).toMatchObject({
      frame: false,
      resizable: false,
      skipTaskbar: true,
    });

    popover.destroy();
  });

  it("does not open a window until it is first shown", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });

    expect(electron.windows).toHaveLength(0);

    popover.destroy();
  });

  it("opens on the first tray click and closes on the second", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    const { tray, click } = fakeTray();
    bindTrayToPopover(tray, popover);

    click(TRAY_BOUNDS);
    expect(popover.isOpen()).toBe(true);

    click(TRAY_BOUNDS);
    expect(popover.isOpen()).toBe(false);

    click(TRAY_BOUNDS);
    expect(popover.isOpen()).toBe(true);

    popover.destroy();
  });

  it("closes when the window loses focus", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    const blur = lastWindow().handlers.get("blur");
    expect(blur).toBeTypeOf("function");

    blur?.();
    expect(popover.isOpen()).toBe(false);

    popover.destroy();
  });

  it("positions itself under the tray item it was clicked from", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html", width: 320 });
    popover.show(TRAY_BOUNDS);

    // Centred on the tray item, hanging just below the menu bar.
    expect(lastWindow().setPosition).toHaveBeenCalledWith(760, 24, false);

    popover.destroy();
  });

  it("hands the current model to the page rather than letting it compute anything", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.setModel(
      buildPopoverModel({
        result: null,
        lastReading: null,
        config: defaultConfig(),
      }),
    );
    popover.show(TRAY_BOUNDS);

    const window = lastWindow();
    window.webContents.handlers.get("did-finish-load")?.();

    const [script] = window.webContents.executeJavaScript.mock.calls.at(-1) as [
      string,
    ];
    expect(script).toContain("applyPopoverModel");
    expect(script).toContain('"stale":true');

    popover.destroy();
  });

  it("keeps the renderer unthrottled so a hidden panel still applies pushes", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    expect(lastWindow().options["webPreferences"]).toMatchObject({
      backgroundThrottling: false,
    });

    popover.destroy();
  });

  it("pushes into a hidden window instead of waiting for the next open", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    const window = lastWindow();
    window.webContents.handlers.get("did-finish-load")?.();
    popover.hide();
    window.webContents.executeJavaScript.mockClear();

    const model = modelUsing(9 * GB);
    popover.setModel(model);

    expect(window.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
    expect(lastPushed(window)).toEqual(model);

    popover.destroy();
  });

  it("remembers a model set before the window exists and pushes it on load", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    const model = modelUsing(5 * GB);

    expect(() => {
      popover.setModel(model);
    }).not.toThrow();
    expect(electron.windows).toHaveLength(0);

    popover.show(TRAY_BOUNDS);

    const window = lastWindow();
    window.webContents.executeJavaScript.mockClear();
    window.webContents.handlers.get("did-finish-load")?.();

    expect(lastPushed(window)).toEqual(model);

    popover.destroy();
  });

  it("pushes twice for two updates in a row rather than swallowing the second", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    const window = lastWindow();
    window.webContents.handlers.get("did-finish-load")?.();
    window.webContents.executeJavaScript.mockClear();

    popover.setModel(modelUsing(9 * GB));
    popover.setModel(modelUsing(11 * GB));

    expect(window.webContents.executeJavaScript).toHaveBeenCalledTimes(2);

    popover.destroy();
  });

  it("pushes the newest model, never a stale one", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    const window = lastWindow();
    window.webContents.handlers.get("did-finish-load")?.();

    popover.setModel(modelUsing(9 * GB));

    const newest = modelUsing(11 * GB);
    popover.setModel(newest);

    expect(lastPushed(window)).toEqual(newest);
    expect(lastPushed(window).monthTotal).not.toBe(
      modelUsing(9 * GB).monthTotal,
    );

    popover.destroy();
  });

  it("keeps the window the size the page is laid out to fit", () => {
    // The panel was compacted to fit this window rather than the window grown
    // to fit the panel: a popover that closes on blur cannot usefully scroll,
    // and a taller one would hang further down the screen every open.
    expect(POPOVER_WIDTH).toBe(320);
    expect(POPOVER_HEIGHT).toBe(520);

    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    expect(lastWindow().options).toMatchObject({ width: 320, height: 520 });

    popover.destroy();
  });

  it("puts the page back on its main view every time it is opened", () => {
    // The window is hidden rather than destroyed between opens, so a panel
    // left on the settings would still be on them the next time the tray item
    // is clicked — and the figures are what the panel is opened for.
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    const window = lastWindow();
    window.webContents.handlers.get("did-finish-load")?.();
    popover.hide();
    window.webContents.executeJavaScript.mockClear();

    popover.show(TRAY_BOUNDS);

    const scripts = window.webContents.executeJavaScript.mock.calls.map(
      (call) => (call as [string])[0],
    );

    expect(scripts.some((script) => script.includes("resetPopoverView"))).toBe(
      true,
    );

    popover.destroy();
  });

  it("releases the window when destroyed", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);
    const window = lastWindow();

    popover.destroy();

    expect(window.isDestroyed()).toBe(true);
    expect(popover.isOpen()).toBe(false);
  });
});

/** Delivers one renderer message on `channel`, as `sender` sent it. */
function send(channel: string, sender: unknown, payload?: unknown): void {
  for (const handler of electron.channels.get(channel) ?? []) {
    handler({ sender }, payload);
  }
}

describe("createPopover — the panel talking back", () => {
  beforeEach(() => {
    electron.windows.length = 0;
    electron.channels.clear();
  });

  it("gives the page a preload bridge rather than leaving it isolated", () => {
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      preloadPath: "/tmp/preload.cjs",
    });
    popover.show(TRAY_BOUNDS);

    expect(lastWindow().options["webPreferences"]).toMatchObject({
      preload: "/tmp/preload.cjs",
      contextIsolation: true,
      nodeIntegration: false,
    });

    popover.destroy();
  });

  it("loads the page from the build output, not from the source tree", () => {
    // A packaged app carries `dist/` and drops `src/`, so a default that walks
    // into `src/renderer/` starts fine and then cannot find its own page.
    const popover = createPopover();
    popover.show(TRAY_BOUNDS);

    const loaded = lastWindow().loadFile.mock.calls[0]?.[0] as string;
    expect(loaded).toContain("dist/renderer/index.html");
    expect(loaded).not.toContain("src/renderer");

    popover.destroy();
  });

  it("reports a Sync press from its own page exactly once", () => {
    const onSync = vi.fn();
    const popover = createPopover({ htmlPath: "/tmp/index.html", onSync });
    popover.show(TRAY_BOUNDS);

    send(POPOVER_SYNC_CHANNEL, lastWindow().webContents);

    expect(onSync).toHaveBeenCalledTimes(1);

    popover.destroy();
  });

  it("ignores a Sync press that did not come from its own page", () => {
    const onSync = vi.fn();
    const popover = createPopover({ htmlPath: "/tmp/index.html", onSync });
    popover.show(TRAY_BOUNDS);

    send(POPOVER_SYNC_CHANNEL, { someone: "else" });

    expect(onSync).not.toHaveBeenCalled();

    popover.destroy();
  });

  it("hands the entered credential on rather than the raw payload", () => {
    const onSavePassword = vi.fn();
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      onSavePassword,
    });
    popover.show(TRAY_BOUNDS);

    send(POPOVER_SAVE_PASSWORD_CHANNEL, lastWindow().webContents, {
      username: "admin",
      password: "hunter2",
      extra: "ignored",
    });

    expect(onSavePassword).toHaveBeenCalledWith({
      username: "admin",
      password: "hunter2",
    });

    popover.destroy();
  });

  it("drops a credential message that is not a username and a password", () => {
    const onSavePassword = vi.fn();
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      onSavePassword,
    });
    popover.show(TRAY_BOUNDS);

    const sender = lastWindow().webContents;

    send(POPOVER_SAVE_PASSWORD_CHANNEL, sender, "hunter2");
    send(POPOVER_SAVE_PASSWORD_CHANNEL, sender, { username: "admin" });
    send(POPOVER_SAVE_PASSWORD_CHANNEL, sender, null);

    expect(onSavePassword).not.toHaveBeenCalled();

    popover.destroy();
  });

  it("passes a chosen forfait label on as the page sent it", () => {
    const onChooseForfait = vi.fn();
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      onChooseForfait,
    });
    popover.show(TRAY_BOUNDS);

    send(
      POPOVER_CHOOSE_FORFAIT_CHANNEL,
      lastWindow().webContents,
      "Pass Internet 5 Go",
    );

    expect(onChooseForfait).toHaveBeenCalledWith("Pass Internet 5 Go");

    popover.destroy();
  });

  it("drops a forfait message that is not a label", () => {
    // A channel that writes to the config validates its own input rather than
    // trusting that only our page can reach it.
    const onChooseForfait = vi.fn();
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      onChooseForfait,
    });
    popover.show(TRAY_BOUNDS);

    const sender = lastWindow().webContents;

    send(POPOVER_CHOOSE_FORFAIT_CHANNEL, sender, 42);
    send(POPOVER_CHOOSE_FORFAIT_CHANNEL, sender, null);
    send(POPOVER_CHOOSE_FORFAIT_CHANNEL, { someone: "else" }, "Wifiber Go+");

    expect(onChooseForfait).not.toHaveBeenCalled();

    popover.destroy();
  });

  it("stops listening once the panel is destroyed", () => {
    const onSync = vi.fn();
    const popover = createPopover({ htmlPath: "/tmp/index.html", onSync });
    popover.show(TRAY_BOUNDS);

    const sender = lastWindow().webContents;
    popover.destroy();

    send(POPOVER_SYNC_CHANNEL, sender);

    expect(onSync).not.toHaveBeenCalled();
  });
});

/**
 * A block pressed on the panel.
 *
 * The channel is the one T-68 built and the validation is the one it wrote;
 * only the bridge it arrives on has moved, from the devices page's preload to
 * the panel's own. Which window sent it was never what made it safe — the
 * check against this panel's page and the payload validation are, and both are
 * still here.
 */
describe("createPopover — a device blocked from the panel", () => {
  beforeEach(() => {
    electron.windows.length = 0;
    electron.channels.clear();
  });

  it("reports a block pressed on its own page", () => {
    const onSetBlocked = vi.fn();
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      onSetBlocked,
    });
    popover.show(TRAY_BOUNDS);

    send(POPOVER_SET_BLOCKED_CHANNEL, lastWindow().webContents, {
      mac: "A2:00:5E:00:00:01",
      blocked: true,
    });

    expect(onSetBlocked).toHaveBeenCalledOnce();
    expect(onSetBlocked).toHaveBeenCalledWith({
      mac: "A2:00:5E:00:00:01",
      blocked: true,
    });

    popover.destroy();
  });

  it("reports an unblock as the other half of the same press", () => {
    const onSetBlocked = vi.fn();
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      onSetBlocked,
    });
    popover.show(TRAY_BOUNDS);

    send(POPOVER_SET_BLOCKED_CHANNEL, lastWindow().webContents, {
      mac: "00:1A:2B:00:00:02",
      blocked: false,
    });

    expect(onSetBlocked).toHaveBeenCalledOnce();
    expect(onSetBlocked).toHaveBeenCalledWith({
      mac: "00:1A:2B:00:00:02",
      blocked: false,
    });

    popover.destroy();
  });

  it("drops a message whose payload is not a MAC and a state", () => {
    const onSetBlocked = vi.fn();
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      onSetBlocked,
    });
    popover.show(TRAY_BOUNDS);

    const sender = lastWindow().webContents;

    // The page is ours and its CSP lets nothing else run in it, but a channel
    // that ends in an authenticated `POST` to the router validates its own
    // input rather than trusting that.
    for (const payload of [
      undefined,
      null,
      "A2:00:5E:00:00:01",
      { mac: "A2:00:5E:00:00:01" },
      { mac: 12, blocked: true },
      { mac: "A2:00:5E:00:00:01", blocked: "yes" },
      { blocked: true },
    ]) {
      send(POPOVER_SET_BLOCKED_CHANNEL, sender, payload);
    }

    expect(onSetBlocked).not.toHaveBeenCalled();

    popover.destroy();
  });

  it("ignores a press that did not come from its own page", () => {
    const onSetBlocked = vi.fn();
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      onSetBlocked,
    });
    popover.show(TRAY_BOUNDS);

    // `ipcMain` is process-wide, and this channel reaches the router.
    send(
      POPOVER_SET_BLOCKED_CHANNEL,
      { someone: "else" },
      { mac: "A2:00:5E:00:00:01", blocked: true },
    );

    expect(onSetBlocked).not.toHaveBeenCalled();

    popover.destroy();
  });

  it("stops listening for presses once the panel is destroyed", () => {
    const onSetBlocked = vi.fn();
    const popover = createPopover({
      htmlPath: "/tmp/index.html",
      onSetBlocked,
    });
    popover.show(TRAY_BOUNDS);

    const sender = lastWindow().webContents;
    popover.destroy();

    send(POPOVER_SET_BLOCKED_CHANNEL, sender, {
      mac: "A2:00:5E:00:00:01",
      blocked: true,
    });

    expect(onSetBlocked).not.toHaveBeenCalled();
  });
});

/**
 * The list on its way to the page.
 *
 * It rides its own entry point rather than the figures' one because it arrives
 * on its own schedule: the figures land every couple of seconds, and the list
 * only while the Devices tab is the visible one.
 */
describe("createPopover — the device list it pushes", () => {
  beforeEach(() => {
    electron.windows.length = 0;
    electron.channels.clear();
  });

  const LISTED: DevicesModel = {
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
        local: false,
      },
    ],
  };

  it("hands the list to the page on its own entry point", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);
    popover.setDevices(LISTED);

    const pushed = lastWindow().webContents.executeJavaScript.mock.calls.map(
      (call: unknown[]) => String(call[0]),
    );

    expect(
      pushed.some((script: string) =>
        script.startsWith("window.applyDevicesModel("),
      ),
    ).toBe(true);
    expect(pushed.join("\n")).toContain("A2:00:5E:00:00:01");

    popover.destroy();
  });

  it("remembers a list set before the window exists and pushes it on load", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });

    popover.setDevices(LISTED);
    popover.show(TRAY_BOUNDS);

    const pushed = lastWindow().webContents.executeJavaScript.mock.calls.map(
      (call: unknown[]) => String(call[0]),
    );

    expect(
      pushed.some((script: string) =>
        script.startsWith("window.applyDevicesModel("),
      ),
    ).toBe(true);

    popover.destroy();
  });

  it("pushes the newest list, never a stale one", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    popover.setDevices(LISTED);
    popover.setDevices({ state: "no-password" });

    const pushed = lastWindow()
      .webContents.executeJavaScript.mock.calls.map((call: unknown[]) =>
        String(call[0]),
      )
      .filter((script: string) =>
        script.startsWith("window.applyDevicesModel("),
      );

    expect(pushed.at(-1)).toContain("no-password");

    popover.destroy();
  });
});

/**
 * Which pane the page is showing, reported to the main process.
 *
 * The tab is the page's own state — the user chose it, and a poll landing every
 * couple of seconds must not snatch it back. But the poll needs to know it: the
 * `host-list` request is authenticated and costs a login, and a panel on Usage
 * is not looking at a device list. So the page says which pane it moved to, and
 * this file remembers the last thing it said.
 */
describe("createPopover — which pane the page is showing", () => {
  beforeEach(() => {
    electron.windows.length = 0;
    electron.channels.clear();
  });

  it("starts on Usage, the pane the page itself opens on", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });

    // Before any window exists, and before the page has said anything: the
    // honest answer is the one the markup ships with.
    expect(popover.visibleTab()).toBe("usage");

    popover.destroy();
  });

  it("follows the pane the page says it moved to", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    send(POPOVER_SET_TAB_CHANNEL, lastWindow().webContents, "devices");

    expect(popover.visibleTab()).toBe("devices");

    send(POPOVER_SET_TAB_CHANNEL, lastWindow().webContents, "usage");

    expect(popover.visibleTab()).toBe("usage");

    popover.destroy();
  });

  it("ignores a pane name it does not know", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    const sender = lastWindow().webContents;

    send(POPOVER_SET_TAB_CHANNEL, sender, "devices");

    for (const payload of [undefined, null, 42, "settings", { tab: "usage" }]) {
      send(POPOVER_SET_TAB_CHANNEL, sender, payload);
    }

    // The last thing the page actually said still stands. Falling back to
    // Usage on a payload nobody understands would stand the list down under a
    // user who is looking straight at it.
    expect(popover.visibleTab()).toBe("devices");

    popover.destroy();
  });

  it("ignores a pane reported by anything but its own page", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    send(POPOVER_SET_TAB_CHANNEL, { someone: "else" }, "devices");

    expect(popover.visibleTab()).toBe("usage");

    popover.destroy();
  });

  it("stops listening for the pane once the panel is destroyed", () => {
    const popover = createPopover({ htmlPath: "/tmp/index.html" });
    popover.show(TRAY_BOUNDS);

    const sender = lastWindow().webContents;
    popover.destroy();

    send(POPOVER_SET_TAB_CHANNEL, sender, "devices");

    expect(popover.visibleTab()).toBe("usage");
  });
});
