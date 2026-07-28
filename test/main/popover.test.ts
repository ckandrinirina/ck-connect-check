import type { Rectangle, Tray } from "electron";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { defaultConfig } from "../../src/config/defaults.js";
import {
  POPOVER_SAVE_PASSWORD_CHANNEL,
  POPOVER_SYNC_CHANNEL,
  bindTrayToPopover,
  createPopover,
} from "../../src/main/popover.js";
import {
  buildPopoverModel,
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
    },
    carrier: { carrier: "Yas" },
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

/** The model the page was last handed, read back out of the injected script. */
function lastPushed(window: FakeWindow): PopoverModel {
  const call = window.webContents.executeJavaScript.mock.calls.at(-1);

  if (call === undefined) {
    throw new Error("nothing was pushed to the page");
  }

  const [script] = call as [string];

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
