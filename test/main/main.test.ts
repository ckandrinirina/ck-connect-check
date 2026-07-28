import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SnapshotResult } from "../../src/hilink/client.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import { startMenuBarApp } from "../../src/main/main.js";
import type { Popover } from "../../src/main/popover.js";
import type { PopoverModel } from "../../src/main/view-model.js";

/** Electron is never loaded for real here — only the surface `main.ts` touches. */
const electron = vi.hoisted(() => ({
  dockHide: vi.fn(),
  setTitle: vi.fn(),
  on: vi.fn(),
  buildFromTemplate: vi.fn((template: unknown) => ({ template })),
}));

vi.mock("electron", () => {
  class Tray {
    setTitle = electron.setTitle;
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    destroy = vi.fn();
    on = electron.on;
  }

  return {
    app: {
      dock: { hide: electron.dockHide },
      on: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
      quit: vi.fn(),
    },
    Menu: { buildFromTemplate: electron.buildFromTemplate },
    Tray,
    nativeImage: { createEmpty: vi.fn(() => ({ empty: true })) },
  };
});

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

const READING: SnapshotResult = {
  online: true,
  snapshot: snapshot(5_830_718_387),
};

const OFFLINE: SnapshotResult = { online: false, reason: "unreachable" };

/** A reading whose live download rate is `rateBps` — one point on the sparkline. */
function readingAt(rateBps: number): SnapshotResult {
  const taken = snapshot(5_830_718_387);

  return {
    online: true,
    snapshot: {
      ...taken,
      traffic: { ...taken.traffic, downloadRateBps: rateBps },
    },
  };
}

/** A client that walks a scripted list of poll outcomes, then stays offline. */
function scriptedClient(results: readonly SnapshotResult[]) {
  let index = 0;

  return {
    snapshot: () => Promise.resolve(results[index++] ?? OFFLINE),
  };
}

interface RecordingPopover extends Popover {
  /** Every model pushed to the panel, in order. */
  models: PopoverModel[];
}

/**
 * Stands in for the real panel so the model reaching the renderer is
 * observable without an Electron window.
 */
function recordingPopover(): RecordingPopover {
  let visible = false;

  const popover: RecordingPopover = {
    models: [],
    show: () => {
      visible = true;
    },
    hide: () => {
      visible = false;
    },
    toggle: () => {
      visible = !visible;
    },
    isOpen: () => visible,
    setModel: (model) => {
      popover.models.push(model);
    },
    destroy: () => {
      visible = false;
    },
  };

  return popover;
}

/** The model most recently pushed to the panel. */
function latest(popover: RecordingPopover): PopoverModel {
  return popover.models[popover.models.length - 1];
}

/**
 * The left-click handler `main.ts` hangs off the tray — the only way a user
 * opens or closes the panel, and so the only honest way to drive it here.
 */
function clickTray(): void {
  const registered = electron.on.mock.calls.find(
    ([event]) => event === "click",
  );

  if (registered === undefined) {
    throw new Error("no tray click handler was registered");
  }

  (registered[1] as (event: unknown, bounds: unknown) => void)(
    {},
    { x: 0, y: 0, width: 24, height: 22 },
  );
}

/** A client that answers every poll and counts how often it was asked. */
function countingClient(): {
  snapshot: () => Promise<SnapshotResult>;
  calls: number;
} {
  const client = {
    calls: 0,
    snapshot: (): Promise<SnapshotResult> => {
      client.calls += 1;

      return Promise.resolve(READING);
    },
  };

  return client;
}

/** A config path that does not exist — `loadConfig` falls back to the defaults. */
const MISSING_CONFIG = join(tmpdir(), "ck-connect-check-absent", "config.json");

describe("startMenuBarApp", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.dockHide.mockClear();
    electron.setTitle.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hides the Dock icon so the app exists only in the menu bar", () => {
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: { snapshot: () => Promise.resolve(READING) },
    });

    expect(electron.dockHide).toHaveBeenCalledTimes(1);
    app.stop();
  });

  it("shows the poller title in the menu bar as readings arrive", async () => {
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: { snapshot: () => Promise.resolve(READING) },
    });

    await vi.advanceTimersByTimeAsync(0);

    // No plan limit in the default config, so the used total stands alone.
    expect(electron.setTitle).toHaveBeenCalledWith("5.8Go");
    app.stop();
  });
});

/** The default poll interval, so each advance is exactly one more poll. */
const POLL_MS = 30_000;

describe("startMenuBarApp — the throughput history", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("records one sample per successful poll, oldest first", async () => {
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: scriptedClient([readingAt(1_000), readingAt(2_000)]),
      popover,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(latest(popover).history.download).toEqual([1_000, 2_000]);
    app.stop();
  });

  it("records no sample for an offline poll — a gap is not a zero", async () => {
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: scriptedClient([readingAt(1_000), OFFLINE, readingAt(2_000)]),
      popover,
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_MS);
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(latest(popover).history.download).toEqual([1_000, 2_000]);
    app.stop();
  });

  it("keeps the history when the panel is closed and opened again", async () => {
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: scriptedClient([readingAt(1_000), readingAt(2_000)]),
      popover,
    });

    await vi.advanceTimersByTimeAsync(0);

    // The panel is a view of the history, not its owner: opening and closing
    // it must not throw away what has been recorded.
    popover.show();
    popover.hide();

    await vi.advanceTimersByTimeAsync(POLL_MS);
    popover.show();

    expect(latest(popover).history.download).toEqual([1_000, 2_000]);
    app.stop();
  });
});

/** The default active interval — one poll per two seconds while the panel is up. */
const ACTIVE_MS = 2_000;

describe("startMenuBarApp — polling while the panel is open", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls at the active interval while the panel is open", async () => {
    const client = countingClient();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client,
      popover: recordingPopover(),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(client.calls).toBe(1);

    clickTray();
    await vi.advanceTimersByTimeAsync(0);

    // Opening reads straight away rather than waiting out the 30 second timer.
    expect(client.calls).toBe(2);

    await vi.advanceTimersByTimeAsync(ACTIVE_MS * 3);
    expect(client.calls).toBe(5);

    app.stop();
  });

  it("returns to the idle interval once the panel is shut", async () => {
    const client = countingClient();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client,
      popover: recordingPopover(),
    });

    await vi.advanceTimersByTimeAsync(0);

    clickTray();
    await vi.advanceTimersByTimeAsync(ACTIVE_MS * 2);
    expect(client.calls).toBe(4);

    clickTray();
    const shut = client.calls;

    await vi.advanceTimersByTimeAsync(ACTIVE_MS * 3);
    expect(client.calls).toBe(shut);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(client.calls).toBe(shut + 1);

    app.stop();
  });

  it("leaves the active interval when the panel closes itself", async () => {
    const popover = recordingPopover();
    const client = countingClient();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client,
      popover,
    });

    await vi.advanceTimersByTimeAsync(0);
    clickTray();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.calls).toBe(2);

    // A click anywhere else dismisses the panel from inside, without the tray
    // ever hearing about it.
    popover.hide();

    await vi.advanceTimersByTimeAsync(ACTIVE_MS);
    const settled = client.calls;

    await vi.advanceTimersByTimeAsync(ACTIVE_MS * 3);
    expect(client.calls).toBe(settled);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(client.calls).toBe(settled + 1);

    app.stop();
  });
});
