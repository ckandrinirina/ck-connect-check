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
  DEVICES_WINDOW_HEIGHT,
  DEVICES_WINDOW_WIDTH,
  createDevicesWindow,
} from "../../src/main/devices-window.js";

const electron = vi.hoisted(() => ({
  windows: [] as FakeWindow[],
}));

interface FakeWindow {
  options: Record<string, unknown>;
  destroyed: boolean;
  handlers: Map<string, () => void>;
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

  return { BrowserWindow };
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
