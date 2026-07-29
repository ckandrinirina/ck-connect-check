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
import type {
  PlanDaysRefusal,
  PlanLimitRefusal,
} from "../../src/config/config.js";
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
      // LTE, the code this device reports.
      networkTypeCode: 101,
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

/** The snapshot's month counter as one figure — 5.83 Go. */
const ROUTER_COUNTER = DOWNLOAD_BYTES + UPLOAD_BYTES;

/**
 * An anchor pinned to the snapshot's own counter, so the delta is zero and
 * `remainingBytes` reads back exactly as anchored. Everything the dial shows is
 * then the cap minus this figure, with no router arithmetic in the way.
 */
function anchorOf(
  remainingBytes: number,
  overrides: Partial<AllowanceAnchor> = {},
): AllowanceAnchor {
  return {
    planLabel: "NET MONTH 200 000",
    remainingBytes,
    expiresAt: new Date(2026, 7, 12),
    routerMonthBytes: ROUTER_COUNTER,
    routerClearTime: "2026-7-27",
    syncedAt: SEVEN_HOURS_AGO,
    ...overrides,
  };
}

/** A config carrying both halves the dial needs: the cap and the anchor. */
function configWith(
  limitBytes: number | null,
  anchor?: AllowanceAnchor,
): AppConfig {
  return {
    ...defaultConfig(),
    planLimitBytes: limitBytes,
    ...(anchor === undefined ? {} : { allowanceAnchor: anchor }),
  };
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
  // 20 Go bought, 12 Go left by the carrier's own count → 8 Go consumed. The
  // router's counter reads 5.83 Go over the same period; the two describe
  // different months, and the plan figure is the one the panel headlines.
  const model: PopoverModel = buildPopoverModel({
    result: online(),
    lastReading: { snapshot: snapshot(), at: NOW },
    config: configWith(20_000_000_000, anchorOf(12_000_000_000)),
    clock,
  });

  it("exposes the month download and upload totals", () => {
    expect(model.monthDownload).toBe("4.43 Go");
    expect(model.monthUpload).toBe("1.40 Go");
  });

  it("reports the plan consumed, not the router's own month counter", () => {
    expect(model.monthTotal).toBe("8.00 Go");
    expect(model.monthTotal).not.toBe("5.83 Go");
  });

  it("exposes the share of the plan used", () => {
    expect(model.progress.available).toBe(true);
    expect(model.progress.label).toBe("40%");
  });

  it("exposes the live download and upload rates", () => {
    expect(model.downloadRate).toBe("2.4 Ko/s");
    expect(model.uploadRate).toBe("0 o/s");
  });

  it("exposes the connected device count and carrier", () => {
    expect(model.connectedDevices).toBe("3");
    expect(model.carrier).toBe("Yas");
  });

  it("hands the signal over as numbers, so the renderer can draw bars with it", () => {
    // A `"4/5"` string is a figure where an icon was promised: it can be read
    // but not drawn. The level and the scale it is out of go over separately.
    expect(model.signalBars).toBe(4);
    expect(model.maxSignalBars).toBe(5);
    expect(Object.keys(model)).not.toContain("signal");
  });

  it("still words the signal itself, so the renderer spells no sentence", () => {
    expect(model.signalDescription).toBe("Signal 4 of 5");
  });

  it("names the network the router is attached to", () => {
    // The snapshot reports code 101. Which generation that is has already been
    // decided in `src/domain/` — the model carries the answer, not the code.
    expect(model.networkType).toBe("4G");
  });

  it("has no billing-cycle countdown to expose", () => {
    // The router's `StartDay` disagrees with the carrier's own expiry date, and
    // two answers to "when does this run out" is worse than one.
    expect(Object.keys(model)).not.toContain("daysUntilReset");
  });

  it("counts the days the carrier's allowance is still valid for", () => {
    expect(model.allowance.daysUntilExpiry).toBe("16 days");
  });

  it("says a single day in the singular", () => {
    const soon = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWith(
        20_000_000_000,
        anchorOf(12_000_000_000, { expiresAt: new Date(2026, 6, 28) }),
      ),
      clock,
    });

    expect(soon.allowance.daysUntilExpiry).toBe("1 day");
  });

  it("hands the renderer only display strings — never a number to format", () => {
    // The exceptions are all things the renderer acts on rather than prints:
    // the sparkline history, the dial's sweep, the signal level, which is a
    // count of bars to fill, and the pace's tier, which is which rows to show.
    // Everything the user *reads* is a string.
    const controlFields = ["history", "signalBars", "maxSignalBars"];
    const displayed = Object.entries(model).filter(
      ([field]) => !controlFields.includes(field),
    );

    for (const leaf of leaves(Object.fromEntries(displayed))) {
      const control =
        leaf === model.progress.sweep || leaf === model.pace?.tier;

      expect(
        control || typeof leaf === "string" || typeof leaf === "boolean",
      ).toBe(true);
    }
  });

  it("pre-computes the dial's sweep as a share of the ring", () => {
    expect(model.progress.sweep).toBeCloseTo(0.4, 4);
  });

  it("draws a full ring once the carrier says nothing is left", () => {
    const over = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWith(20_000_000_000, anchorOf(0)),
      clock,
    });

    expect(over.progress.label).toBe("100%");
    expect(over.progress.sweep).toBe(1);
  });

  it("describes the dial for a screen reader with both the share and the total", () => {
    expect(model.progress.description).toContain("40%");
    expect(model.progress.description).toContain("8.00 Go");
  });

  it("is not flagged stale and carries no age", () => {
    expect(model.freshness.stale).toBe(false);
    expect(model.freshness.age).toBe("—");
    expect(model.freshness.label).toBe("Live");
  });
});

describe("buildPopoverModel — the plan limit field", () => {
  function planLimitOf(
    limitBytes: number | null,
    problem?: PlanLimitRefusal,
  ): PopoverModel["planLimit"] {
    return buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWith(limitBytes, anchorOf(12_000_000_000)),
      planLimitProblem: problem,
      clock,
    }).planLimit;
  }

  it("carries a stored cap as the figure the field shows", () => {
    expect(planLimitOf(150_000_000_000).value).toBe("150");
  });

  it("carries an empty field when no cap is stored", () => {
    expect(planLimitOf(null).value).toBe("");
  });

  it("says which of the two states the field is in", () => {
    expect(planLimitOf(null).needsValue).toBe(true);
    expect(planLimitOf(150_000_000_000).needsValue).toBe(false);
  });

  it("names its unit rather than leaving the renderer to spell it", () => {
    expect(planLimitOf(150_000_000_000).unit).toBe("Go");
  });

  it("carries no complaint when the last entry was fine", () => {
    expect(planLimitOf(150_000_000_000).error).toBe("");
  });

  it("words each refusal, so the renderer decides no sentences", () => {
    const worded = (["blank", "not-a-number", "not-positive"] as const).map(
      (reason) => planLimitOf(null, reason).error,
    );

    for (const sentence of worded) {
      expect(sentence).not.toBe("");
    }

    // Three different problems get three different sentences: "that did not
    // work" tells the user nothing they can act on.
    expect(new Set(worded).size).toBe(3);
  });

  it("hands the renderer only strings and flags here too", () => {
    for (const leaf of leaves(planLimitOf(150_000_000_000))) {
      expect(typeof leaf === "string" || typeof leaf === "boolean").toBe(true);
    }
  });
});

describe("buildPopoverModel — the plan length field", () => {
  function planDaysOf(
    days: number | null,
    problem?: PlanDaysRefusal,
  ): PopoverModel["planDays"] {
    return buildPopoverModel({
      result: online(),
      lastReading: null,
      config: {
        ...configWith(150_000_000_000, anchorOf(12_000_000_000)),
        planDays: days,
      },
      planDaysProblem: problem,
      clock,
    }).planDays;
  }

  it("carries a stored length as the figure the field shows", () => {
    expect(planDaysOf(30).value).toBe("30");
  });

  it("carries an empty field when no length is stored", () => {
    expect(planDaysOf(null).value).toBe("");
  });

  it("says which of the two states the field is in", () => {
    expect(planDaysOf(null).needsValue).toBe(true);
    expect(planDaysOf(30).needsValue).toBe(false);
  });

  it("names its unit rather than leaving the renderer to spell it", () => {
    expect(planDaysOf(30).unit).not.toBe("");
  });

  it("carries no complaint when the last entry was fine", () => {
    expect(planDaysOf(30).error).toBe("");
  });

  it("words each refusal, so the renderer decides no sentences", () => {
    const worded = (
      ["blank", "not-a-number", "not-positive", "not-whole"] as const
    ).map((reason) => planDaysOf(null, reason).error);

    for (const sentence of worded) {
      expect(sentence).not.toBe("");
    }

    expect(new Set(worded).size).toBe(4);
  });

  it("hands the renderer only strings and flags here too", () => {
    for (const leaf of leaves(planDaysOf(30))) {
      expect(typeof leaf === "string" || typeof leaf === "boolean").toBe(true);
    }
  });

  it("is on the panel before the first reading, like the cap beside it", () => {
    // Both are typed in, so neither waits on the router to answer.
    const model = buildPopoverModel({
      result: null,
      lastReading: null,
      config: { ...defaultConfig(), planDays: 30 },
      clock,
    });

    expect(model.planDays.value).toBe("30");
  });
});

describe("buildPopoverModel — an anchor but no plan limit configured", () => {
  const model = buildPopoverModel({
    result: online(),
    lastReading: null,
    config: configWith(null, anchorOf(12_000_000_000)),
    clock,
  });

  it("marks the dial unavailable rather than reporting 0%", () => {
    expect(model.progress.available).toBe(false);
    expect(model.progress.label).toBe("—");
    expect(model.progress.sweep).toBe(0);
  });

  it("prompts the user to set a limit, since that is the missing half", () => {
    expect(model.progress.prompt).toMatch(/limit/i);
  });

  it("describes the dial by the limit it does not have", () => {
    expect(model.progress.description).toMatch(/limit/i);
  });

  it("shows a dash for the plan consumed — the cap it needs is unset", () => {
    expect(model.monthTotal).toBe("—");
  });

  it("still reports the router's own counters and the carrier's figure", () => {
    expect(model.monthDownload).toBe("4.43 Go");
    expect(model.monthUpload).toBe("1.40 Go");
    expect(model.allowance.remaining).toBe("12.00 Go");
    expect(model.carrier).toBe("Yas");
  });
});

describe("buildPopoverModel — a plan limit but nothing synced yet", () => {
  const model = buildPopoverModel({
    result: online(),
    lastReading: null,
    config: configWith(20_000_000_000),
    clock,
  });

  it("leaves the dial unavailable rather than drawing the router's counter", () => {
    expect(model.progress.available).toBe(false);
    expect(model.progress.label).toBe("—");
    expect(model.progress.sweep).toBe(0);
  });

  it("asks for a sync rather than mentioning the limit, which is already set", () => {
    expect(model.progress.prompt).toMatch(/sync/i);
    expect(model.progress.prompt).not.toMatch(/limit/i);
  });

  it("shows a dash for the plan consumed", () => {
    expect(model.monthTotal).toBe("—");
  });
});

describe("buildPopoverModel — the anchor behind the dial has gone stale", () => {
  // Counter reset under the anchor: the delta is meaningless, so the share is
  // not something the carrier stands behind any more.
  const model = buildPopoverModel({
    result: online({
      month: {
        monthDownloadBytes: 400_000_000,
        monthUploadBytes: 0,
        monthDurationSeconds: 27_960,
        monthLastClearTime: "2026-8-1",
      },
    }),
    lastReading: null,
    config: configWith(20_000_000_000, anchorOf(12_000_000_000)),
    clock,
  });

  it("withdraws the dial rather than drawing a share it cannot stand behind", () => {
    expect(model.progress.available).toBe(false);
    expect(model.progress.sweep).toBe(0);
  });

  it("asks for a sync", () => {
    expect(model.progress.prompt).toMatch(/sync/i);
  });

  it("keeps showing the last honest figure, marked", () => {
    expect(model.allowance.available).toBe(true);
    expect(model.allowance.stale).toBe(true);
    expect(model.allowance.remaining).toBe("12.00 Go");
  });
});

describe("buildPopoverModel — the router is unreachable", () => {
  const model = buildPopoverModel({
    result: OFFLINE,
    lastReading: { snapshot: snapshot(), at: SEVEN_HOURS_AGO },
    config: configWith(20_000_000_000, anchorOf(12_000_000_000)),
    clock,
  });

  it("flags the model stale", () => {
    expect(model.freshness.stale).toBe(true);
  });

  it("carries the last successful reading rather than blanking the figures", () => {
    expect(model.monthDownload).toBe("4.43 Go");
    expect(model.monthUpload).toBe("1.40 Go");
    expect(model.progress.label).toBe("40%");
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
    expect(model.allowance.daysUntilExpiry).toBe("—");
  });

  it("leaves the dial unavailable", () => {
    expect(model.progress.available).toBe(false);
    expect(model.progress.sweep).toBe(0);
  });

  it("has no signal to report rather than claiming a level of zero out of zero", () => {
    expect(model.signalBars).toBe(0);
    expect(model.maxSignalBars).toBe(0);
    expect(model.signalDescription).toBe("No signal reading yet");
  });

  it("shows a dash for the network type rather than guessing at one", () => {
    // "No service" would be a claim about the link. Nothing has been read, so
    // the slot gets the same placeholder every other unknown field gets.
    expect(model.networkType).toBe("—");
  });
});

describe("buildPopoverModel — the usage state on the dial", () => {
  const GB = 1_000_000_000;
  const PLAN = 20 * GB;

  /**
   * The model's state for `usedBytes` of a 20 GB plan, expressed the way the
   * carrier does — as the volume still left.
   */
  function stateFor(
    usedBytes: number,
    limitBytes: number | null = PLAN,
    warnThresholdPercent = 90,
  ): string {
    return buildPopoverModel({
      result: online(),
      lastReading: null,
      config: {
        ...configWith(limitBytes, anchorOf(PLAN - usedBytes)),
        warnThresholdPercent,
      },
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

  it('is "over" once the whole plan is consumed', () => {
    // The carrier's remaining is the authority and never goes below zero, so
    // 100% is as far as the dial can read — there is no overrun to draw.
    expect(stateFor(20 * GB)).toBe("over");
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
      config: configWith(20_000_000_000, anchorOf(12_000_000_000)),
      clock,
    });

    expect(model.progress.state).toBe("unknown");
  });

  it("reports the state of the last reading while the router is unreachable", () => {
    const model = buildPopoverModel({
      result: OFFLINE,
      lastReading: { snapshot: snapshot(), at: SEVEN_HOURS_AGO },
      config: configWith(20 * GB, anchorOf(0.5 * GB)),
      clock,
    });

    expect(model.progress.state).toBe("warn");
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
      config: configWith(200_000_000_000, anchor),
      clock,
    });
  }

  it("computes the share used from the cap and what the carrier says is left", () => {
    // 200 Go bought, 90 Go left after the router's 10 Go delta → 55%.
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

  it("has no dial to draw when there is no anchor", () => {
    const model = withAnchor(undefined, online());

    expect(model.progress.available).toBe(false);
    expect(model.progress.label).toBe("—");
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

  it("withdraws the dial once the anchor is stale", () => {
    // The router's own counter is not a substitute: it counts from whenever the
    // device last cleared itself, which is a different month from the plan's.
    const model = withAnchor(ANCHOR, counter(4_000_000_000, "2026-8-1"));

    expect(model.allowance.stale).toBe(true);
    expect(model.progress.available).toBe(false);
    expect(model.progress.label).toBe("—");
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

describe("buildPopoverModel — the pace row", () => {
  const GO = 1_000_000_000;

  /** Ten whole days after {@link NOW}. */
  const IN_TEN_DAYS = new Date(2026, 7, 6);

  /** The model's pace row for one set of stored and typed-in figures. */
  function paceOf(options: {
    remainingGo?: number;
    expiresAt?: Date | null;
    limitGo?: number | null;
    planDays?: number | null;
  }): PopoverModel["pace"] {
    return buildPopoverModel({
      result: online(),
      lastReading: null,
      config: {
        ...defaultConfig(),
        planLimitBytes:
          options.limitGo === undefined || options.limitGo === null
            ? null
            : options.limitGo * GO,
        planDays: options.planDays ?? null,
        allowanceAnchor: anchorOf((options.remainingGo ?? 30) * GO, {
          expiresAt:
            options.expiresAt === undefined ? IN_TEN_DAYS : options.expiresAt,
        }),
      },
      clock,
    }).pace;
  }

  it("is null when nothing has ever been synced", () => {
    const model = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: defaultConfig(),
      clock,
    });

    expect(model.pace).toBeNull();
  });

  it("is null when the carrier stated no expiry to measure against", () => {
    expect(paceOf({ expiresAt: null })).toBeNull();
  });

  it("is null once the expiry has passed", () => {
    expect(paceOf({ expiresAt: new Date(2026, 5, 1) })).toBeNull();
  });

  it("carries tier 1 with the sustainable figure and the date it runs to", () => {
    const pace = paceOf({ remainingGo: 30 });

    expect(pace?.tier).toBe(1);
    expect(pace?.sustainable).toContain("3.00 Go");
    expect(pace?.sustainable).toContain("06/08/2026");
  });

  it("leaves tier 1 with no band, no state and no budget", () => {
    const pace = paceOf({ remainingGo: 30 });

    expect(pace?.band).toBe("");
    expect(pace?.state).toBe("");
    expect(pace?.afforded).toBe("");
    expect(pace?.consumed).toBe("");
  });

  it("adds the consumed share at tier 2, and still no band", () => {
    const pace = paceOf({ remainingGo: 30, limitGo: 150 });

    expect(pace?.tier).toBe(2);
    expect(pace?.consumed).toContain("80%");
    expect(pace?.band).toBe("");
    expect(pace?.state).toBe("");
  });

  it("reports the band, the budget and the sustainable figure at tier 3", () => {
    // The period began on 07/07, so a little over two thirds of it has gone
    // against four fifths of the plan: ahead, but recoverably.
    const pace = paceOf({ remainingGo: 30, limitGo: 150, planDays: 30 });

    expect(pace?.tier).toBe(3);
    expect(pace?.state).toBe("warning");
    expect(pace?.band).not.toBe("");
    expect(pace?.afforded).toContain("5.00 Go");
    expect(pace?.sustainable).toContain("3.00 Go");
  });

  it("gives each band its own state and its own words", () => {
    const safe = paceOf({ remainingGo: 100, limitGo: 150, planDays: 30 });
    const warning = paceOf({ remainingGo: 30, limitGo: 150, planDays: 30 });
    const over = paceOf({ remainingGo: 10, limitGo: 150, planDays: 30 });

    expect([safe?.state, warning?.state, over?.state]).toEqual([
      "safe",
      "warning",
      "over",
    ]);
    expect(new Set([safe?.band, warning?.band, over?.band]).size).toBe(3);
    expect(new Set([safe?.note, warning?.note, over?.note]).size).toBe(3);
  });

  it("names the setting that would sharpen tiers 1 and 2, and none at tier 3", () => {
    expect(paceOf({}).hint).toMatch(/plan/i);
    expect(paceOf({ limitGo: 150 }).hint).toMatch(/day|length|long/i);
    expect(paceOf({ limitGo: 150, planDays: 30 }).hint).toBe("");
  });

  it("formats every daily figure with the octet helper", () => {
    // 10 Go over ten days is exactly a Go a day, which reads as `1.00 Go`.
    const pace = paceOf({ remainingGo: 10, limitGo: 30, planDays: 30 });

    expect(pace?.sustainable).toContain("1.00 Go");
    expect(pace?.afforded).toContain("1.00 Go");
  });

  it("hands the renderer only strings and numbers it need not format", () => {
    const pace = paceOf({ remainingGo: 30, limitGo: 150, planDays: 30 });

    for (const leaf of leaves(pace)) {
      expect(typeof leaf === "string" || typeof leaf === "number").toBe(true);
    }
  });
});
