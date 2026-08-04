import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AllowanceResult,
  SnapshotResult,
} from "../../src/hilink/client.js";
import type {
  Allowance,
  RouterCredential,
  RouterSnapshot,
} from "../../src/hilink/types.js";
import { defaultConfig } from "../../src/config/defaults.js";
import { startMenuBarApp, type MenuBarApp } from "../../src/main/main.js";
import type { AllowanceSource, CredentialStore } from "../../src/main/sync.js";
import { NO_TRAY_VALUE } from "../../src/main/tray.js";
import { trayImageFor } from "../../src/main/tray-icon.js";
import type { Popover } from "../../src/main/popover.js";
import type { PopoverModel } from "../../src/main/view-model.js";

/** Electron is never loaded for real here — only the surface `main.ts` touches. */
const electron = vi.hoisted(() => ({
  dockHide: vi.fn(),
  setTitle: vi.fn(),
  setImage: vi.fn(),
  on: vi.fn(),
  buildFromTemplate: vi.fn((template: unknown) => ({ template })),
  createEmpty: vi.fn(() => ({ empty: true })),
  createFromPath: vi.fn((path: string) => ({
    path,
    setTemplateImage: vi.fn(),
  })),
  /** The image each `new Tray(…)` was constructed with, in order. */
  trayImages: [] as unknown[],
}));

vi.mock("electron", () => {
  class Tray {
    setTitle = electron.setTitle;
    setImage = electron.setImage;
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    destroy = vi.fn();
    on = electron.on;

    constructor(image: unknown) {
      electron.trayImages.push(image);
    }
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
    nativeImage: {
      createEmpty: electron.createEmpty,
      createFromPath: electron.createFromPath,
    },
    // The panel's own channels are exercised in `test/main/popover.test.ts`;
    // here they only have to exist, for the tests that let `main.ts` build a
    // real popover.
    ipcMain: { on: vi.fn(), removeListener: vi.fn() },
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
      networkTypeCode: 101,
    },
    carrier: { carrier: "Yas", id: "yas" },
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

    // A default config has neither a plan limit nor an anchor, so there is no
    // share to report — and the router's own counter is not a substitute for it.
    expect(electron.setTitle).toHaveBeenCalledWith(NO_TRAY_VALUE);
    app.stop();
  });
});

/** A reading whose router reports `signalBars` out of five. */
function readingWithSignal(signalBars: number): SnapshotResult {
  const taken = snapshot(5_830_718_387);

  return {
    online: true,
    snapshot: { ...taken, status: { ...taken.status, signalBars } },
  };
}

/** The path of the image last handed to `tray.setImage`. */
function lastTrayImagePath(): string {
  const calls = electron.setImage.mock.calls;

  return (
    (calls[calls.length - 1]?.[0] as { path: string } | undefined)?.path ?? ""
  );
}

/** The default poll interval, so each advance is exactly one more poll. */
const POLL_MS = 30_000;

describe("startMenuBarApp — the menu bar glyph", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.setImage.mockClear();
    electron.createEmpty.mockClear();
    electron.trayImages.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds the tray from a real glyph, not an empty image", () => {
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: { snapshot: () => Promise.resolve(READING) },
    });

    // A tray created from an empty image shows a bare number with nothing
    // identifying it as this app.
    expect(electron.createEmpty).not.toHaveBeenCalled();
    expect((electron.trayImages[0] as { path?: string }).path).toBe(
      trayImageFor(0),
    );
    app.stop();
  });

  it("follows the signal level the router reports", async () => {
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: scriptedClient([readingWithSignal(5), readingWithSignal(3)]),
    });

    await vi.advanceTimersByTimeAsync(0);
    expect(lastTrayImagePath()).toBe(trayImageFor(4));

    await vi.advanceTimersByTimeAsync(POLL_MS);
    expect(lastTrayImagePath()).toBe(trayImageFor(2));

    app.stop();
  });

  it("shows no bars while the router is unreachable", async () => {
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: scriptedClient([readingWithSignal(5), OFFLINE]),
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_MS);

    // The title already says `offline`; a glyph still claiming five bars would
    // contradict it.
    expect(lastTrayImagePath()).toBe(trayImageFor(0));
    app.stop();
  });

  it("reassigns the image only when the level changes", async () => {
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: scriptedClient([readingWithSignal(5), readingWithSignal(5)]),
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(electron.setImage).toHaveBeenCalledTimes(1);
    app.stop();
  });
});

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

const CREDENTIAL: RouterCredential = { username: "admin", password: "hunter2" };

const CARRIER_ALLOWANCE: Allowance = {
  planLabel: "NET MONTH 200 000",
  remainingBytes: 145_835_900_000,
  expiresAt: new Date(2026, 7, 12),
};

/** A fresh config directory per test, so one sync's anchor never leaks into another. */
function scratchConfig(): string {
  return join(mkdtempSync(join(tmpdir(), "ck-connect-check-")), "config.json");
}

/** A credential store backed by a variable rather than by the Keychain. */
function storeHolding(credential: RouterCredential | null): CredentialStore {
  let held = credential;

  return {
    load: () => held,
    save: (entered) => {
      held = entered;

      return { ok: true };
    },
  };
}

/** A router whose USSD answer is scripted, and which counts every dialogue. */
function allowanceRouter(
  answer: () => Promise<AllowanceResult>,
): AllowanceSource & { dialogues: number } {
  const router = {
    dialogues: 0,
    login: () => Promise.resolve({ ok: true as const }),
    readAllowance: () => {
      router.dialogues += 1;

      return answer();
    },
    logout: () => Promise.resolve(),
  };

  return router;
}

describe("startMenuBarApp — the allowance sync", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("never repeats a dialogue from the poll timer, however long it runs", async () => {
    const router = allowanceRouter(() =>
      Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
    );
    const app = startMenuBarApp({
      configPath: scratchConfig(),
      client: countingClient(),
      popover: recordingPopover(),
      allowance: router,
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);

    // An empty config earns exactly one automatic dialogue at launch. After
    // that the USSD channel belongs to the Sync button and to nothing else —
    // the poll timer must never turn into a carrier dialogue on a schedule.
    expect(router.dialogues).toBe(1);

    app.stop();
  });

  it("anchors the carrier's figure and shows it in the panel", async () => {
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath: scratchConfig(),
      client: countingClient(),
      popover,
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    await app.sync();

    expect(latest(popover).allowance.remaining).toBe("145.84 Go");
    // The stored instant is the midnight *ending* the last valid day, so an
    // allowance expiring at midnight on the 12th is valid through the 11th.
    expect(latest(popover).allowance.expires).toBe("11/08/2026");
    expect(latest(popover).sync.busy).toBe(false);

    app.stop();
  });

  it("writes the anchor to the config so it survives a quit", async () => {
    const configPath = scratchConfig();
    const app = startMenuBarApp({
      configPath,
      client: countingClient(),
      popover: recordingPopover(),
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    await app.sync();

    const written = JSON.parse(readFileSync(configPath, "utf8")) as {
      allowanceAnchor?: { remainingBytes: number };
      planTotalBytes?: number;
    };

    expect(written.allowanceAnchor?.remainingBytes).toBe(145_835_900_000);

    // The high-water total is not written any more: with one anchor it equalled
    // that anchor's own remaining, which pinned the dial to 0%.
    expect(written).not.toHaveProperty("planTotalBytes");

    app.stop();
  });

  it("keeps polling while a dialogue is in flight, so the panel never freezes", async () => {
    const popover = recordingPopover();
    let release = (): void => undefined;
    const pending = new Promise<AllowanceResult>((resolve) => {
      release = () => resolve({ ok: false, reason: "timeout" });
    });
    const app = startMenuBarApp({
      configPath: scratchConfig(),
      client: scriptedClient([
        readingAt(1_000),
        readingAt(2_000),
        readingAt(3_000),
      ]),
      popover,
      allowance: allowanceRouter(() => pending),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);

    const running = app.sync();
    await vi.advanceTimersByTimeAsync(0);

    expect(latest(popover).sync.busy).toBe(true);

    await vi.advanceTimersByTimeAsync(POLL_MS);
    await vi.advanceTimersByTimeAsync(POLL_MS);

    // The sparklines and the dial are still being fed while the sync waits.
    expect(latest(popover).history.download).toEqual([1_000, 2_000, 3_000]);
    expect(latest(popover).sync.busy).toBe(true);

    release();
    await running;
    app.stop();
  });

  it("asks for a password instead of dialling when none is stored", async () => {
    const popover = recordingPopover();
    const router = allowanceRouter(() =>
      Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
    );
    const app = startMenuBarApp({
      configPath: scratchConfig(),
      client: countingClient(),
      popover,
      allowance: router,
      credentials: storeHolding(null),
    });

    await vi.advanceTimersByTimeAsync(0);
    await app.sync();

    expect(latest(popover).sync.needsPassword).toBe(true);
    expect(router.dialogues).toBe(0);

    app.stop();
  });

  it("renders the reason when the carrier dialogue fails", async () => {
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath: scratchConfig(),
      client: countingClient(),
      popover,
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: false, reason: "busy" }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    await app.sync();

    expect(latest(popover).sync.status).toMatch(/busy/i);
    expect(latest(popover).allowance.available).toBe(false);

    app.stop();
  });

  it("logs the code and the endpoint the router refused with", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const app = startMenuBarApp({
      configPath: scratchConfig(),
      client: countingClient(),
      popover: recordingPopover(),
      allowance: allowanceRouter(() =>
        Promise.resolve({
          ok: false,
          reason: {
            kind: "error",
            source: "api",
            code: 111019,
            endpoint: "/api/ussd/get",
          },
        }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    await app.sync();

    // The panel can be dismissed; the log is what survives to be read back.
    const logged = warn.mock.calls.map(([line]) => String(line)).join("\n");

    expect(logged).toMatch(/111019/);
    expect(logged).toMatch(/\/api\/ussd\/get/);

    warn.mockRestore();
    app.stop();
  });

  it("logs nothing about a code for a failure that carries none", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const app = startMenuBarApp({
      configPath: scratchConfig(),
      client: countingClient(),
      popover: recordingPopover(),
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: false, reason: "busy" }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    await app.sync();

    const logged = warn.mock.calls.map(([line]) => String(line)).join("\n");

    expect(logged).not.toMatch(/code/i);

    warn.mockRestore();
    app.stop();
  });
});

/** The router's clear time in {@link READING}, so an anchor can match or differ. */
const READING_CLEAR_TIME = "2026-7-27";

/** An anchor whose arithmetic still holds against {@link READING}. */
const HEALTHY_ANCHOR = {
  planLabel: "NET MONTH 200 000",
  remainingBytes: 145_835_900_000,
  expiresAt: new Date(2099, 0, 1).toISOString(),
  routerMonthBytes: 1_000_000_000,
  routerClearTime: READING_CLEAR_TIME,
  syncedAt: new Date(2026, 6, 27, 10, 0, 0).toISOString(),
};

/** A config file holding `anchor`, or none at all when it is null. */
function configHolding(anchor: Record<string, unknown> | null): string {
  const configPath = scratchConfig();

  writeFileSync(
    configPath,
    JSON.stringify({
      ...defaultConfig(),
      ...(anchor === null ? {} : { allowanceAnchor: anchor }),
    }),
  );

  return configPath;
}

describe("startMenuBarApp — setting the plan limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** What the config file on disk holds now. */
  function storedLimit(configPath: string): unknown {
    return (
      JSON.parse(readFileSync(configPath, "utf8")) as {
        planLimitBytes?: unknown;
      }
    ).planLimitBytes;
  }

  it("stores a typed plan size as bytes, not as the figure typed", async () => {
    const configPath = configHolding(null);
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath,
      client: countingClient(),
      popover,
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    app.setPlanLimit("150");

    expect(storedLimit(configPath)).toBe(150_000_000_000);

    app.stop();
  });

  it("shows the new cap on the dial without the renderer computing it", async () => {
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath: configHolding(HEALTHY_ANCHOR),
      client: countingClient(),
      popover,
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(latest(popover).progress.available).toBe(false);

    app.setPlanLimit("150");

    expect(latest(popover).progress.available).toBe(true);
    expect(latest(popover).planLimit.value).toBe("150");

    app.stop();
  });

  it("writes nothing and says why when the entry cannot be read", async () => {
    const configPath = configHolding(null);
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath,
      client: countingClient(),
      popover,
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);

    for (const entry of ["", "abc", "0", "-5"]) {
      app.setPlanLimit(entry);

      expect(storedLimit(configPath), entry).toBeNull();
      expect(latest(popover).planLimit.error, entry).not.toBe("");
    }

    app.stop();
  });

  it("clears the complaint once a good value follows a bad one", async () => {
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath: configHolding(null),
      client: countingClient(),
      popover,
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    app.setPlanLimit("nonsense");
    app.setPlanLimit("150");

    expect(latest(popover).planLimit.error).toBe("");

    app.stop();
  });

  it("keeps the cap across a restart", async () => {
    const configPath = configHolding(null);
    const first = startMenuBarApp({
      configPath,
      client: countingClient(),
      popover: recordingPopover(),
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    first.setPlanLimit("150");
    first.stop();

    const popover = recordingPopover();
    const second = startMenuBarApp({
      configPath,
      client: countingClient(),
      popover,
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(latest(popover).planLimit.value).toBe("150");

    second.stop();
  });
});

describe("startMenuBarApp — confirming the cap after a new plan", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A config holding a cap, an anchor, and the state of the confirmation flag. */
  function configUnconfirming(
    planLimitBytes: number | null,
    planCapConfirmed: boolean,
  ): string {
    const configPath = scratchConfig();

    writeFileSync(
      configPath,
      JSON.stringify({
        ...defaultConfig(),
        planLimitBytes,
        planCapConfirmed,
        allowanceAnchor: HEALTHY_ANCHOR,
      }),
    );

    return configPath;
  }

  /** Whether the file on disk still calls the cap confirmed. */
  function storedFlag(configPath: string): unknown {
    return (
      JSON.parse(readFileSync(configPath, "utf8")) as {
        planCapConfirmed?: unknown;
      }
    ).planCapConfirmed;
  }

  function appOn(
    configPath: string,
    popover: ReturnType<typeof recordingPopover>,
  ): ReturnType<typeof startMenuBarApp> {
    return startMenuBarApp({
      configPath,
      client: countingClient(),
      popover,
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });
  }

  it("puts the dial back the moment the cap is submitted", async () => {
    const configPath = configUnconfirming(150_000_000_000, false);
    const popover = recordingPopover();
    const app = appOn(configPath, popover);

    await vi.advanceTimersByTimeAsync(0);

    expect(latest(popover).progress.available).toBe(false);
    expect(latest(popover).planCapPrompt).not.toBeNull();

    app.setPlanLimit("150");

    // The same model build: one click, and the dial and the prompt swap over.
    expect(latest(popover).progress.available).toBe(true);
    expect(latest(popover).planCapPrompt).toBeNull();
    expect(storedFlag(configPath)).toBe(true);

    app.stop();
  });

  it("counts an unchanged size as a confirmation, so it costs one click", async () => {
    const configPath = configUnconfirming(150_000_000_000, false);
    const popover = recordingPopover();
    const app = appOn(configPath, popover);

    await vi.advanceTimersByTimeAsync(0);
    // Exactly what the panel's confirm button re-submits: the stored cap.
    app.setPlanLimit(latest(popover).planLimit.value);

    expect(latest(popover).planCapPrompt).toBeNull();
    expect(storedFlag(configPath)).toBe(true);

    app.stop();
  });

  it("clears the flag when a sync brings back a plan the cap cannot describe", async () => {
    // A 50 Go cap against the 145.8 Go the carrier reports left.
    const configPath = configUnconfirming(50_000_000_000, true);
    const popover = recordingPopover();
    const app = appOn(configPath, popover);

    await vi.advanceTimersByTimeAsync(0);
    await app.sync();

    expect(storedFlag(configPath)).toBe(false);
    expect(latest(popover).planCapPrompt).not.toBeNull();

    app.stop();
  });

  it("leaves the flag alone when the sync brings back the same plan", async () => {
    const configPath = configUnconfirming(200_000_000_000, true);
    const popover = recordingPopover();
    const app = appOn(configPath, popover);

    await vi.advanceTimersByTimeAsync(0);
    await app.sync();

    expect(storedFlag(configPath)).toBe(true);
    expect(latest(popover).planCapPrompt).toBeNull();

    app.stop();
  });
});

describe("startMenuBarApp — setting the plan length", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** What the config file on disk holds now. */
  function storedDays(configPath: string): unknown {
    return (
      JSON.parse(readFileSync(configPath, "utf8")) as { planDays?: unknown }
    ).planDays;
  }

  /** Launches against `configPath` and lets the first poll settle. */
  async function launched(configPath: string): Promise<{
    app: MenuBarApp;
    popover: RecordingPopover;
  }> {
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath,
      client: countingClient(),
      popover,
      allowance: allowanceRouter(() =>
        Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
      ),
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);

    return { app, popover };
  }

  it("stores a typed plan length as whole days", async () => {
    const configPath = configHolding(null);
    const { app } = await launched(configPath);

    app.setPlanDays("30");

    expect(storedDays(configPath)).toBe(30);

    app.stop();
  });

  it("writes nothing and says why when the entry cannot be read", async () => {
    const configPath = configHolding(null);
    const { app, popover } = await launched(configPath);

    for (const entry of ["", "abc", "0", "-5", "30.5"]) {
      app.setPlanDays(entry);

      // A blank submission must leave the stored value exactly as it was.
      expect(storedDays(configPath), entry).toBeNull();
      expect(latest(popover).planDays.error, entry).not.toBe("");
    }

    app.stop();
  });

  it("leaves a stored length untouched when a later entry is refused", async () => {
    const configPath = configHolding(null);
    const { app } = await launched(configPath);

    app.setPlanDays("30");
    app.setPlanDays("");

    expect(storedDays(configPath)).toBe(30);

    app.stop();
  });

  it("clears the complaint once a good value follows a bad one", async () => {
    const { app, popover } = await launched(configHolding(null));

    app.setPlanDays("nonsense");
    app.setPlanDays("30");

    expect(latest(popover).planDays.error).toBe("");

    app.stop();
  });

  it("keeps the length across a restart", async () => {
    const configPath = configHolding(null);
    const first = await launched(configPath);

    first.app.setPlanDays("30");
    first.app.stop();

    const second = await launched(configPath);

    expect(latest(second.popover).planDays.value).toBe("30");

    second.app.stop();
  });
});

describe("startMenuBarApp — syncing by itself", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Launches against `configPath` and lets the first poll settle. */
  async function launched(
    configPath: string,
    credential: RouterCredential | null = CREDENTIAL,
    answer: () => Promise<AllowanceResult> = () =>
      Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
  ): Promise<{
    router: AllowanceSource & { dialogues: number };
    popover: RecordingPopover;
    app: MenuBarApp;
  }> {
    const router = allowanceRouter(answer);
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath,
      client: countingClient(),
      popover,
      allowance: router,
      credentials: storeHolding(credential),
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    return { router, popover, app };
  }

  it("dials the carrier at launch when nothing has ever been synced", async () => {
    const { router, app } = await launched(configHolding(null));

    expect(router.dialogues).toBe(1);

    app.stop();
  });

  it("dials at launch when the stored allowance has expired", async () => {
    const { router, app } = await launched(
      configHolding({
        ...HEALTHY_ANCHOR,
        expiresAt: new Date(2020, 0, 1).toISOString(),
      }),
    );

    expect(router.dialogues).toBe(1);

    app.stop();
  });

  it("dials at launch when the router's counter has been reset under the anchor", async () => {
    const { router, app } = await launched(
      configHolding({ ...HEALTHY_ANCHOR, routerClearTime: "2026-8-1" }),
    );

    expect(router.dialogues).toBe(1);

    app.stop();
  });

  it("stays quiet when the stored allowance still holds", async () => {
    // A dialogue costs tens of seconds and a login against a device that locks
    // the account after five refusals. A healthy anchor is carried forward.
    const { router, popover, app } = await launched(
      configHolding(HEALTHY_ANCHOR),
    );

    expect(router.dialogues).toBe(0);
    expect(latest(popover).allowance.available).toBe(true);

    app.stop();
  });

  it("asks for a password rather than dialling when none is stored", async () => {
    const { router, popover, app } = await launched(configHolding(null), null);

    expect(router.dialogues).toBe(0);
    expect(latest(popover).sync.needsPassword).toBe(true);

    app.stop();
  });

  it("waits for a first successful reading, so there is a counter to pin against", async () => {
    const router = allowanceRouter(() =>
      Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
    );
    const app = startMenuBarApp({
      configPath: configHolding(null),
      client: scriptedClient([OFFLINE, OFFLINE]),
      popover: recordingPopover(),
      allowance: router,
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(router.dialogues).toBe(0);

    app.stop();
  });

  it("reports a failed automatic sync exactly as a failed press, and tries once", async () => {
    const { router, popover, app } = await launched(
      configHolding(null),
      CREDENTIAL,
      () => Promise.resolve({ ok: false, reason: "busy" }),
    );

    expect(latest(popover).sync.status).toMatch(/busy/i);

    // Never retried on a timer: the account locks after five refused sign-ins.
    await vi.advanceTimersByTimeAsync(POLL_MS * 10);
    expect(router.dialogues).toBe(1);

    app.stop();
  });

  it("refuses a manual press while the automatic dialogue is still running", async () => {
    let release = (): void => undefined;
    const pending = new Promise<AllowanceResult>((resolve) => {
      release = () => {
        resolve({ ok: true, allowance: CARRIER_ALLOWANCE });
      };
    });
    const router = allowanceRouter(() => pending);
    const app = startMenuBarApp({
      configPath: configHolding(null),
      client: countingClient(),
      popover: recordingPopover(),
      allowance: router,
      credentials: storeHolding(CREDENTIAL),
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
    await app.sync();

    // The modem has one USSD channel; the existing busy guard is what protects it.
    expect(router.dialogues).toBe(1);

    release();
    await vi.advanceTimersByTimeAsync(0);
    app.stop();
  });
});

describe("startMenuBarApp — re-syncing on open and after a long silence", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** An anchor synced `minutesAgo`, whose arithmetic otherwise still holds. */
  function anchorSynced(minutesAgo: number): Record<string, unknown> {
    return {
      ...HEALTHY_ANCHOR,
      syncedAt: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    };
  }

  /** Launches against `anchor` and lets the first poll settle. */
  async function launched(
    anchor: Record<string, unknown>,
    options: {
      credential?: RouterCredential | null;
      answer?: () => Promise<AllowanceResult>;
      client?: { snapshot: () => Promise<SnapshotResult> };
    } = {},
  ): Promise<{
    router: AllowanceSource & { dialogues: number };
    popover: RecordingPopover;
    app: MenuBarApp;
  }> {
    const router = allowanceRouter(
      options.answer ??
        (() => Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE })),
    );
    const popover = recordingPopover();
    const app = startMenuBarApp({
      configPath: configHolding(anchor),
      client: options.client ?? countingClient(),
      popover,
      allowance: router,
      credentials: storeHolding(
        options.credential === undefined ? CREDENTIAL : options.credential,
      ),
    });

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    return { router, popover, app };
  }

  /** Opens the panel the way a user does, and lets the dialogue settle. */
  async function openPanel(): Promise<void> {
    clickTray();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);
  }

  it("dials once when the panel is opened on a stale anchor", async () => {
    const { router, app } = await launched(anchorSynced(31));

    expect(router.dialogues).toBe(0);

    await openPanel();

    expect(router.dialogues).toBe(1);

    app.stop();
  });

  it("dials nothing when the panel is opened on a fresh one", async () => {
    const { router, app } = await launched(anchorSynced(29));

    await openPanel();

    expect(router.dialogues).toBe(0);

    app.stop();
  });

  it("dials once for a stale anchor with the panel never opened", async () => {
    const { router, app } = await launched(anchorSynced(31));

    await vi.advanceTimersByTimeAsync(60_000);

    expect(router.dialogues).toBe(1);

    app.stop();
  });

  it("dials once in total when the panel is opened twice in one stale window", async () => {
    const { router, app } = await launched(anchorSynced(31));

    await openPanel();
    // Closed and opened again: the anchor is fresh now, so nothing follows.
    await openPanel();
    await openPanel();

    expect(router.dialogues).toBe(1);

    app.stop();
  });

  it("never joins a dialogue already in flight", async () => {
    let release = (): void => undefined;
    const pending = new Promise<AllowanceResult>((resolve) => {
      release = () => {
        resolve({ ok: true, allowance: CARRIER_ALLOWANCE });
      };
    });
    const { router, app } = await launched(anchorSynced(31), {
      answer: () => pending,
    });

    await openPanel();
    await vi.advanceTimersByTimeAsync(60_000 * 3);

    expect(router.dialogues).toBe(1);

    release();
    app.stop();
  });

  it("tries once when the automatic dialogue fails, however long it stays stale", async () => {
    const { router, app } = await launched(anchorSynced(31), {
      answer: () => Promise.resolve({ ok: false, reason: "busy" }),
    });

    await openPanel();

    expect(router.dialogues).toBe(1);

    await vi.advanceTimersByTimeAsync(60_000 * 10);
    await openPanel();

    expect(router.dialogues).toBe(1);

    app.stop();
  });

  it("lets an explicit press through after that failure, and re-arms on success", async () => {
    let answer: AllowanceResult = { ok: false, reason: "busy" };
    const { router, app } = await launched(anchorSynced(31), {
      answer: () => Promise.resolve(answer),
    });

    await openPanel();
    expect(router.dialogues).toBe(1);

    answer = { ok: true, allowance: CARRIER_ALLOWANCE };
    await app.sync();

    expect(router.dialogues).toBe(2);

    app.stop();
  });

  it("dials nothing with no password stored", async () => {
    const { router, popover, app } = await launched(anchorSynced(31), {
      credential: null,
    });

    await openPanel();

    expect(router.dialogues).toBe(0);
    // And it does not raise the prompt on its own, either.
    expect(latest(popover).sync.needsPassword).toBe(false);

    app.stop();
  });

  it("dials nothing while the router is unreachable", async () => {
    const { router, app } = await launched(anchorSynced(31), {
      client: scriptedClient([OFFLINE, OFFLINE, OFFLINE]),
    });

    await openPanel();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(router.dialogues).toBe(0);

    app.stop();
  });

  it("dials nothing before the first snapshot has landed", async () => {
    const router = allowanceRouter(() =>
      Promise.resolve({ ok: true, allowance: CARRIER_ALLOWANCE }),
    );
    const app = startMenuBarApp({
      configPath: configHolding(anchorSynced(31)),
      client: { snapshot: () => new Promise<SnapshotResult>(() => undefined) },
      popover: recordingPopover(),
      allowance: router,
      credentials: storeHolding(CREDENTIAL),
    });

    clickTray();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(router.dialogues).toBe(0);

    app.stop();
  });

  it("never starts a dialogue on a poll tick alone", async () => {
    const { router, app } = await launched(anchorSynced(31));

    // The poller runs, the panel stays shut, and no auto-sync timer has come
    // round yet: a poll on its own is not a reason to dial the carrier.
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(router.dialogues).toBe(0);

    app.stop();
  });

  it("reports the automatic dialogue in the same status line a press uses", async () => {
    const { popover, app } = await launched(anchorSynced(31), {
      answer: () => Promise.resolve({ ok: false, reason: "busy" }),
    });

    await openPanel();

    expect(latest(popover).sync.status).toMatch(/busy/i);
    expect(latest(popover).sync.automatic).toBe(true);

    app.stop();
  });
});
