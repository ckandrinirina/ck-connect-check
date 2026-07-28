import { describe, expect, it } from "vitest";

import { defaultConfig, type AppConfig } from "../../src/config/defaults.js";
import {
  createRateHistory,
  type RateSample,
} from "../../src/domain/history.js";
import type { Clock } from "../../src/domain/quota.js";
import type { SnapshotResult } from "../../src/hilink/client.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import {
  buildPopoverModel,
  type PopoverModel,
  type UsageReading,
} from "../../src/main/view-model.js";

/** The recorded live reading from T-02: 4.43 GB down, 1.40 GB up. */
const DOWNLOAD_BYTES = 4_427_475_340;
const UPLOAD_BYTES = 1_403_243_047;

/** 27 July 2026, 17:46 local — five days before a `startDay` of 1. */
const NOW = new Date(2026, 6, 27, 17, 46, 0);

/** 7h 46m before {@link NOW}. */
const SEVEN_HOURS_AGO = new Date(2026, 6, 27, 10, 0, 0);

const clock: Clock = { now: () => NOW };

function snapshot(overrides: Partial<RouterSnapshot> = {}): RouterSnapshot {
  return {
    month: {
      monthDownloadBytes: DOWNLOAD_BYTES,
      monthUploadBytes: UPLOAD_BYTES,
      monthDurationSeconds: 27_960,
      monthLastClearTime: "2026-7-27",
    },
    traffic: {
      downloadRateBps: 2_355,
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
    ...overrides,
  };
}

function online(override: Partial<RouterSnapshot> = {}): SnapshotResult {
  return { online: true, snapshot: snapshot(override) };
}

const OFFLINE: SnapshotResult = { online: false, reason: "unreachable" };

function configWithLimit(limitBytes: number | null): AppConfig {
  return { ...defaultConfig(), planLimitBytes: limitBytes };
}

/** A history holding the given `[download, upload]` rates, oldest first. */
function historyOf(...rates: readonly [number, number][]): RateSample[] {
  const history = createRateHistory(90);

  for (const [downloadBytesPerSecond, uploadBytesPerSecond] of rates) {
    history.record({ downloadBytesPerSecond, uploadBytesPerSecond });
  }

  return history.samples();
}

/** Every leaf of the model, so "no arithmetic in the renderer" can be asserted wholesale. */
function leaves(value: unknown): unknown[] {
  if (typeof value !== "object" || value === null) {
    return [value];
  }
  return Object.values(value).flatMap((entry) => leaves(entry));
}

describe("buildPopoverModel — a live reading", () => {
  const model: PopoverModel = buildPopoverModel({
    result: online(),
    lastReading: { snapshot: snapshot(), at: NOW },
    config: configWithLimit(20_000_000_000),
    clock,
  });

  it("exposes the month download and upload totals", () => {
    expect(model.monthDownload).toBe("4.43 Go");
    expect(model.monthUpload).toBe("1.40 Go");
    expect(model.monthTotal).toBe("5.83 Go");
  });

  it("exposes the share of the plan used", () => {
    expect(model.progress.available).toBe(true);
    expect(model.progress.label).toBe("29%");
  });

  it("exposes the live download and upload rates", () => {
    expect(model.downloadRate).toBe("2.4 Ko/s");
    expect(model.uploadRate).toBe("0 o/s");
  });

  it("exposes the connected device count, carrier and signal bars", () => {
    expect(model.connectedDevices).toBe("3");
    expect(model.carrier).toBe("Yas");
    expect(model.signal).toBe("4/5");
  });

  it("exposes the days until the billing cycle resets", () => {
    expect(model.daysUntilReset).toBe("5 days");
  });

  it("says a single day in the singular", () => {
    const soon = buildPopoverModel({
      result: online({
        billing: {
          startDay: 28,
          routerDataLimitBytes: 0,
          warnThresholdPercent: 90,
        },
      }),
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      clock,
    });

    expect(soon.daysUntilReset).toBe("1 day");
  });

  it("hands the renderer only display strings — never a number to format", () => {
    // Two exceptions, both geometry rather than text: the sparkline history and
    // the dial's sweep. Everything the user *reads* is a string.
    const displayed = Object.entries(model).filter(
      ([field]) => field !== "history",
    );

    for (const leaf of leaves(Object.fromEntries(displayed))) {
      const geometry = leaf === model.progress.sweep;

      expect(
        geometry || typeof leaf === "string" || typeof leaf === "boolean",
      ).toBe(true);
    }
  });

  it("pre-computes the dial's sweep as a share of the ring", () => {
    expect(model.progress.sweep).toBeCloseTo(0.2915, 4);
  });

  it("caps the sweep at a full ring when the plan is overrun, but still reports the real share", () => {
    const over = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWithLimit(5_000_000_000),
      clock,
    });

    expect(over.progress.label).toBe("117%");
    expect(over.progress.sweep).toBe(1);
  });

  it("describes the dial for a screen reader with both the share and the total", () => {
    expect(model.progress.description).toContain("29%");
    expect(model.progress.description).toContain("5.83 Go");
  });

  it("is not flagged stale and carries no age", () => {
    expect(model.freshness.stale).toBe(false);
    expect(model.freshness.age).toBe("—");
    expect(model.freshness.label).toBe("Live");
  });
});

describe("buildPopoverModel — no plan limit configured", () => {
  const model = buildPopoverModel({
    result: online(),
    lastReading: null,
    config: configWithLimit(null),
    clock,
  });

  it("marks the dial unavailable rather than reporting 0%", () => {
    expect(model.progress.available).toBe(false);
    expect(model.progress.label).toBe("—");
    expect(model.progress.sweep).toBe(0);
  });

  it("prompts the user to set a limit", () => {
    expect(model.progress.prompt).toMatch(/limit/i);
  });

  it("describes the dial with the usage it does know and the limit it does not", () => {
    expect(model.progress.description).toContain("5.83 Go");
    expect(model.progress.description).toMatch(/limit/i);
  });

  it("still reports the usage figures it does know", () => {
    expect(model.monthTotal).toBe("5.83 Go");
    expect(model.carrier).toBe("Yas");
  });
});

describe("buildPopoverModel — the router is unreachable", () => {
  const model = buildPopoverModel({
    result: OFFLINE,
    lastReading: { snapshot: snapshot(), at: SEVEN_HOURS_AGO },
    config: configWithLimit(20_000_000_000),
    clock,
  });

  it("flags the model stale", () => {
    expect(model.freshness.stale).toBe(true);
  });

  it("carries the last successful reading rather than blanking the figures", () => {
    expect(model.monthDownload).toBe("4.43 Go");
    expect(model.monthUpload).toBe("1.40 Go");
    expect(model.progress.label).toBe("29%");
    expect(model.carrier).toBe("Yas");
  });

  it("reports how old that reading is", () => {
    expect(model.freshness.age).toBe("7h 46m");
    expect(model.freshness.label).toContain("7h 46m");
  });

  it("never surfaces the offline reason as an error to the renderer", () => {
    for (const leaf of leaves(model)) {
      expect(leaf).not.toBe("unreachable");
    }
  });
});

describe("buildPopoverModel — nothing has been read yet", () => {
  const model = buildPopoverModel({
    result: null,
    lastReading: null,
    config: configWithLimit(20_000_000_000),
    clock,
  });

  it("is stale with no age to report", () => {
    expect(model.freshness.stale).toBe(true);
    expect(model.freshness.age).toBe("—");
  });

  it("shows dashes instead of inventing zeroes", () => {
    expect(model.monthDownload).toBe("—");
    expect(model.monthTotal).toBe("—");
    expect(model.carrier).toBe("—");
    expect(model.connectedDevices).toBe("—");
    expect(model.daysUntilReset).toBe("—");
  });

  it("leaves the dial unavailable", () => {
    expect(model.progress.available).toBe(false);
    expect(model.progress.sweep).toBe(0);
  });
});

describe("buildPopoverModel — the usage state on the dial", () => {
  const GB = 1_000_000_000;
  const PLAN = 20 * GB;

  /** The model's state for `usedBytes` against a 20 GB plan, unless told otherwise. */
  function stateFor(
    usedBytes: number,
    limitBytes: number | null = PLAN,
    warnThresholdPercent = 90,
  ): string {
    return buildPopoverModel({
      result: online({
        month: {
          monthDownloadBytes: usedBytes,
          monthUploadBytes: 0,
          monthDurationSeconds: 27_960,
          monthLastClearTime: "2026-7-27",
        },
      }),
      lastReading: null,
      config: { ...configWithLimit(limitBytes), warnThresholdPercent },
      clock,
    }).progress.state;
  }

  it('is "ok" below the warn threshold', () => {
    expect(stateFor(5 * GB)).toBe("ok");
    expect(stateFor(17.9 * GB)).toBe("ok");
  });

  it('is "warn" from the threshold up to the limit', () => {
    expect(stateFor(18 * GB)).toBe("warn");
    expect(stateFor(19.9 * GB)).toBe("warn");
  });

  it('is "over" at the limit and beyond', () => {
    expect(stateFor(20 * GB)).toBe("over");
    expect(stateFor(25 * GB)).toBe("over");
  });

  it('is "unknown" with no plan limit, never "ok"', () => {
    expect(stateFor(5 * GB, null)).toBe("unknown");
  });

  it("follows the warn threshold configured by the user", () => {
    expect(stateFor(15 * GB, PLAN, 75)).toBe("warn");
    expect(stateFor(15 * GB, PLAN, 90)).toBe("ok");
    expect(stateFor(14 * GB, PLAN, 75)).toBe("ok");
  });

  it('is "unknown" before the first reading arrives', () => {
    const model = buildPopoverModel({
      result: null,
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      clock,
    });

    expect(model.progress.state).toBe("unknown");
  });

  it("reports the state of the last reading while the router is unreachable", () => {
    const model = buildPopoverModel({
      result: OFFLINE,
      lastReading: { snapshot: snapshot(), at: SEVEN_HOURS_AGO },
      config: configWithLimit(5_000_000_000),
      clock,
    });

    expect(model.progress.state).toBe("over");
  });
});

describe("buildPopoverModel — the recent throughput history", () => {
  const history = historyOf([1_000, 100], [3_000, 200], [2_000, 4_000]);

  const model = buildPopoverModel({
    result: online(),
    lastReading: null,
    config: configWithLimit(20_000_000_000),
    history,
    clock,
  });

  it("exposes the recorded download rates, oldest first", () => {
    expect(model.history.download).toEqual([1_000, 3_000, 2_000]);
  });

  it("exposes the recorded upload rates, oldest first", () => {
    expect(model.history.upload).toEqual([100, 200, 4_000]);
  });

  it("exposes the peak across both series, so the renderer scales without deriving it", () => {
    expect(model.history.peak).toBe(4_000);
  });

  it("is empty with a peak of 0 when no history has been passed", () => {
    const empty = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      clock,
    });

    expect(empty.history.download).toEqual([]);
    expect(empty.history.upload).toEqual([]);
    expect(empty.history.peak).toBe(0);
  });

  it("still shows the recorded history while the router is unreachable", () => {
    const stale = buildPopoverModel({
      result: OFFLINE,
      lastReading: { snapshot: snapshot(), at: SEVEN_HOURS_AGO },
      config: configWithLimit(20_000_000_000),
      history,
      clock,
    });

    expect(stale.history.download).toEqual([1_000, 3_000, 2_000]);
    expect(stale.history.peak).toBe(4_000);
  });

  it("reads the history without consuming it, so every rebuild shows the same samples", () => {
    const live = createRateHistory(90);

    live.record({ downloadBytesPerSecond: 1_000, uploadBytesPerSecond: 100 });

    const first = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      history: live.samples(),
      clock,
    });
    const second = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      history: live.samples(),
      clock,
    });

    expect(second.history.download).toEqual(first.history.download);
    expect(live.samples()).toHaveLength(1);
  });
});

describe("UsageReading", () => {
  it("pairs a snapshot with the moment it was taken", () => {
    const reading: UsageReading = { snapshot: snapshot(), at: NOW };

    expect(reading.at).toBe(NOW);
    expect(reading.snapshot.carrier.carrier).toBe("Yas");
  });
});
