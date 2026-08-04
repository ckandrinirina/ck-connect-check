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
  LoginResult,
  RouterCredential,
  RouterSnapshot,
} from "../../src/hilink/types.js";
import { defaultConfig } from "../../src/config/defaults.js";
import {
  DEVICES_MENU_LABEL,
  type DevicesModel,
  type DevicesWindow,
} from "../../src/main/devices-window.js";
import type {
  HostListResult,
  MacFilterWriteResult,
} from "../../src/hilink/client.js";
import type { Device } from "../../src/hilink/devices.js";
import {
  MAC_FILTER_CAP,
  MAC_FILTER_ENDPOINT,
  type MacFilter,
} from "../../src/hilink/macfilter.js";
import {
  startMenuBarApp,
  type DeviceAccessSource,
  type MenuBarApp,
} from "../../src/main/main.js";
import type { PortalSource } from "../../src/main/poller.js";
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
  /** `app.on`, kept apart from the tray's own subscriptions above. */
  appOn: vi.fn(),
  appQuit: vi.fn(),
  buildFromTemplate: vi.fn((template: unknown) => ({ template })),
  createEmpty: vi.fn(() => ({ empty: true })),
  createFromPath: vi.fn((path: string) => ({
    path,
    setTemplateImage: vi.fn(),
  })),
  /** The image each `new Tray(…)` was constructed with, in order. */
  trayImages: [] as unknown[],
}));

/**
 * This machine's real interfaces are never read here.
 *
 * `main.ts` falls back to `networkInterfaces()` for the self-block guard when no
 * `localMacs` is injected, and a test whose verdict moved with whatever adapters
 * the host happened to have up would be no test at all. Everything else in
 * `node:os` — `tmpdir`, which the config fixtures use — stays exactly as it is.
 */
vi.mock("node:os", async (importOriginal) => ({
  ...(await importOriginal<typeof import("node:os")>()),
  networkInterfaces: (): Record<string, undefined> => ({}),
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
      on: electron.appOn,
      whenReady: vi.fn(() => Promise.resolve()),
      quit: electron.appQuit,
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

describe("startMenuBarApp — choosing which Orange forfait is measured", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.on.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** A router on the Orange network, so the poller reads the portal at all. */
  function orangeClient(): { snapshot: () => Promise<SnapshotResult> } {
    const taken = snapshot(5_830_718_387);

    return {
      snapshot: () =>
        Promise.resolve({
          online: true,
          snapshot: {
            ...taken,
            carrier: { carrier: "ORANGE MG", id: "orange" },
          },
        }),
    };
  }

  /** The two data forfaits of the live capture, both valid at once. */
  const PORTAL_PAGE = {
    account: { offer: "WiFiber", balanceAr: 0 },
    forfaits: [
      {
        label: "Wifiber Go+ SSE",
        nature: "Internet",
        bundleType: "data",
        consumedBytes: 7_370_000_000,
      },
      {
        label: "Pass Internet 5 Go",
        nature: "Internet",
        bundleType: "data",
        consumedBytes: 1_000_000_000,
      },
    ],
  };

  /** The portal, answering the same page every time it is asked. */
  function stubPortal(): PortalSource {
    return {
      read: () => Promise.resolve({ state: "read", page: PORTAL_PAGE }),
    };
  }

  /** What the config file on disk remembers as the chosen forfait. */
  function storedLabel(configPath: string): unknown {
    return (
      JSON.parse(readFileSync(configPath, "utf8")) as {
        orangeForfaitLabel?: unknown;
      }
    ).orangeForfaitLabel;
  }

  function launch(configPath: string) {
    const popover = recordingPopover();

    return {
      popover,
      app: startMenuBarApp({
        configPath,
        client: orangeClient(),
        portal: stubPortal(),
        popover,
        credentials: storeHolding(CREDENTIAL),
      }),
    };
  }

  it("offers the alternative while the app is the one that chose", async () => {
    const { popover, app } = launch(configHolding(null));

    await vi.advanceTimersByTimeAsync(0);

    expect(latest(popover).forfait?.label).toBe("Wifiber Go+ SSE");
    expect(
      latest(popover).forfait?.alternatives.map((one) => one.label),
    ).toEqual(["Pass Internet 5 Go"]);

    app.stop();
  });

  it("writes the chosen label down, so it survives a restart", async () => {
    const configPath = configHolding(null);
    const { app } = launch(configPath);

    await vi.advanceTimersByTimeAsync(0);
    app.setForfait("Pass Internet 5 Go");

    expect(storedLabel(configPath)).toBe("Pass Internet 5 Go");

    app.stop();
  });

  it("measures the chosen plan on the next poll, and stops offering", async () => {
    const { popover, app } = launch(configHolding(null));

    await vi.advanceTimersByTimeAsync(0);
    app.setForfait("Pass Internet 5 Go");

    // The next portal fetch is the one that acts on it: the choice is stored,
    // and the selection is made where every poll makes it.
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(latest(popover).forfait?.label).toBe("Pass Internet 5 Go");
    expect(latest(popover).allowance.planLabel).toBe("Pass Internet 5 Go");
    expect(latest(popover).monthTotal).toBe("1.00 Go");
    expect(latest(popover).forfait?.alternatives).toEqual([]);

    app.stop();
  });

  it("ignores a blank label rather than clearing the stored choice", async () => {
    const configPath = configHolding(null);
    const { app } = launch(configPath);

    await vi.advanceTimersByTimeAsync(0);
    app.setForfait("Pass Internet 5 Go");
    app.setForfait("   ");

    expect(storedLabel(configPath)).toBe("Pass Internet 5 Go");

    app.stop();
  });
});

/** A stand-in for the devices window, so no window is ever created here. */
function recordingDevices(): DevicesWindow & {
  opens: number;
  /** Every model pushed to the window, in order. */
  models: DevicesModel[];
} {
  let open = false;

  const devices = {
    opens: 0,
    models: [] as DevicesModel[],
    open() {
      devices.opens += 1;
      open = true;
    },
    close() {
      open = false;
    },
    isOpen: () => open,
    setDevices(model: DevicesModel) {
      devices.models.push(model);
    },
    destroy() {
      open = false;
    },
  };

  return devices;
}

/** The tray's context-menu template, as `main.ts` last built it. */
function menuTemplate(): { label?: string; click?: () => void }[] {
  const built = electron.buildFromTemplate.mock.calls.at(-1);

  if (built === undefined) {
    throw new Error("no context menu was built");
  }

  return built[0] as { label?: string; click?: () => void }[];
}

/** Picks the devices entry out of the menu and presses it. */
function clickDevicesMenuItem(): void {
  const item = menuTemplate().find(
    (entry) => entry.label === DEVICES_MENU_LABEL,
  );

  if (item?.click === undefined) {
    throw new Error(`the menu has no "${DEVICES_MENU_LABEL}" item`);
  }

  item.click();
}

describe("startMenuBarApp — the connected-devices window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.appOn.mockClear();
    electron.appQuit.mockClear();
    electron.buildFromTemplate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens the window from a menu item, not from a second tray click", () => {
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices,
    });

    clickDevicesMenuItem();

    expect(devices.opens).toBe(1);
    expect(devices.isOpen()).toBe(true);

    app.stop();
  });

  it("leaves Quit in the menu beside it", () => {
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices: recordingDevices(),
    });

    expect(menuTemplate().some((entry) => entry.label === "Quit")).toBe(true);

    app.stop();
  });

  it("does not quit the app when the devices window is the last one closed", () => {
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices,
    });

    clickDevicesMenuItem();
    devices.close();

    // Electron quits when the last window goes and nobody has said otherwise,
    // and this app's real home is the menu bar, where there is no window at all.
    const closed = electron.appOn.mock.calls.find(
      ([event]) => event === "window-all-closed",
    );

    expect(closed).toBeDefined();
    (closed?.[1] as () => void)();

    expect(electron.appQuit).not.toHaveBeenCalled();

    app.stop();
  });

  it("keeps polling after the devices window is closed", async () => {
    const client = countingClient();
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client,
      popover: recordingPopover(),
      devices,
    });

    await vi.advanceTimersByTimeAsync(0);
    clickDevicesMenuItem();
    devices.close();

    const before = client.calls;
    await vi.advanceTimersByTimeAsync(POLL_MS * 2);

    expect(client.calls).toBeGreaterThan(before);

    app.stop();
  });

  it("releases the window when the app stops", () => {
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices,
    });

    clickDevicesMenuItem();
    app.stop();

    expect(devices.isOpen()).toBe(false);
  });
});

const LAPTOP: Device = {
  mac: "A2:00:5E:00:00:01",
  ip: "192.168.8.100",
  name: "MacBookPro",
  ssid: "HUAWEI-B310-XXXX",
  associatedSeconds: 21_125,
};

/**
 * The panel's model without its sparkline — the one part of it that is *meant*
 * to differ between two polls, because a second sample has arrived.
 */
function panelReading(popover: RecordingPopover): Partial<PopoverModel> {
  const reading: Partial<PopoverModel> = { ...latest(popover) };

  delete reading.history;

  return reading;
}

/** A host list that answers, and counts how often it was asked. */
function countingHosts(result?: HostListResult): {
  hosts: () => Promise<HostListResult>;
  calls: number;
} {
  const source = {
    calls: 0,
    hosts: (): Promise<HostListResult> => {
      source.calls += 1;

      return Promise.resolve(result ?? { online: true, devices: [LAPTOP] });
    },
  };

  return source;
}

describe("startMenuBarApp — the device list behind that window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.buildFromTemplate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pushes the router's devices into the window while it is open", async () => {
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices,
      hosts: countingHosts(),
      localMacs: () => [],
    });

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(devices.models.at(-1)).toEqual({
      state: "listed",
      devices: [
        {
          name: "MacBookPro",
          ip: "192.168.8.100",
          mac: "A2:00:5E:00:00:01",
          network: "HUAWEI-B310-XXXX",
          connectedFor: "5h 52m",
          // No filter has been read, so nothing is claimed to be blocked —
          // T-68 is what gives the poll a filter to pass in.
          blocked: false,
          present: true,
          // No interface of this machine is in the list, so every row keeps
          // its control — T-69's guard has nothing to match here.
          local: false,
        },
      ],
    });

    app.stop();
  });

  it("asks the router for no host list while the window is shut", async () => {
    const hosts = countingHosts();
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices,
      hosts,
    });

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);

    expect(hosts.calls).toBe(0);
    expect(devices.models).toEqual([]);

    app.stop();
  });

  it("leaves the panel's reading exactly as it was when the host list fails", async () => {
    const popover = recordingPopover();
    const devices = recordingDevices();
    let refuse = false;
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover,
      devices,
      hosts: {
        hosts: () =>
          refuse
            ? Promise.reject(new Error("host-list refused"))
            : Promise.resolve<HostListResult>({
                online: true,
                devices: [LAPTOP],
              }),
      },
    });

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);
    const reading = panelReading(popover);

    refuse = true;
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(panelReading(popover)).toEqual(reading);
    // And the window is told, rather than being left showing a stale list.
    expect(devices.models.at(-1)).toEqual({ state: "offline" });

    app.stop();
  });

  it("tells the window the router is unreachable rather than showing no devices", async () => {
    const hosts = countingHosts();
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: scriptedClient([OFFLINE]),
      popover: recordingPopover(),
      devices,
      hosts,
    });

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);

    expect(devices.models.at(-1)).toEqual({ state: "offline" });
    expect(hosts.calls).toBe(0);

    app.stop();
  });
});

/** The Mac this app is imagined to be running on. Blocking it is unrecoverable. */
const THIS_MAC = "AA:BB:CC:DD:EE:FF";

/** Another device the filter already refuses, so a write has something to keep. */
const TABLET_MAC = "A6:00:5E:00:00:03";

/** A filter as the router sends one: four blocks, each holding the same list. */
function macFilter(mode: MacFilter["mode"], ...macs: string[]): MacFilter {
  const entries = macs.map((mac) => ({ mac, name: "" }));

  return {
    mode,
    entries,
    ssids: [0, 1, 2, 3].map((index) => ({
      mode,
      index,
      entries: entries.map((entry) => ({ ...entry })),
    })),
  };
}

/** The filter the router holds, plus a count of everything asked of it. */
interface RecordingAccess extends DeviceAccessSource {
  /** Every filter read, whether it answered or not. */
  reads: number;
  /** Every filter written, in order — the assertion that a `POST` happened. */
  writes: MacFilter[];
  /** Every sign-in attempted. */
  logins: number;
  /** What the next read answers. Replaced to script a router that changed. */
  held: MacFilter | null;
  /** Whether a login is accepted. A refused one is never retried. */
  signInSucceeds: boolean;
  /** Whether the read answers before a sign-in, as the real router does not. */
  readsBeforeLogin: boolean;
  /** Whether a sign-in has actually been accepted. A refused one grants nothing. */
  authenticated: boolean;
  /** What the write answers. */
  writeResult: MacFilterWriteResult;
}

function recordingAccess(
  held: MacFilter | null,
  overrides: Partial<
    Pick<RecordingAccess, "signInSucceeds" | "readsBeforeLogin" | "writeResult">
  > = {},
): RecordingAccess {
  const access: RecordingAccess = {
    reads: 0,
    writes: [],
    logins: 0,
    held,
    signInSucceeds: overrides.signInSucceeds ?? true,
    readsBeforeLogin: overrides.readsBeforeLogin ?? true,
    authenticated: false,
    writeResult: overrides.writeResult ?? { ok: true },
    macFilter: () => {
      access.reads += 1;

      if (access.held === null) {
        return Promise.resolve({ online: false as const, reason: "error" });
      }
      // A refused sign-in grants nothing, so the read goes on being refused —
      // which is what makes "one login per press" a claim worth asserting.
      if (!access.readsBeforeLogin && !access.authenticated) {
        return Promise.resolve({ online: false as const, reason: "session" });
      }

      return Promise.resolve({ online: true as const, filter: access.held });
    },
    writeMacFilter: (filter) => {
      access.writes.push(filter);

      if (access.writeResult.ok) {
        access.held = filter;
      }

      return Promise.resolve(access.writeResult);
    },
    login: () => {
      access.logins += 1;
      access.authenticated ||= access.signInSucceeds;

      // A wrong password, which is the refusal that walks an account towards
      // the router's five-failure lockout if anything retries it.
      return Promise.resolve<LoginResult>(
        access.signInSucceeds
          ? { ok: true }
          : { ok: false, reason: "wrong-credential" },
      );
    },
  };

  return access;
}

/** Starts the app with a filter behind it and the devices window already open. */
function launchWithFilter(
  access: DeviceAccessSource,
  held: Device[] = [LAPTOP],
) {
  const devices = recordingDevices();
  const app = startMenuBarApp({
    configPath: MISSING_CONFIG,
    client: countingClient(),
    popover: recordingPopover(),
    devices,
    hosts: countingHosts({ online: true, devices: held }),
    access,
    credentials: storeHolding(CREDENTIAL),
    localMacs: () => [THIS_MAC],
  });

  return { app, devices };
}

/** Every address the last write carried, block by block. */
function writtenMacs(access: RecordingAccess): string[][] {
  return (access.writes.at(-1)?.ssids ?? []).map((ssid) =>
    ssid.entries.map((entry) => entry.mac),
  );
}

/** The row the last pushed model holds for one address. */
function rowFor(devices: { models: DevicesModel[] }, mac: string) {
  const model = devices.models.at(-1);

  return model?.state === "listed"
    ? model.devices.find((device) => device.mac === mac)
    : undefined;
}

/**
 * Blocking and unblocking, the first write this app makes outside the USSD
 * path. Every "no request was made" below is a call count on the stub, because
 * a test that read the returned reason would pass an implementation that fired
 * the request anyway. Nothing here reaches a router.
 */
describe("startMenuBarApp — blocking a device", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.buildFromTemplate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the current filter and writes it back with the address added", async () => {
    const access = recordingAccess(macFilter("blacklist", TABLET_MAC));
    const { app } = launchWithFilter(access);

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    // Composing the write from a remembered list would silently unblock
    // whoever joined it since, so the read comes first and every entry stays.
    expect(access.reads).toBeGreaterThanOrEqual(1);
    expect(access.writes).toHaveLength(1);
    expect(writtenMacs(access)).toEqual([
      [TABLET_MAC, LAPTOP.mac],
      [TABLET_MAC, LAPTOP.mac],
      [TABLET_MAC, LAPTOP.mac],
      [TABLET_MAC, LAPTOP.mac],
    ]);

    app.stop();
  });

  it("turns blacklist mode on in the same write when the filter was off", async () => {
    const access = recordingAccess(macFilter("off"));
    const { app } = launchWithFilter(access);

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    expect(access.writes).toHaveLength(1);
    expect(access.writes[0]?.ssids.map((ssid) => ssid.mode)).toEqual([
      "blacklist",
      "blacklist",
      "blacklist",
      "blacklist",
    ]);

    app.stop();
  });

  it("leaves the mode alone when the last blocked device is unblocked", async () => {
    const access = recordingAccess(macFilter("blacklist", LAPTOP.mac));
    const { app } = launchWithFilter(access);

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: false });

    // Switching the filter off is a change to every other device that nobody
    // asked for. The list empties; the mode stands.
    expect(writtenMacs(access)).toEqual([[], [], [], []]);
    expect(access.writes[0]?.mode).toBe("blacklist");
    expect(access.writes[0]?.ssids.map((ssid) => ssid.mode)).toEqual([
      "blacklist",
      "blacklist",
      "blacklist",
      "blacklist",
    ]);

    app.stop();
  });

  it("makes no write at all when the filter read failed", async () => {
    const access = recordingAccess(null);
    const { app } = launchWithFilter(access);

    const outcome = await app.setDeviceBlocked({
      mac: LAPTOP.mac,
      blocked: true,
    });

    expect(access.writes).toHaveLength(0);
    expect(outcome.ok).toBe(false);

    app.stop();
  });

  it("signs in once for a press and does not retry a login it was refused", async () => {
    const access = recordingAccess(macFilter("off"), {
      readsBeforeLogin: false,
      signInSucceeds: false,
    });
    const { app } = launchWithFilter(access);

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    // Five refusals lock the account, so one press costs at most one sign-in.
    expect(access.logins).toBe(1);
    expect(access.writes).toHaveLength(0);

    app.stop();
  });

  it("tries again on a second press, because a press is always deliberate", async () => {
    const access = recordingAccess(macFilter("off"), {
      readsBeforeLogin: false,
      signInSucceeds: false,
    });
    const { app } = launchWithFilter(access);

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });
    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    expect(access.logins).toBe(2);

    app.stop();
  });

  it("signs in once and then goes ahead, without a second sign-in for the re-read", async () => {
    const access = recordingAccess(macFilter("off"), {
      readsBeforeLogin: false,
    });
    const { app } = launchWithFilter(access);

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    expect(access.logins).toBe(1);
    expect(access.writes).toHaveLength(1);

    app.stop();
  });

  it("refuses a further block at the cap, before any write, naming the cap", async () => {
    const full = macFilter(
      "blacklist",
      ...Array.from(
        { length: MAC_FILTER_CAP },
        (_unused, slot) => `A2:00:5E:00:00:1${slot}`,
      ),
    );
    const access = recordingAccess(full);
    const { app } = launchWithFilter(access);

    const outcome = await app.setDeviceBlocked({
      mac: LAPTOP.mac,
      blocked: true,
    });

    // A household reaching the firmware's cap has done nothing wrong: this is
    // stated, not attempted and failed.
    expect(access.writes).toHaveLength(0);
    expect(outcome).toEqual({
      ok: false,
      reason: { kind: "full", cap: MAC_FILTER_CAP },
    });

    app.stop();
  });

  it("refuses a write that would set whitelist mode, before any request", async () => {
    const access = recordingAccess(macFilter("whitelist", LAPTOP.mac));
    const { app } = launchWithFilter(access);

    // An unblock leaves the mode as it found it, so the write would carry
    // whitelist straight back — and a whitelist blocks every device it does not
    // name, including the Mac this app runs on.
    const outcome = await app.setDeviceBlocked({
      mac: LAPTOP.mac,
      blocked: false,
    });

    expect(access.writes).toHaveLength(0);
    expect(outcome).toEqual({ ok: false, reason: { kind: "whitelist" } });

    app.stop();
  });

  it("refuses a block on this machine's own address before any request at all", async () => {
    const access = recordingAccess(macFilter("off"));
    const { app } = launchWithFilter(access, [
      { ...LAPTOP, mac: THIS_MAC, name: "this-mac" },
    ]);

    const reads = access.reads;
    const outcome = await app.setDeviceBlocked({
      mac: THIS_MAC,
      blocked: true,
    });

    // The guard is at the domain layer, so it holds whatever the page offers:
    // not even the read goes out.
    expect(access.reads).toBe(reads);
    expect(access.writes).toHaveLength(0);
    expect(outcome).toEqual({ ok: false, reason: { kind: "self" } });

    app.stop();
  });

  it("refuses it however the address is spelled", async () => {
    const access = recordingAccess(macFilter("off"));
    const { app } = launchWithFilter(access);

    const reads = access.reads;
    const outcome = await app.setDeviceBlocked({
      mac: "aa-bb-cc-dd-ee-ff",
      blocked: true,
    });

    expect(access.reads).toBe(reads);
    expect(access.writes).toHaveLength(0);
    expect(outcome).toEqual({ ok: false, reason: { kind: "self" } });

    app.stop();
  });

  it("leaves every other device blockable when this machine is not in the list", async () => {
    const access = recordingAccess(macFilter("off"));
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices,
      hosts: countingHosts(),
      access,
      credentials: storeHolding(CREDENTIAL),
      localMacs: () => [],
    });

    expect(
      await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true }),
    ).toEqual({ ok: true });
    expect(access.writes).toHaveLength(1);

    app.stop();
  });

  it("makes no request when there is no stored password to sign in with", async () => {
    const access = recordingAccess(macFilter("off"));
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices,
      hosts: countingHosts(),
      access,
      credentials: storeHolding(null),
      localMacs: () => [THIS_MAC],
    });

    const outcome = await app.setDeviceBlocked({
      mac: LAPTOP.mac,
      blocked: true,
    });

    expect(access.reads).toBe(0);
    expect(access.writes).toHaveLength(0);
    expect(outcome).toEqual({ ok: false, reason: "not-logged-in" });

    app.stop();
  });

  it("tells the window which row is this machine, so the control can be withheld", async () => {
    const access = recordingAccess(macFilter("off"));
    const { app, devices } = launchWithFilter(access, [
      LAPTOP,
      { ...LAPTOP, mac: THIS_MAC, name: "this-mac" },
    ]);

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);

    // Read from the interfaces this run was given, never matched by IP: the two
    // rows below share one lease in the fixture.
    expect(rowFor(devices, THIS_MAC)?.local).toBe(true);
    expect(rowFor(devices, LAPTOP.mac)?.local).toBe(false);

    app.stop();
  });

  it("marks no row as this machine when none of its interfaces is listed", async () => {
    const access = recordingAccess(macFilter("off"));
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices,
      hosts: countingHosts({ online: true, devices: [LAPTOP] }),
      access,
      credentials: storeHolding(CREDENTIAL),
      // On Ethernet, with only Wi-Fi hosts reported. Every row keeps its
      // control, which is the correct outcome rather than a fallback.
      localMacs: () => [],
    });

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);

    expect(rowFor(devices, LAPTOP.mac)?.local).toBe(false);

    app.stop();
  });

  it("shows the row as the router re-reads it, not as the click assumed", async () => {
    const access = recordingAccess(macFilter("off"));
    const { app, devices } = launchWithFilter(access);

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);

    // The write is accepted, but the router goes on saying the filter is off.
    access.writeResult = { ok: true };
    access.macFilter = () => {
      access.reads += 1;

      return Promise.resolve({
        online: true as const,
        filter: macFilter("off"),
      });
    };

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    // The click assumed a block; the re-read says otherwise, and the re-read
    // is what the row shows.
    expect(rowFor(devices, LAPTOP.mac)?.blocked).toBe(false);

    app.stop();
  });

  it("re-reads the filter after a write and pushes the row it found", async () => {
    const access = recordingAccess(macFilter("off"));
    const { app, devices } = launchWithFilter(access);

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);
    const readsBefore = access.reads;

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    // One read to compose the write from, one afterwards to render from.
    expect(access.reads - readsBefore).toBeGreaterThanOrEqual(2);
    expect(rowFor(devices, LAPTOP.mac)?.blocked).toBe(true);

    app.stop();
  });

  it("re-reads even when the write was refused, rather than leaving a guess on screen", async () => {
    const access = recordingAccess(macFilter("blacklist", LAPTOP.mac), {
      writeResult: { ok: false, reason: "timeout" },
    });
    const { app, devices } = launchWithFilter(access);

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);

    const outcome = await app.setDeviceBlocked({
      mac: LAPTOP.mac,
      blocked: false,
    });

    expect(outcome).toEqual({ ok: false, reason: "timeout" });
    // The router still refuses it, and the row still says so.
    expect(rowFor(devices, LAPTOP.mac)?.blocked).toBe(true);

    app.stop();
  });
});

/** The last model the window was handed, whatever state it is in. */
function lastModel(devices: {
  models: DevicesModel[];
}): DevicesModel | undefined {
  return devices.models.at(-1);
}

/** How many rows the last pushed model would draw. */
function rowCount(devices: { models: DevicesModel[] }): number {
  const model = lastModel(devices);

  return model?.state === "listed" ? model.devices.length : 0;
}

/**
 * A router error code this codebase names nowhere, at the endpoint a filter
 * write actually goes to. Carried whole rather than flattened, because the
 * number and the endpoint are the only evidence of why the router refused.
 */
const UNNAMED_CODE = 100004;

/**
 * What the window is told when there is no list, or when a press changed
 * nothing.
 *
 * The outcome of a write used to stop at `setDeviceBlocked`'s return value and
 * reach nobody. These assert that it reaches the window instead — and that a
 * refused write leaves the rows exactly where they were, because a list that
 * vanished when a toggle failed would throw away what the window is for.
 */
describe("startMenuBarApp — saying why the list is empty or a press did not take", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.buildFromTemplate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tells the window there is no password, rather than that the router is unreachable", async () => {
    const devices = recordingDevices();
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: countingClient(),
      popover: recordingPopover(),
      devices,
      // No `hosts` stub: the real gate is exercised, and with no credential
      // stored it answers without a request ever leaving the process.
      credentials: storeHolding(null),
      localMacs: () => [],
    });

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(POLL_MS);

    // This used to degrade into the offline state, which said the router was
    // at fault for something the user can fix in the panel.
    expect(lastModel(devices)).toEqual({ state: "no-password" });

    app.stop();
  });

  it("carries a router refusal nobody has named to the window, code and endpoint intact", async () => {
    const access = recordingAccess(macFilter("off"), {
      writeResult: {
        ok: false,
        reason: {
          kind: "error",
          source: "api",
          code: UNNAMED_CODE,
          endpoint: MAC_FILTER_ENDPOINT,
        },
      },
    });
    const { app, devices } = launchWithFilter(access);

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);
    const before = rowCount(devices);

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    expect(lastModel(devices)).toEqual({
      state: "listed",
      devices: expect.anything(),
      refusal: {
        kind: "error",
        source: "api",
        code: UNNAMED_CODE,
        endpoint: MAC_FILTER_ENDPOINT,
      },
    });
    // The write failed; the devices did not go anywhere.
    expect(before).toBe(1);
    expect(rowCount(devices)).toBe(before);

    app.stop();
  });

  it("carries the cap refusal to the window with the cap on it", async () => {
    const full = macFilter(
      "blacklist",
      ...Array.from(
        { length: MAC_FILTER_CAP },
        (_unused, slot) => `A2:00:5E:00:00:1${slot}`,
      ),
    );
    const access = recordingAccess(full);
    const { app, devices } = launchWithFilter(access);

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);
    const before = rowCount(devices);

    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    const model = lastModel(devices);

    expect(model?.state).toBe("listed");
    expect(model?.state === "listed" ? model.refusal : undefined).toEqual({
      kind: "full",
      cap: MAC_FILTER_CAP,
    });
    expect(rowCount(devices)).toBe(before);

    app.stop();
  });

  it("takes the complaint back down when a press goes through", async () => {
    const access = recordingAccess(macFilter("off"), {
      writeResult: { ok: false, reason: "timeout" },
    });
    const { app, devices } = launchWithFilter(access);

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);
    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    access.writeResult = { ok: true };
    await app.setDeviceBlocked({ mac: LAPTOP.mac, blocked: true });

    const model = lastModel(devices);

    expect(model?.state === "listed" ? model.refusal : "unset").toBeUndefined();

    app.stop();
  });
});

describe("startMenuBarApp — the filter behind the device list", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.buildFromTemplate.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the filter on the poll and marks the blocked rows from it", async () => {
    const access = recordingAccess(macFilter("blacklist", LAPTOP.mac));
    const { app, devices } = launchWithFilter(access);

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(POLL_MS);

    expect(rowFor(devices, LAPTOP.mac)?.blocked).toBe(true);

    app.stop();
  });

  it("asks for no filter while the window is shut", async () => {
    const access = recordingAccess(macFilter("off"));
    const { app } = launchWithFilter(access);

    await vi.advanceTimersByTimeAsync(POLL_MS * 3);

    // The filter costs a request the menu bar never needs.
    expect(access.reads).toBe(0);

    app.stop();
  });

  it("claims nothing is blocked until a filter has actually been read", async () => {
    const access = recordingAccess(null);
    const { app, devices } = launchWithFilter(access);

    clickDevicesMenuItem();
    await vi.advanceTimersByTimeAsync(0);

    expect(rowFor(devices, LAPTOP.mac)?.blocked).toBe(false);

    app.stop();
  });
});
