import { describe, expect, it } from "vitest";

import { defaultConfig, type AppConfig } from "../../src/config/defaults.js";
import {
  createRateHistory,
  type RateSample,
} from "../../src/domain/history.js";
import type { AllowanceAnchor } from "../../src/domain/allowance.js";
import type { Clock } from "../../src/domain/quota.js";
import type { SnapshotResult } from "../../src/hilink/client.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import type { SyncFailure, SyncState } from "../../src/main/sync.js";
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

describe("buildPopoverModel — a real allowance anchored from a sync", () => {
  const ANCHOR: AllowanceAnchor = {
    planLabel: "NET MONTH 200 000",
    remainingBytes: 100_000_000_000,
    expiresAt: new Date(2026, 7, 12),
    routerMonthBytes: 1_000_000_000,
    routerClearTime: "2026-7-27",
    syncedAt: SEVEN_HOURS_AGO,
  };

  /** The router's counter 10 Go past the anchored one, with its clear time intact. */
  const counter = (bytes: number, clearTime = "2026-7-27") =>
    online({
      month: {
        monthDownloadBytes: bytes,
        monthUploadBytes: 0,
        monthDurationSeconds: 27_960,
        monthLastClearTime: clearTime,
      },
    });

  function withAnchor(
    anchor: AllowanceAnchor | undefined,
    result = counter(11_000_000_000),
  ): PopoverModel {
    return buildPopoverModel({
      result,
      lastReading: null,
      config: {
        ...configWithLimit(20_000_000_000),
        ...(anchor === undefined ? {} : { allowanceAnchor: anchor }),
        planTotalBytes: 200_000_000_000,
      },
      clock,
    });
  }

  it("computes the share used from the anchor, not from the configured limit", () => {
    // 200 Go anchored total, 90 Go left → 55%. The configured 20 Go limit would
    // read as an overrun instead.
    expect(withAnchor(ANCHOR).progress.label).toBe("55%");
    expect(withAnchor(ANCHOR).progress.available).toBe(true);
  });

  it("shows the exact remaining volume the anchor carries forward", () => {
    const model = withAnchor(ANCHOR);

    expect(model.allowance.available).toBe(true);
    expect(model.allowance.remaining).toBe("90.00 Go");
    expect(model.allowance.planLabel).toBe("NET MONTH 200 000");
  });

  it("shows the expiry as a date and the days left", () => {
    const model = withAnchor(ANCHOR);

    expect(model.allowance.expires).toBe("12/08/2026");
    expect(model.allowance.daysUntilExpiry).toBe("16 days");
  });

  it("is not marked stale while the anchor holds", () => {
    expect(withAnchor(ANCHOR).allowance.stale).toBe(false);
    expect(withAnchor(ANCHOR).allowance.note).toBe("");
  });

  it("falls back to the configured limit when there is no anchor", () => {
    const model = withAnchor(undefined, online());

    expect(model.progress.label).toBe("29%");
    expect(model.allowance.available).toBe(false);
    expect(model.allowance.remaining).toBe("—");
  });

  it("keeps showing the last computed remaining when the anchor goes stale", () => {
    const model = withAnchor(ANCHOR, counter(400_000_000));

    expect(model.allowance.available).toBe(true);
    expect(model.allowance.stale).toBe(true);
    expect(model.allowance.note).not.toBe("");
    expect(model.allowance.remaining).toBe("100.00 Go");
  });

  it("falls back to the configured limit for the dial once the anchor is stale", () => {
    // 4 Go counted against the configured 20 Go limit — 20%, not the 98% the
    // anchor would have claimed.
    const model = withAnchor(ANCHOR, counter(4_000_000_000, "2026-8-1"));

    expect(model.allowance.stale).toBe(true);
    expect(model.progress.label).toBe("20%");
  });

  it("marks an exhausted allowance", () => {
    const model = withAnchor(
      { ...ANCHOR, remainingBytes: 2_000_000_000 },
      counter(11_000_000_000),
    );

    expect(model.allowance.remaining).toBe("0 o");
    expect(model.allowance.exhausted).toBe(true);
  });

  it("still hands the renderer only display strings", () => {
    const model = withAnchor(ANCHOR);

    for (const leaf of leaves(model.allowance)) {
      expect(typeof leaf === "string" || typeof leaf === "boolean").toBe(true);
    }
  });

  it("shows nothing from an anchor before the first reading arrives", () => {
    const model = buildPopoverModel({
      result: null,
      lastReading: null,
      config: { ...defaultConfig(), allowanceAnchor: ANCHOR },
      clock,
    });

    expect(model.allowance.available).toBe(false);
    expect(model.allowance.remaining).toBe("—");
  });
});

describe("buildPopoverModel — the sync control", () => {
  const ANCHOR: AllowanceAnchor = {
    planLabel: "NET MONTH 200 000",
    remainingBytes: 100_000_000_000,
    expiresAt: new Date(2026, 7, 12),
    routerMonthBytes: 1_000_000_000,
    routerClearTime: "2026-7-27",
    syncedAt: SEVEN_HOURS_AGO,
  };

  function withSync(
    sync: SyncState,
    anchor?: AllowanceAnchor,
    clearTime = "2026-7-27",
  ): PopoverModel {
    return buildPopoverModel({
      result: online({
        month: {
          monthDownloadBytes: 11_000_000_000,
          monthUploadBytes: 0,
          monthDurationSeconds: 27_960,
          monthLastClearTime: clearTime,
        },
      }),
      lastReading: null,
      config: {
        ...configWithLimit(20_000_000_000),
        ...(anchor === undefined ? {} : { allowanceAnchor: anchor }),
        planTotalBytes: 200_000_000_000,
      },
      sync,
      clock,
    });
  }

  it("offers a pressable button while nothing is in flight", () => {
    const { sync } = withSync({ phase: "idle" });

    expect(sync.busy).toBe(false);
    expect(sync.needsPassword).toBe(false);
    expect(sync.status).toBe("");
    expect(sync.buttonLabel).toBe("Sync");
    expect(sync.buttonDescription).not.toBe("");
  });

  it("is busy and names the step while the dialogue runs", () => {
    const signingIn = withSync({ phase: "running", step: "signing-in" }).sync;
    const asking = withSync({ phase: "running", step: "asking-carrier" }).sync;

    expect(signingIn.busy).toBe(true);
    expect(asking.busy).toBe(true);
    expect(signingIn.status).toMatch(/sign/i);
    expect(asking.status).toMatch(/carrier/i);
    expect(signingIn.status).not.toBe(asking.status);
  });

  it("asks for a password rather than reporting a failure", () => {
    const { sync } = withSync({ phase: "needs-password" });

    expect(sync.needsPassword).toBe(true);
    expect(sync.busy).toBe(false);
    expect(sync.status).toMatch(/password/i);
  });

  it("carries no attention while the anchored figure still holds", () => {
    expect(withSync({ phase: "idle" }, ANCHOR).sync.attention).toBe(false);
  });

  it("calls for attention once the anchor has gone stale", () => {
    const model = withSync({ phase: "idle" }, ANCHOR, "2026-8-1");

    expect(model.allowance.stale).toBe(true);
    expect(model.sync.attention).toBe(true);
  });

  it("defaults to an idle control when no sync state is supplied", () => {
    const model = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      clock,
    });

    expect(model.sync.busy).toBe(false);
    expect(model.sync.needsPassword).toBe(false);
  });

  it("hands the renderer only display strings", () => {
    for (const leaf of leaves(withSync({ phase: "idle" }, ANCHOR).sync)) {
      expect(typeof leaf === "string" || typeof leaf === "boolean").toBe(true);
    }
  });
});

describe("buildPopoverModel — why a sync failed", () => {
  const REASONS: readonly [SyncFailure, RegExp][] = [
    ["busy", /busy/i],
    ["timeout", /time/i],
    ["wrong-credential", /password/i],
    ["account-locked", /lock/i],
    ["no-password", /password/i],
    ["unreachable", /router/i],
  ];

  function statusFor(reason: SyncFailure): string {
    return buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      sync: { phase: "failed", reason },
      clock,
    }).sync.status;
  }

  for (const [reason, wording] of REASONS) {
    it(`explains "${reason}" in words the panel can show`, () => {
      const status = statusFor(reason);

      expect(status).not.toBe("");
      expect(status).toMatch(wording);
    });
  }

  it("gives every reason its own wording rather than one catch-all", () => {
    const statuses = REASONS.map(([reason]) => statusFor(reason));

    expect(new Set(statuses).size).toBe(REASONS.length);
  });

  it("names the code the router refused the request with", () => {
    const status = statusFor({
      kind: "error",
      source: "api",
      code: 111019,
      endpoint: "/api/ussd/get",
    });

    expect(status).toMatch(/111019/);
    expect(status).toMatch(/\/api\/ussd\/get/);
  });

  it("names the HTTP status when the router answered no XML", () => {
    const status = statusFor({
      kind: "error",
      source: "http",
      code: 404,
      endpoint: "/api/ussd/status",
    });

    expect(status).toMatch(/404/);
    expect(status).toMatch(/\/api\/ussd\/status/);
  });

  it("tells two different codes apart rather than saying the same thing twice", () => {
    const first = statusFor({
      kind: "error",
      source: "api",
      code: 111019,
      endpoint: "/api/ussd/get",
    });
    const second = statusFor({
      kind: "error",
      source: "api",
      code: 100005,
      endpoint: "/api/ussd/get",
    });

    expect(first).not.toBe(second);
  });

  it("leaves the button pressable so the user can try again", () => {
    const model = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      sync: { phase: "failed", reason: "timeout" },
      clock,
    });

    expect(model.sync.busy).toBe(false);
  });
});

describe("buildPopoverModel — how long ago the sync happened", () => {
  const ANCHOR: AllowanceAnchor = {
    planLabel: "NET MONTH 200 000",
    remainingBytes: 100_000_000_000,
    expiresAt: new Date(2026, 7, 12),
    routerMonthBytes: 1_000_000_000,
    routerClearTime: "2026-7-27",
    syncedAt: SEVEN_HOURS_AGO,
  };

  function at(now: Date): PopoverModel {
    return buildPopoverModel({
      result: online({
        month: {
          monthDownloadBytes: 11_000_000_000,
          monthUploadBytes: 0,
          monthDurationSeconds: 27_960,
          monthLastClearTime: "2026-7-27",
        },
      }),
      lastReading: null,
      config: {
        ...configWithLimit(20_000_000_000),
        allowanceAnchor: ANCHOR,
        planTotalBytes: 200_000_000_000,
      },
      clock: { now: () => now },
    });
  }

  it("says how old the anchored figure is", () => {
    expect(at(NOW).allowance.syncedAgo).toBe("Synced 7h 46m ago");
  });

  it("ages with every poll rather than freezing at the sync", () => {
    const later = new Date(NOW.getTime() + 3_600_000);

    expect(at(later).allowance.syncedAgo).not.toBe(at(NOW).allowance.syncedAgo);
    expect(at(later).allowance.syncedAgo).toBe("Synced 8h 46m ago");
  });

  it("has nothing to report before the first sync", () => {
    const never = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      clock,
    });

    expect(never.allowance.syncedAgo).toBe("—");
  });
});

describe("UsageReading", () => {
  it("pairs a snapshot with the moment it was taken", () => {
    const reading: UsageReading = { snapshot: snapshot(), at: NOW };

    expect(reading.at).toBe(NOW);
    expect(reading.snapshot.carrier.carrier).toBe("Yas");
  });
});
