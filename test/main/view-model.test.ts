import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { defaultConfig, type AppConfig } from "../../src/config/defaults.js";
import {
  createRateHistory,
  type RateSample,
} from "../../src/domain/history.js";
import {
  anchorFrom,
  type AllowanceAnchor,
} from "../../src/domain/allowance.js";
import type { Clock } from "../../src/domain/quota.js";
import type { SnapshotResult } from "../../src/hilink/client.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import {
  parseAllowance,
  parseUssdContent,
} from "../../src/hilink/ussd-parse.js";
import { selectForfait } from "../../src/orange/select.js";
import type { OrangeForfait } from "../../src/orange/types.js";
import type { PortalStatus } from "../../src/main/poller.js";
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
    carrier: { carrier: "Yas", id: "yas" },
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

  it("no longer splits the month into a download and an upload total", () => {
    // The plan is billed on their sum, and both the dial and the carrier's own
    // remaining already state that sum. The split cost two rows of a panel
    // that had outgrown its window.
    expect(model).not.toHaveProperty("monthDownload");
    expect(model).not.toHaveProperty("monthUpload");
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
      // Null is a whole section being absent — the pace row, the new-plan
      // confirmation — rather than a figure the renderer would have to format.
      const control =
        leaf === null ||
        leaf === model.progress.sweep ||
        leaf === model.pace?.tier;

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

  it("still reports the carrier's own figure", () => {
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
    expect(model.monthTotal).toBe("8.00 Go");
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

    // The stored instant is the midnight that *ends* the last valid day, so
    // the day printed is the one before it: an anchor expiring at midnight on
    // the 12th is valid through the 11th, and the carrier says so too. The day
    // count is measured against the stored instant and is unaffected.
    expect(model.allowance.expires).toBe("11/08/2026");
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

/**
 * The panel against the parser, with nothing hand-built in between.
 *
 * Every other test in this file writes its own `expiresAt` with `new Date(…)`,
 * so none of them ever sees the instant the parser actually produces — a whole
 * layer insulated from its own input by construction. These drive the recorded
 * carrier reply the whole way through, so a change to how the parser reads
 * "jusqu'au 25/08/2026" cannot pass unnoticed here.
 */
describe("buildPopoverModel — the recorded carrier reply, end to end", () => {
  const allowance = parseAllowance(
    parseUssdContent(
      readFileSync(
        fileURLToPath(
          new URL("../fixtures/hilink/ussd-4-allowance.xml", import.meta.url),
        ),
        "utf8",
      ),
    ),
  );

  function model(): PopoverModel {
    if (allowance === null) throw new Error("the fixture states an allowance");

    return buildPopoverModel({
      result: online(),
      lastReading: null,
      config: {
        ...defaultConfig(),
        allowanceAnchor: anchorFrom(allowance, snapshot().month, clock),
      },
      clock,
    });
  }

  it("prints the day the carrier itself stated, not the one after it", () => {
    // The reply reads "jusqu au 25/08/2026 inclus".
    expect(model().allowance.expires).toBe("25/08/2026");
  });

  it("runs the sustainable figure to that same day", () => {
    expect(model().pace?.sustainable).toContain("25/08/2026");
  });

  it("still counts the stated day as a day of the plan", () => {
    // 27 July through 25 August inclusive. T-46 settled this count; printing
    // the right day must not move it.
    expect(model().allowance.daysUntilExpiry).toBe("30 days");
  });
});

describe("buildPopoverModel — an allowance the carrier gave no expiry for", () => {
  function model(): PopoverModel {
    return buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWith(
        20_000_000_000,
        anchorOf(12_000_000_000, { expiresAt: null }),
      ),
      clock,
    });
  }

  it("marks the expiry absent rather than throwing", () => {
    expect(() => model()).not.toThrow();
    expect(model().allowance.expires).toBe("—");
    expect(model().allowance.daysUntilExpiry).toBe("—");
  });

  it("has no pace row to run to a date it does not have", () => {
    expect(model().pace).toBeNull();
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
    planCapConfirmed?: boolean;
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
        ...(options.planCapConfirmed === undefined
          ? {}
          : { planCapConfirmed: options.planCapConfirmed }),
        allowanceAnchor: anchorOf((options.remainingGo ?? 30) * GO, {
          expiresAt:
            options.expiresAt === undefined ? IN_TEN_DAYS : options.expiresAt,
        }),
      },
      clock,
    }).pace;
  }

  /**
   * Every state the pace row can be read in, named — the three tiers and
   * T-42's unconfirmed cap, which falls back to tier 1 with the same figures
   * typed in that would otherwise reach tier 3.
   */
  function everyPaceState(): Record<string, PopoverModel["pace"]> {
    const TIER_3 = { remainingGo: 30, limitGo: 150, planDays: 30 };

    return {
      "tier 1": paceOf({ remainingGo: 30 }),
      "tier 2": paceOf({ remainingGo: 30, limitGo: 150 }),
      "tier 3": paceOf(TIER_3),
      "tier 3 with the cap unconfirmed": paceOf({
        ...TIER_3,
        planCapConfirmed: false,
      }),
    };
  }

  /**
   * Which of the two pace figures a state actually shows.
   *
   * `both` and `neither` are returned rather than thrown so that a state
   * holding either of them names itself in the diff — a panel with no pace
   * figure at all is the failure that separate per-state assertions would
   * leave open.
   */
  function figureShown(pace: PopoverModel["pace"]): string {
    const meter = (pace?.meter ?? null) !== null;
    const line = (pace?.sustainable ?? "") !== "";

    if (meter && line) return "both";
    if (!meter && !line) return "neither";

    return meter ? "meter" : "recovery line";
  }

  it("shows the meter or the recovery line, never both and never neither", () => {
    // One invariant across every state rather than a rule per tier. The meter
    // states the pace backwards — what has been spent a day against what the
    // plan affords a day — and the recovery line states it forwards, what is
    // left to spend a day. Read side by side the two contradict each other, so
    // where the meter speaks it speaks alone; where there is no meter the line
    // is the only pace reading there is, and it must never be dropped with it.
    expect(
      Object.fromEntries(
        Object.entries(everyPaceState()).map(([state, pace]) => [
          state,
          figureShown(pace),
        ]),
      ),
    ).toEqual({
      "tier 1": "recovery line",
      "tier 2": "recovery line",
      "tier 3": "meter",
      "tier 3 with the cap unconfirmed": "recovery line",
    });
  });

  it("keeps every surviving figure byte-identical while the recovery line goes", () => {
    // T-43, T-44, T-46 and T-47 settled these values, three of the four as bug
    // fixes. Taking a line off tier 3 must not perturb a number anywhere else,
    // so each figure is pinned in the state that still shows it.
    const states = everyPaceState();

    expect({
      "tier 1": states["tier 1"]?.sustainable,
      "tier 2": states["tier 2"]?.sustainable,
      "tier 3 spent": states["tier 3"]?.meter?.average,
      "tier 3 budget": states["tier 3"]?.meter?.afforded,
      "unconfirmed cap": states["tier 3 with the cap unconfirmed"]?.sustainable,
    }).toEqual({
      "tier 1": "3.00 Go a day left to spend until 05/08/2026",
      "tier 2": "3.00 Go a day left to spend until 05/08/2026",
      "tier 3 spent": "5.79 Go",
      "tier 3 budget": "5.00 Go",
      "unconfirmed cap": "3.00 Go a day left to spend until 05/08/2026",
    });
  });

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
    // Ten whole days of plan run to the midnight opening the 6th, which is the
    // end of the 5th — the last day the figure is meant to cover.
    expect(pace?.sustainable).toContain("05/08/2026");
  });

  it("says the figure is what is left to spend, not what has been spent", () => {
    // Read beside the meter's `6.00 Go / 5.00 Go`, an unlabelled `3.00 Go a
    // day` looks like a third opinion on the same question. It is not: this one
    // answers what remains to spend from now, and has to say so itself.
    expect(paceOf({ remainingGo: 30 })?.sustainable).toBe(
      "3.00 Go a day left to spend until 05/08/2026",
    );
  });

  it("leaves tier 1 with no state and no meter to measure against", () => {
    const pace = paceOf({ remainingGo: 30 });

    expect(pace?.state).toBe("");
    expect(pace?.meter).toBeNull();
  });

  it("still has no meter at tier 2 — there is no afforded figure yet", () => {
    const pace = paceOf({ remainingGo: 30, limitGo: 150 });

    expect(pace?.tier).toBe(2);
    expect(pace?.meter).toBeNull();
    expect(pace?.state).toBe("");
  });

  it("reports the band and the budget at tier 3, and no recovery line", () => {
    // The period began on 07/07, so a little over two thirds of it has gone
    // against four fifths of the plan: ahead, but recoverably.
    const pace = paceOf({ remainingGo: 30, limitGo: 150, planDays: 30 });

    expect(pace?.tier).toBe(3);
    expect(pace?.state).toBe("warning");
    expect(pace?.meter?.state).toBe("warning");
    expect(pace?.meter?.afforded).toBe("5.00 Go");
    expect(pace?.sustainable).toBe("");
  });

  it("gives each band its own state", () => {
    const safe = paceOf({ remainingGo: 100, limitGo: 150, planDays: 30 });
    const warning = paceOf({ remainingGo: 30, limitGo: 150, planDays: 30 });
    const over = paceOf({ remainingGo: 10, limitGo: 150, planDays: 30 });

    expect([safe?.state, warning?.state, over?.state]).toEqual([
      "safe",
      "warning",
      "over",
    ]);
    expect([
      safe?.meter?.state,
      warning?.meter?.state,
      over?.meter?.state,
    ]).toEqual(["safe", "warning", "over"]);
  });

  it("no longer narrates the band, the budget or the consumed share", () => {
    const pace = paceOf({ remainingGo: 30, limitGo: 150, planDays: 30 });

    for (const field of ["band", "consumed", "afforded", "note"]) {
      expect(pace).not.toHaveProperty(field);
    }
  });

  it("names the setting that would sharpen tiers 1 and 2, and none at tier 3", () => {
    expect(paceOf({}).hint).toMatch(/plan/i);
    expect(paceOf({ limitGo: 150 }).hint).toMatch(/day|length|long/i);
    expect(paceOf({ limitGo: 150, planDays: 30 }).hint).toBe("");
  });

  it("formats every daily figure with the octet helper", () => {
    // 10 Go over ten days is exactly a Go a day, which reads as `1.00 Go`, and
    // so does a 30 Go plan spread over 30 days. Each is read in the tier that
    // still shows it: the recovery figure at tier 1, the budget at tier 3.
    expect(paceOf({ remainingGo: 10 })?.sustainable).toContain("1.00 Go");
    expect(
      paceOf({ remainingGo: 10, limitGo: 30, planDays: 30 })?.meter?.afforded,
    ).toBe("1.00 Go");
  });

  it("hands the renderer only strings and numbers it need not format", () => {
    const pace = paceOf({ remainingGo: 30, limitGo: 150, planDays: 30 });

    for (const leaf of leaves(pace)) {
      expect(typeof leaf === "string" || typeof leaf === "number").toBe(true);
    }
  });
});

describe("buildPopoverModel — the pace meter", () => {
  const GO = 1_000_000_000;
  const DAY_MS = 86_400_000;

  /**
   * The pace row for a plan of `limitGo` running `planDays`, `elapsedDays` into
   * its period with `usedGo` spent.
   *
   * The expiry is counted forward from {@link NOW} rather than written as a
   * date, so the period's start — and with it the elapsed share the ratio
   * divides by — is exact rather than approximately a fortnight.
   */
  function paceOf(options: {
    usedGo: number;
    limitGo: number;
    planDays: number;
    elapsedDays: number;
  }): PopoverModel["pace"] {
    return buildPopoverModel({
      result: online(),
      lastReading: null,
      config: {
        ...defaultConfig(),
        planLimitBytes: options.limitGo * GO,
        planDays: options.planDays,
        allowanceAnchor: anchorOf((options.limitGo - options.usedGo) * GO, {
          expiresAt: new Date(
            NOW.getTime() + (options.planDays - options.elapsedDays) * DAY_MS,
          ),
        }),
      },
      clock,
    }).pace;
  }

  /** 100 Go of a 150 Go plan, 20 days into 30: a pace of exactly 1. */
  const ON_BUDGET = {
    usedGo: 100,
    limitGo: 150,
    planDays: 30,
    elapsedDays: 20,
  };

  it("exposes the fill, the band and both volumes, and nothing else to work out", () => {
    const meter = paceOf(ON_BUDGET)?.meter;

    expect(meter).not.toBeNull();
    expect(typeof meter?.fill).toBe("number");
    expect(typeof meter?.tick).toBe("number");
    expect(meter?.state).toBe("safe");
    expect(meter?.average).toBe("5.00 Go");
    expect(meter?.afforded).toBe("5.00 Go");
    // Colour is never the only carrier of the verdict, so the meter says in
    // words what it says in hue.
    expect(meter?.description).not.toBe("");
  });

  it("fills exactly to the tick when the spending matches the budget", () => {
    const meter = paceOf(ON_BUDGET)?.meter;

    expect(meter?.fill).toBeCloseTo(meter?.tick ?? 0, 10);
  });

  it("fills half of the tick when half the budget is being spent", () => {
    const meter = paceOf({ ...ON_BUDGET, usedGo: 50 })?.meter;

    expect(meter?.fill).toBeCloseTo((meter?.tick ?? 0) / 2, 10);
  });

  it("clamps a runaway pace at the drawn maximum, numerals still true", () => {
    // 112.5 Go of 150 in a quarter of the period: a pace of 3, which would
    // otherwise draw a bar one and a half times the panel's width.
    const meter = paceOf({
      usedGo: 112.5,
      limitGo: 150,
      planDays: 30,
      elapsedDays: 7.5,
    })?.meter;

    expect(meter?.fill).toBe(1);
    expect(meter?.average).toBe("15.00 Go");
    expect(meter?.afforded).toBe("5.00 Go");
    expect(meter?.state).toBe("over");
  });

  it("bands the fill safe, warning and over on the same three thresholds", () => {
    const safe = paceOf(ON_BUDGET)?.meter;
    const warning = paceOf({ ...ON_BUDGET, usedGo: 110 })?.meter;
    const over = paceOf({ ...ON_BUDGET, usedGo: 120 })?.meter;

    expect([safe?.state, warning?.state, over?.state]).toEqual([
      "safe",
      "warning",
      "over",
    ]);
    // The fill grows with the pace whatever the band, so the bar says by how
    // much where the colour only says which.
    expect(safe?.fill).toBeLessThan(warning?.fill ?? 0);
    expect(warning?.fill).toBeLessThan(over?.fill ?? 0);
  });

  it("reads both volumes in Go through the app's own French formatter", () => {
    const meter = paceOf({ ...ON_BUDGET, usedGo: 110 })?.meter;

    expect(meter?.average).toBe("5.50 Go");
    expect(meter?.afforded).toBe("5.00 Go");
  });

  it("keeps both meter figures byte-identical while the labels move", () => {
    // The other half of T-48's guard: whatever words end up beside these two
    // numerals, the numerals themselves are settled.
    expect(paceOf(ON_BUDGET)?.meter?.average).toBe("5.00 Go");
    expect(paceOf(ON_BUDGET)?.meter?.afforded).toBe("5.00 Go");
    expect(paceOf({ ...ON_BUDGET, usedGo: 120 })?.meter?.average).toBe(
      "6.00 Go",
    );
    expect(paceOf({ ...ON_BUDGET, usedGo: 120 })?.meter?.afforded).toBe(
      "5.00 Go",
    );
  });

  it("keeps the band's verdict in the meter's accessible name", () => {
    // Whatever the visible labels say, the bar's own name still carries the
    // band in words — colour is never the only carrier of the verdict.
    expect(paceOf(ON_BUDGET)?.meter?.description).toContain("On track");
    expect(paceOf({ ...ON_BUDGET, usedGo: 110 })?.meter?.description).toContain(
      "A little fast",
    );
    expect(paceOf({ ...ON_BUDGET, usedGo: 120 })?.meter?.description).toContain(
      "Too fast",
    );
  });
});

describe("buildPopoverModel — an unconfirmed plan cap", () => {
  const GO = 1_000_000_000;

  /** Ten whole days after {@link NOW}, so the pace has a run of days. */
  const IN_TEN_DAYS = new Date(2026, 7, 6);

  /** A live model for a 150 Go plan with 30 Go left, cap confirmed or not. */
  function modelWith(planCapConfirmed: boolean): PopoverModel {
    return buildPopoverModel({
      result: online(),
      lastReading: null,
      config: {
        ...defaultConfig(),
        planLimitBytes: 150 * GO,
        planDays: 30,
        planCapConfirmed,
        allowanceAnchor: anchorOf(30 * GO, { expiresAt: IN_TEN_DAYS }),
      },
      clock,
    });
  }

  const unconfirmed = modelWith(false);
  const confirmed = modelWith(true);

  it("draws no dial, because the share would come from a contradicted cap", () => {
    expect(confirmed.progress.available).toBe(true);
    expect(unconfirmed.progress.available).toBe(false);
    expect(unconfirmed.progress.label).toBe("—");
    expect(unconfirmed.progress.sweep).toBe(0);
  });

  it("states no consumed volume either — that is the same subtraction", () => {
    expect(unconfirmed.monthTotal).toBe("—");
  });

  it("drops the pace to tier 1, keeping the reading that needs no cap", () => {
    expect(confirmed.pace?.tier).toBe(3);
    expect(unconfirmed.pace?.tier).toBe(1);
    // Tier 1 is the anchor alone — remaining over days left — so it is still
    // true whatever the cap says, and here it is the whole pace row: the
    // confirmed model shows a meter instead and so states no recovery line.
    expect(unconfirmed.pace?.sustainable).toBe(
      "3.00 Go a day left to spend until 05/08/2026",
    );
    expect(confirmed.pace?.sustainable).toBe("");
  });

  it("empties every tier 2 and tier 3 field of the pace", () => {
    expect(unconfirmed.pace?.state).toBe("");
  });

  it("draws no meter either — the band would come from the same cap", () => {
    expect(confirmed.pace?.meter).not.toBeNull();
    expect(unconfirmed.pace?.meter).toBeNull();
  });

  it("asks for the cap to be confirmed instead of leaving a hole", () => {
    expect(confirmed.planCapPrompt).toBeNull();
    expect(unconfirmed.planCapPrompt).not.toBeNull();
    expect(unconfirmed.planCapPrompt?.message).not.toBe("");
    expect(unconfirmed.planCapPrompt?.confirmLabel).not.toBe("");
    expect(unconfirmed.planCapPrompt?.description).not.toBe("");
  });

  it("says so on the dial's own prompt, where the ring used to be", () => {
    expect(unconfirmed.progress.prompt).not.toBe("");
    // Not the "set a plan limit" line: one is stored, it is simply in doubt.
    expect(unconfirmed.progress.prompt).not.toMatch(/^Set a plan limit/);
  });

  it("keeps the stored cap in the field, so confirming costs no retyping", () => {
    expect(unconfirmed.planLimit.value).toBe("150");
  });

  it("hands the renderer only strings and numbers it need not format", () => {
    for (const leaf of leaves(unconfirmed.planCapPrompt)) {
      expect(typeof leaf === "string" || typeof leaf === "number").toBe(true);
    }
  });
});

/**
 * Orange states the reverse of YAS — a consumed volume, no remaining and no
 * expiry — and it states it on a page that answers only on the Orange network.
 * So the panel has two independent sources under it, and the point of most of
 * what follows is that one of them failing says nothing about the other.
 */
const ORANGE_SNAPSHOT = snapshot({
  carrier: { carrier: "ORANGE MG", id: "orange" },
});

const ORANGE_ONLINE: SnapshotResult = {
  online: true,
  snapshot: ORANGE_SNAPSHOT,
};

/** The live capture: 7.37 Go consumed of a Wifiber plan that states no cap. */
const WIFIBER: OrangeForfait = {
  label: "Wifiber Go+ SSE",
  nature: "Internet",
  bundleType: "data",
  consumedBytes: 7_370_000_000,
};

/** A portal reading taken 7h 46m ago, answering or not as `live` says. */
function portal(live: boolean): PortalStatus {
  return {
    reading: {
      forfait: WIFIBER,
      candidates: [WIFIBER],
      remembered: false,
      at: SEVEN_HOURS_AGO,
    },
    live,
  };
}

describe("buildPopoverModel — Orange, with the router and the portal both answering", () => {
  const model = buildPopoverModel({
    result: ORANGE_ONLINE,
    lastReading: null,
    config: configWith(20_000_000_000),
    portal: portal(true),
    clock,
  });

  it("headlines the portal's consumed figure, not the router's counter", () => {
    // The router counted 5.83 Go over the same period. The two count different
    // traffic, and the carrier's own figure is the one the panel stands behind.
    expect(model.monthTotal).toBe("7.37 Go");
  });

  it("draws the dial from the portal figure against the typed cap", () => {
    expect(model.progress.available).toBe(true);
    expect(model.progress.label).toBe("37%");
  });

  it("names the forfait it is measuring and what is left of the cap", () => {
    expect(model.allowance.available).toBe(true);
    expect(model.allowance.planLabel).toBe("Wifiber Go+ SSE");
    expect(model.allowance.remaining).toBe("12.63 Go");
    expect(model.allowance.stale).toBe(false);
  });

  it("states no expiry, because the portal states none", () => {
    expect(model.allowance.expires).toBe("—");
    expect(model.allowance.daysUntilExpiry).toBe("—");
  });

  it("draws the pace against the calendar month rather than a typed length", () => {
    // 27 days into a 31 day July: 7.37 Go so far is 272.96 Mo a day against the
    // 645.16 Mo a day the cap affords.
    expect(model.pace?.meter?.average).toBe("272.96 Mo");
    expect(model.pace?.meter?.afforded).toBe("645.16 Mo");
    expect(model.pace?.meter?.state).toBe("safe");
  });

  it("reads live, since the router answered", () => {
    expect(model.freshness.stale).toBe(false);
    expect(model.freshness.label).toBe("Live");
    expect(model.carrier).toBe("ORANGE MG");
  });
});

describe("buildPopoverModel — Orange, with an anchor left over from Yas", () => {
  const model = buildPopoverModel({
    result: ORANGE_ONLINE,
    lastReading: null,
    config: configWith(20_000_000_000, anchorOf(12_000_000_000)),
    portal: portal(true),
    clock,
  });

  it("reads the portal and never the anchor", () => {
    // The anchor says 12.00 Go left and names a plan that expires next month.
    // Neither reaches the panel: on Orange the anchor apparatus stands down.
    expect(model.allowance.remaining).toBe("12.63 Go");
    expect(model.allowance.expires).toBe("—");
    expect(model.allowance.planLabel).toBe("Wifiber Go+ SSE");
  });

  it("never calls the Sync button to attention, having nothing to sync", () => {
    expect(model.sync.attention).toBe(false);
  });
});

describe("buildPopoverModel — Orange, a live router and an unreachable portal", () => {
  const model = buildPopoverModel({
    result: ORANGE_ONLINE,
    lastReading: null,
    config: configWith(20_000_000_000),
    portal: portal(false),
    clock,
  });

  it("keeps the connection live rather than going blanket offline", () => {
    expect(model.freshness.stale).toBe(false);
    expect(model.freshness.label).toBe("Live");
  });

  it("still shows live throughput and signal from the router", () => {
    expect(model.downloadRate).toBe("2.4 Ko/s");
    expect(model.uploadRate).toBe("0 o/s");
    expect(model.signalBars).toBe(4);
    expect(model.maxSignalBars).toBe(5);
    expect(model.connectedDevices).toBe("3");
  });

  it("shows the last allowance the portal gave, marked stale and said why", () => {
    expect(model.allowance.available).toBe(true);
    expect(model.allowance.remaining).toBe("12.63 Go");
    expect(model.allowance.stale).toBe(true);
    expect(model.allowance.note).not.toBe("");
  });

  it("never surfaces the portal's reason as an error to the renderer", () => {
    for (const leaf of leaves(model)) {
      expect(leaf).not.toBe("unreachable");
    }
  });
});

describe("buildPopoverModel — Orange, an unreachable router and a live portal", () => {
  const model = buildPopoverModel({
    result: OFFLINE,
    lastReading: { snapshot: ORANGE_SNAPSHOT, at: SEVEN_HOURS_AGO },
    config: configWith(20_000_000_000),
    portal: portal(true),
    clock,
  });

  it("reports the connection as the thing that is down", () => {
    expect(model.freshness.stale).toBe(true);
    expect(model.freshness.age).toBe("7h 46m");
  });

  it("keeps the allowance, which the router was never the source of", () => {
    expect(model.allowance.available).toBe(true);
    expect(model.allowance.remaining).toBe("12.63 Go");
    expect(model.allowance.stale).toBe(false);
    expect(model.monthTotal).toBe("7.37 Go");
  });
});

describe("buildPopoverModel — Orange, with no cap typed in yet", () => {
  const model = buildPopoverModel({
    result: ORANGE_ONLINE,
    lastReading: null,
    config: configWith(null),
    portal: portal(true),
    clock,
  });

  it("still states the consumed volume, which needs no cap", () => {
    expect(model.monthTotal).toBe("7.37 Go");
  });

  it("draws no dial, and asks for the one thing that would", () => {
    expect(model.progress.available).toBe(false);
    expect(model.progress.prompt).toMatch(/limit/i);
  });

  it("has no remaining volume and no pace, both of which need a total", () => {
    expect(model.allowance.remaining).toBe("—");
    expect(model.pace).toBeNull();
  });
});

describe("buildPopoverModel — Orange, before the portal has answered once", () => {
  const model = buildPopoverModel({
    result: ORANGE_ONLINE,
    lastReading: null,
    config: configWith(20_000_000_000),
    portal: { reading: null, live: false },
    clock,
  });

  it("shows no allowance rather than inventing a zero", () => {
    expect(model.allowance.available).toBe(false);
    expect(model.monthTotal).toBe("—");
    expect(model.progress.available).toBe(false);
  });

  it("still shows every figure the router itself produced", () => {
    expect(model.downloadRate).toBe("2.4 Ko/s");
    expect(model.connectedDevices).toBe("3");
    expect(model.carrier).toBe("ORANGE MG");
    expect(model.signalBars).toBe(4);
  });
});

/**
 * A second data forfait beside the Wifiber plan, so a choice has something to
 * choose between. Alike in nature and bundle type — the two differ only in
 * which one the user meant.
 */
const TOP_UP: OrangeForfait = {
  label: "Pass Internet 5 Go",
  nature: "Internet",
  bundleType: "data",
  consumedBytes: 1_000_000_000,
};

/** A voice bundle, which `selectForfait` never carries into the candidates. */
const VOICE: OrangeForfait = {
  label: "Pass Appel 100 min",
  nature: "Voix",
  bundleType: "voice",
};

/**
 * A portal standing built from a real selection over `forfaits`, so what the
 * panel is handed is exactly what the poller would hand it.
 */
function portalOver(
  forfaits: readonly OrangeForfait[],
  rememberedLabel?: string,
): PortalStatus {
  const selection = selectForfait(forfaits, rememberedLabel);

  return {
    reading: {
      forfait: selection.selected,
      candidates: selection.candidates,
      remembered: selection.remembered,
      at: SEVEN_HOURS_AGO,
    },
    live: true,
  };
}

/** The Orange panel for one portal standing, against a 20 Go cap. */
function orangeModel(status: PortalStatus): PopoverModel {
  return buildPopoverModel({
    result: ORANGE_ONLINE,
    lastReading: null,
    config: configWith(20_000_000_000),
    portal: status,
    clock,
  });
}

/** A Yas panel with an anchor behind it, for the carrier the branch spares. */
function yasModel(): PopoverModel {
  return buildPopoverModel({
    result: online(),
    lastReading: null,
    config: configWith(20_000_000_000, anchorOf(12_000_000_000)),
    clock,
  });
}

describe("buildPopoverModel — which controls each carrier's panel offers", () => {
  it("drops the Sync button and the plan length on Orange", () => {
    const model = orangeModel(portal(true));

    // Neither has anything behind it: there is no dialogue to press for, and
    // the calendar month overrules any length the user could type.
    expect(model.controls.sync).toBe(false);
    expect(model.controls.planDays).toBe(false);
  });

  it("keeps the plan cap on Orange, which the portal never states", () => {
    const model = orangeModel(portal(true));

    expect(model.planLimit.value).toBe("20");
    expect(model.planLimit.description).not.toBe("");
  });

  it("offers every control on Yas, exactly as it always did", () => {
    expect(yasModel().controls.sync).toBe(true);
    expect(yasModel().controls.planDays).toBe(true);
  });

  it("offers every control before any reading has named a carrier", () => {
    const model = buildPopoverModel({
      result: null,
      lastReading: null,
      config: configWith(20_000_000_000),
      clock,
    });

    expect(model.controls.sync).toBe(true);
    expect(model.controls.planDays).toBe(true);
  });
});

describe("buildPopoverModel — the forfait the Orange panel names", () => {
  it("names the detected plan, which is the evidence detection worked", () => {
    expect(orangeModel(portal(true)).forfait?.label).toBe("Wifiber Go+ SSE");
  });

  it("has no forfait section on Yas, where there is no such page", () => {
    expect(yasModel().forfait).toBeNull();
  });

  it("offers nothing to choose when the page listed one data plan", () => {
    const model = orangeModel(portalOver([WIFIBER, VOICE]));

    expect(model.forfait?.label).toBe("Wifiber Go+ SSE");
    expect(model.forfait?.note).toBe("");
    expect(model.forfait?.alternatives).toEqual([]);
  });

  it("says it picked, and lists the others, when several were live", () => {
    const model = orangeModel(portalOver([WIFIBER, TOP_UP]));

    expect(model.forfait?.label).toBe("Wifiber Go+ SSE");
    expect(model.forfait?.note).not.toBe("");
    expect(model.forfait?.alternatives.map((one) => one.label)).toEqual([
      "Pass Internet 5 Go",
    ]);
  });

  it("never offers the plan it is already measuring", () => {
    const labels = orangeModel(
      portalOver([WIFIBER, TOP_UP]),
    ).forfait?.alternatives.map((one) => one.label);

    expect(labels).not.toContain("Wifiber Go+ SSE");
  });

  it("never offers a voice bundle, which is not a data plan at all", () => {
    const labels = orangeModel(
      portalOver([WIFIBER, TOP_UP, VOICE]),
    ).forfait?.alternatives.map((one) => one.label);

    expect(labels).toEqual(["Pass Internet 5 Go"]);
  });

  it("gives every alternative an accessible name of its own", () => {
    const alternatives =
      orangeModel(portalOver([WIFIBER, TOP_UP])).forfait?.alternatives ?? [];

    expect(alternatives).not.toHaveLength(0);

    for (const alternative of alternatives) {
      expect(alternative.description).not.toBe("");
      expect(alternative.description).toContain(alternative.label);
    }
  });

  it("stops offering once the choice is the user's own", () => {
    const model = orangeModel(
      portalOver([WIFIBER, TOP_UP], "Pass Internet 5 Go"),
    );

    // The panel names what it measures and says nothing further: the choice
    // was made, so there is nothing left to disclose.
    expect(model.forfait?.label).toBe("Pass Internet 5 Go");
    expect(model.forfait?.note).toBe("");
    expect(model.forfait?.alternatives).toEqual([]);
  });

  it("measures the remembered plan, so the dial follows the choice", () => {
    const model = orangeModel(
      portalOver([WIFIBER, TOP_UP], "Pass Internet 5 Go"),
    );

    // 1.00 Go consumed on the top-up, against the Wifiber plan's 7.37 Go.
    expect(model.monthTotal).toBe("1.00 Go");
    expect(model.allowance.planLabel).toBe("Pass Internet 5 Go");
  });

  it("hands the renderer only strings it need not format", () => {
    const model = orangeModel(portalOver([WIFIBER, TOP_UP]));

    for (const leaf of leaves(model.forfait)) {
      expect(typeof leaf).toBe("string");
    }
  });

  it("hands the renderer plain flags for the control set", () => {
    for (const leaf of leaves(orangeModel(portal(true)).controls)) {
      expect(typeof leaf).toBe("boolean");
    }
  });
});
