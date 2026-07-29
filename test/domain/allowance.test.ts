import { describe, expect, it } from "vitest";

import * as allowanceModule from "../../src/domain/allowance.js";
import {
  anchorFrom,
  isAnchorStale,
  isNewPlan,
  needsAutomaticSync,
  readAllowanceNow,
  type AllowanceAnchor,
} from "../../src/domain/allowance.js";
import {
  parseAllowance,
  parseUssdContent,
} from "../../src/hilink/ussd-parse.js";
import type { Clock } from "../../src/domain/quota.js";
import type { Allowance, MonthStatistics } from "../../src/hilink/types.js";

/** The recorded live reading: 145.8359 Go left on a `NET MONTH 200 000` offer. */
const ANCHORED_REMAINING = 145_835_900_000;

/** The router's month counter at the instant of that reading. */
const ANCHORED_COUNTER = 1_000_000_000;

const CLEAR_TIME = "2026-7-27";

/** 27 July 2026, 17:46 local. */
const NOW = new Date(2026, 6, 27, 17, 46, 0);

const clock: Clock = { now: () => NOW };

/** A clock frozen at a local wall-clock instant. */
function fixedClock(
  year: number,
  month: number,
  day: number,
  hour = 9,
  minute = 30,
): Clock {
  return { now: () => new Date(year, month - 1, day, hour, minute) };
}

/** A month counter reading totalling `bytes`, split across download and upload. */
function month(bytes: number, clearTime = CLEAR_TIME): MonthStatistics {
  return {
    monthDownloadBytes: bytes,
    monthUploadBytes: 0,
    monthDurationSeconds: 27_960,
    monthLastClearTime: clearTime,
  };
}

function allowance(overrides: Partial<Allowance> = {}): Allowance {
  return {
    planLabel: "NET MONTH 200 000",
    remainingBytes: ANCHORED_REMAINING,
    expiresAt: new Date(2026, 7, 12),
    ...overrides,
  };
}

function anchor(overrides: Partial<AllowanceAnchor> = {}): AllowanceAnchor {
  return {
    planLabel: "NET MONTH 200 000",
    remainingBytes: ANCHORED_REMAINING,
    expiresAt: new Date(2026, 7, 12),
    routerMonthBytes: ANCHORED_COUNTER,
    routerClearTime: CLEAR_TIME,
    syncedAt: new Date(2026, 6, 27, 10, 0, 0),
    ...overrides,
  };
}

describe("anchorFrom", () => {
  it("records the allowance, the router's counter and its clear time", () => {
    const recorded = anchorFrom(allowance(), month(ANCHORED_COUNTER), clock);

    expect(recorded.planLabel).toBe("NET MONTH 200 000");
    expect(recorded.remainingBytes).toBe(ANCHORED_REMAINING);
    expect(recorded.expiresAt).toEqual(new Date(2026, 7, 12));
    expect(recorded.routerMonthBytes).toBe(ANCHORED_COUNTER);
    expect(recorded.routerClearTime).toBe(CLEAR_TIME);
  });

  it("stamps the anchor with the injected now, never the wall clock", () => {
    expect(anchorFrom(allowance(), month(0), clock).syncedAt).toEqual(NOW);
  });

  it("sums download and upload into one counter", () => {
    const recorded = anchorFrom(
      allowance(),
      {
        monthDownloadBytes: 700_000_000,
        monthUploadBytes: 300_000_000,
        monthDurationSeconds: 27_960,
        monthLastClearTime: CLEAR_TIME,
      },
      clock,
    );

    expect(recorded.routerMonthBytes).toBe(1_000_000_000);
  });

  it("carries an absent expiry through as null", () => {
    const recorded = anchorFrom(
      allowance({ expiresAt: null }),
      month(0),
      clock,
    );

    expect(recorded.expiresAt).toBeNull();
  });
});

describe("readAllowanceNow — the counter delta", () => {
  it("subtracts the counter's growth from the anchored remaining", () => {
    const reading = readAllowanceNow({
      anchor: anchor(),
      month: month(3_000_000_000),
      clock,
    });

    expect(reading.remainingBytes).toBe(143_835_900_000);
    expect(reading.trustworthy).toBe(true);
    expect(reading.staleReason).toBeNull();
  });

  it("returns exactly the anchored remaining when the counter has not moved", () => {
    const reading = readAllowanceNow({
      anchor: anchor(),
      month: month(ANCHORED_COUNTER),
      clock,
    });

    expect(reading.remainingBytes).toBe(ANCHORED_REMAINING);
    expect(reading.trustworthy).toBe(true);
  });

  it("does not drift when read twice from the same counter", () => {
    const input = { anchor: anchor(), month: month(ANCHORED_COUNTER), clock };

    expect(readAllowanceNow(input).remainingBytes).toBe(
      readAllowanceNow(input).remainingBytes,
    );
    expect(readAllowanceNow(input).remainingBytes).toBe(ANCHORED_REMAINING);
  });

  it("carries the carrier's offer name and expiry through", () => {
    const reading = readAllowanceNow({
      anchor: anchor(),
      month: month(3_000_000_000),
      clock,
    });

    expect(reading.planLabel).toBe("NET MONTH 200 000");
    expect(reading.expiresAt).toEqual(new Date(2026, 7, 12));
    expect(reading.syncedAt).toEqual(new Date(2026, 6, 27, 10, 0, 0));
  });
});

describe("readAllowanceNow — a counter that went backwards", () => {
  const reading = readAllowanceNow({
    anchor: anchor(),
    month: month(400_000_000),
    clock,
  });

  it("reports the anchor as stale with a reset reason", () => {
    expect(reading.trustworthy).toBe(false);
    expect(reading.staleReason).toBe("counter-reset");
  });

  it("never reports more than was anchored", () => {
    expect(reading.remainingBytes).toBeLessThanOrEqual(ANCHORED_REMAINING);
    expect(reading.remainingBytes).not.toBeGreaterThan(ANCHORED_REMAINING);
  });

  it("still exposes the last figure it could compute", () => {
    expect(reading.remainingBytes).toBe(ANCHORED_REMAINING);
  });
});

describe("readAllowanceNow — a changed MonthLastClearTime", () => {
  const reading = readAllowanceNow({
    anchor: anchor(),
    month: month(3_000_000_000, "2026-8-1"),
    clock,
  });

  it("reports a reset even though the counter has grown", () => {
    expect(reading.trustworthy).toBe(false);
    expect(reading.staleReason).toBe("counter-reset");
  });

  it("still exposes a figure for the panel to mark", () => {
    expect(reading.remainingBytes).toBe(ANCHORED_REMAINING);
  });
});

describe("readAllowanceNow — an expired anchor", () => {
  const reading = readAllowanceNow({
    anchor: anchor({ expiresAt: new Date(2026, 6, 20) }),
    month: month(3_000_000_000),
    clock,
  });

  it("reports stale with an expiry reason", () => {
    expect(reading.trustworthy).toBe(false);
    expect(reading.staleReason).toBe("expired");
  });

  it("still exposes its last computed remaining", () => {
    expect(reading.remainingBytes).toBe(143_835_900_000);
  });

  it("is trustworthy while the expiry is still ahead", () => {
    const ahead = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 7, 12) }),
      month: month(3_000_000_000),
      clock,
    });

    expect(ahead.trustworthy).toBe(true);
  });

  it("is trustworthy when the carrier stated no expiry at all", () => {
    const undated = readAllowanceNow({
      anchor: anchor({ expiresAt: null }),
      month: month(3_000_000_000),
      clock,
    });

    expect(undated.trustworthy).toBe(true);
    expect(undated.daysUntilExpiry).toBeNull();
  });

  it("reports the reset before the expiry when both are wrong", () => {
    const both = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 6, 20) }),
      month: month(400_000_000),
      clock,
    });

    expect(both.staleReason).toBe("counter-reset");
  });
});

describe("readAllowanceNow — an exhausted allowance", () => {
  const reading = readAllowanceNow({
    anchor: anchor({ remainingBytes: 2_000_000_000 }),
    month: month(ANCHORED_COUNTER + 5_000_000_000),
    clock,
  });

  it("clamps to zero rather than reporting a negative volume", () => {
    expect(reading.remainingBytes).toBe(0);
    expect(reading.remainingBytes).toBeGreaterThanOrEqual(0);
  });

  it("reports the exhausted state", () => {
    expect(reading.exhausted).toBe(true);
  });

  it("is still trustworthy — exhausted is a real answer, not a stale one", () => {
    expect(reading.trustworthy).toBe(true);
    expect(reading.staleReason).toBeNull();
  });

  it("is not exhausted while any volume is left", () => {
    const left = readAllowanceNow({
      anchor: anchor(),
      month: month(3_000_000_000),
      clock,
    });

    expect(left.exhausted).toBe(false);
  });

  it("is exhausted at exactly zero remaining", () => {
    const exact = readAllowanceNow({
      anchor: anchor({ remainingBytes: 2_000_000_000 }),
      month: month(ANCHORED_COUNTER + 2_000_000_000),
      clock,
    });

    expect(exact.remainingBytes).toBe(0);
    expect(exact.exhausted).toBe(true);
  });
});

describe("needsAutomaticSync", () => {
  it("asks when nothing has ever been synced", () => {
    expect(needsAutomaticSync(undefined, month(ANCHORED_COUNTER), clock)).toBe(
      true,
    );
  });

  it("asks when the carrier's expiry date has passed", () => {
    expect(
      needsAutomaticSync(
        anchor({ expiresAt: new Date(2026, 6, 1) }),
        month(ANCHORED_COUNTER),
        clock,
      ),
    ).toBe(true);
  });

  it("asks when the router restarted its counter under the anchor", () => {
    expect(
      needsAutomaticSync(anchor(), month(ANCHORED_COUNTER, "2026-8-1"), clock),
    ).toBe(true);
  });

  it("stays quiet while the anchor still holds", () => {
    // A dialogue costs tens of seconds and a login against a device that locks
    // the account after five refusals — a healthy anchor is carried forward.
    expect(
      needsAutomaticSync(anchor(), month(ANCHORED_COUNTER + 1_000), clock),
    ).toBe(false);
  });

  it("stays quiet for an anchor the carrier gave no expiry date", () => {
    expect(
      needsAutomaticSync(
        anchor({ expiresAt: null }),
        month(ANCHORED_COUNTER),
        clock,
      ),
    ).toBe(false);
  });
});

describe("the high-water plan total", () => {
  it("is gone — the dial's 100% is the cap the user set, not one inferred", () => {
    // With a single anchor the high-water mark *is* that anchor's remaining, so
    // a dial measured against it reads 0% by construction after a first sync.
    expect(allowanceModule).not.toHaveProperty("planTotalBytes");
  });
});

describe("readAllowanceNow — the share of the plan used", () => {
  it("measures what is left against the cap the user configured", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ remainingBytes: 90_000_000_000 }),
      month: month(ANCHORED_COUNTER),
      planLimitBytes: 200_000_000_000,
      clock,
    });

    // 200 Go bought, 90 Go left → 110 Go used.
    expect(reading.remainingBytes).toBe(90_000_000_000);
    expect(reading.usedBytes).toBe(110_000_000_000);
    expect(reading.percentUsed).toBeCloseTo(55, 9);
  });

  it("reads the screenshot's case as consumed, not as untouched", () => {
    // The bug: 150 Go bought with 143.82 Go left drew an empty ring, because the
    // denominator was the anchored remaining itself.
    const reading = readAllowanceNow({
      anchor: anchor({ remainingBytes: 143_820_000_000 }),
      month: month(ANCHORED_COUNTER),
      planLimitBytes: 150_000_000_000,
      clock,
    });

    expect(reading.usedBytes).toBe(6_180_000_000);
    expect(reading.percentUsed).toBeCloseTo(4.12, 9);
  });

  it("counts the router's delta on top of the anchored consumption", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ remainingBytes: 100_000_000_000 }),
      month: month(ANCHORED_COUNTER + 10_000_000_000),
      planLimitBytes: 200_000_000_000,
      clock,
    });

    expect(reading.remainingBytes).toBe(90_000_000_000);
    expect(reading.usedBytes).toBe(110_000_000_000);
  });

  it("is 0% when the whole cap is still there", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ remainingBytes: 200_000_000_000 }),
      month: month(ANCHORED_COUNTER),
      planLimitBytes: 200_000_000_000,
      clock,
    });

    expect(reading.usedBytes).toBe(0);
    expect(reading.percentUsed).toBe(0);
  });

  it("is 100% once the allowance is exhausted", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ remainingBytes: 2_000_000_000 }),
      month: month(ANCHORED_COUNTER + 9_000_000_000),
      planLimitBytes: 200_000_000_000,
      clock,
    });

    expect(reading.percentUsed).toBe(100);
  });

  it("clamps consumption at zero when the carrier states more than the cap", () => {
    // A cap typed in too low, or a recharge the user has not accounted for.
    // Negative consumption is not a thing the panel can honestly draw.
    const reading = readAllowanceNow({
      anchor: anchor({ remainingBytes: 200_000_000_000 }),
      month: month(ANCHORED_COUNTER),
      planLimitBytes: 150_000_000_000,
      clock,
    });

    expect(reading.usedBytes).toBe(0);
    expect(reading.percentUsed).toBe(0);
  });

  it("reports no share and no consumption when no cap is configured", () => {
    const reading = readAllowanceNow({
      anchor: anchor(),
      month: month(ANCHORED_COUNTER),
      clock,
    });

    // The carrier's own figure survives — only the share of a plan nobody has
    // stated is unavailable.
    expect(reading.remainingBytes).toBe(ANCHORED_REMAINING);
    expect(reading.usedBytes).toBeNull();
    expect(reading.percentUsed).toBeNull();
  });

  it("is null when the anchor is not trustworthy, so no dial is drawn", () => {
    const reading = readAllowanceNow({
      anchor: anchor(),
      month: month(400_000_000),
      planLimitBytes: 200_000_000_000,
      clock,
    });

    expect(reading.percentUsed).toBeNull();
  });
});

describe("readAllowanceNow — daysUntilExpiry", () => {
  it("counts whole days from the injected now to the expiry", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 7, 12) }),
      month: month(ANCHORED_COUNTER),
      clock: fixedClock(2026, 7, 27),
    });

    expect(reading.daysUntilExpiry).toBe(16);
  });

  it("ignores the time of day", () => {
    const early = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 7, 12) }),
      month: month(ANCHORED_COUNTER),
      clock: fixedClock(2026, 7, 27, 0, 1),
    });
    const late = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 7, 12) }),
      month: month(ANCHORED_COUNTER),
      clock: fixedClock(2026, 7, 27, 23, 59),
    });

    expect(early.daysUntilExpiry).toBe(16);
    expect(late.daysUntilExpiry).toBe(16);
  });

  it("is 0 on the expiry day itself", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 7, 12) }),
      month: month(ANCHORED_COUNTER),
      clock: fixedClock(2026, 8, 12, 9, 30),
    });

    expect(reading.daysUntilExpiry).toBe(0);
  });

  it("is 1 the day before the expiry", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 7, 12) }),
      month: month(ANCHORED_COUNTER),
      clock: fixedClock(2026, 8, 11, 23, 0),
    });

    expect(reading.daysUntilExpiry).toBe(1);
  });

  it("goes negative once the expiry is behind us, rather than reading zero", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 7, 12) }),
      month: month(ANCHORED_COUNTER),
      clock: fixedClock(2026, 8, 15),
    });

    expect(reading.daysUntilExpiry).toBe(-3);
  });

  it("is null when the carrier stated no expiry", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ expiresAt: null }),
      month: month(ANCHORED_COUNTER),
      clock,
    });

    expect(reading.daysUntilExpiry).toBeNull();
  });
});

describe("isAnchorStale — whether a usable anchor is still recent", () => {
  const STALE_AFTER_MINUTES = 30;

  /** An anchor stamped `minutes` (and `milliseconds`) before {@link NOW}. */
  function syncedAgo(minutes: number, milliseconds = 0): AllowanceAnchor {
    return anchor({
      syncedAt: new Date(NOW.getTime() - minutes * 60_000 - milliseconds),
    });
  }

  it("is stale 31 minutes after the sync", () => {
    expect(isAnchorStale(syncedAgo(31), NOW, STALE_AFTER_MINUTES)).toBe(true);
  });

  it("is not stale 29 minutes after the sync", () => {
    expect(isAnchorStale(syncedAgo(29), NOW, STALE_AFTER_MINUTES)).toBe(false);
  });

  it("is not yet stale at exactly the window, to the millisecond", () => {
    expect(isAnchorStale(syncedAgo(30), NOW, STALE_AFTER_MINUTES)).toBe(false);
    expect(isAnchorStale(syncedAgo(30, 1), NOW, STALE_AFTER_MINUTES)).toBe(
      true,
    );
  });

  it("honours the configured window rather than a hardcoded 30 minutes", () => {
    expect(isAnchorStale(syncedAgo(45), NOW, 60)).toBe(false);
    expect(isAnchorStale(syncedAgo(45), NOW, 10)).toBe(true);
  });

  it("reports no anchor as not stale, leaving that case to the usability check", () => {
    // Conflating the two would run the same dialogue for two different
    // reasons — "nothing has ever been synced" is not "the figure is old".
    expect(isAnchorStale(undefined, NOW, STALE_AFTER_MINUTES)).toBe(false);
    expect(isAnchorStale(null, NOW, STALE_AFTER_MINUTES)).toBe(false);
    expect(needsAutomaticSync(undefined, month(ANCHORED_COUNTER), clock)).toBe(
      true,
    );
  });

  it("is not stale when the sync is stamped in the future, and throws nothing", () => {
    // A clock moved backwards, or a config hand-edited. Neither is a reason to
    // dial the carrier.
    const ahead = anchor({ syncedAt: new Date(NOW.getTime() + 60 * 60_000) });

    expect(() => isAnchorStale(ahead, NOW, STALE_AFTER_MINUTES)).not.toThrow();
    expect(isAnchorStale(ahead, NOW, STALE_AFTER_MINUTES)).toBe(false);
  });
});

describe("isNewPlan", () => {
  /** The cap the anchored 145.8359 Go comfortably fits inside. */
  const CAP = 200_000_000_000;

  it("is true when the carrier states a different offer name", () => {
    expect(
      isNewPlan(anchor({ planLabel: "NET MONTH 400 000" }), anchor(), CAP),
    ).toBe(true);
  });

  it("is true when the expiry moves later", () => {
    const topped = anchor({ expiresAt: new Date(2026, 8, 12) });

    expect(isNewPlan(topped, anchor(), CAP)).toBe(true);
  });

  it("is true when the remaining volume passes the configured cap", () => {
    // The case a carrier that reuses its offer name would otherwise hide: a
    // 50 Go cap with 145 Go left is a cap that no longer describes the plan.
    expect(isNewPlan(anchor(), anchor(), 50_000_000_000)).toBe(true);
  });

  it("is false when the label, the expiry and the remaining are unchanged", () => {
    expect(isNewPlan(anchor(), anchor(), CAP)).toBe(false);
  });

  it("is false when there is no previous anchor to differ from", () => {
    // A first-ever sync replaces nothing, so it contradicts nothing either.
    expect(isNewPlan(anchor(), undefined, CAP)).toBe(false);
    expect(isNewPlan(anchor(), null, CAP)).toBe(false);
  });

  it("is false when the expiry moved earlier", () => {
    const earlier = anchor({ expiresAt: new Date(2026, 6, 30) });

    expect(isNewPlan(earlier, anchor(), CAP)).toBe(false);
  });

  it("throws nothing when either expiry is null", () => {
    const undated = anchor({ expiresAt: null });

    expect(() => isNewPlan(undated, anchor(), CAP)).not.toThrow();
    expect(() => isNewPlan(anchor(), undated, CAP)).not.toThrow();
    expect(() => isNewPlan(undated, undated, CAP)).not.toThrow();
    expect(isNewPlan(undated, anchor(), CAP)).toBe(false);
    expect(isNewPlan(anchor(), undated, CAP)).toBe(false);
  });

  it("is false when only the remaining grew and no cap is configured", () => {
    // With no cap there is nothing for a larger remainder to contradict.
    const bigger = anchor({ remainingBytes: ANCHORED_REMAINING * 2 });

    expect(isNewPlan(bigger, anchor(), null)).toBe(false);
  });
});

describe("the carrier's last valid day, read end to end from its own reply", () => {
  /**
   * The reply behind the reported bug, verbatim in shape: a 30-day plan bought
   * on 27/07/2026 that the carrier states as running "jusqu'au 25/08/2026".
   */
  const CARRIER_REPLY = parseUssdContent(
    `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<content>NET MONTH 200 000, il vous reste 133.51 Go utilisable a toute heure jusqu'au 25/08/2026.</content>\n<date></date>\n</response>`,
  );

  function anchoredOnTheCarrierReply(): AllowanceAnchor {
    const stated = parseAllowance(CARRIER_REPLY);
    if (stated === null) {
      throw new Error("the recorded carrier reply must state an allowance");
    }

    return anchorFrom(stated, month(ANCHORED_COUNTER), {
      now: () => new Date(2026, 6, 27, 18, 0, 0),
    });
  }

  function readAt(now: Date) {
    return readAllowanceNow({
      anchor: anchoredOnTheCarrierReply(),
      month: month(ANCHORED_COUNTER),
      clock: { now: () => now },
    });
  }

  it("is not expired at the very start of the stated day", () => {
    const reading = readAt(new Date(2026, 7, 25, 0, 0, 0));

    expect(reading.trustworthy).toBe(true);
    expect(reading.staleReason).toBeNull();
  });

  it("is not expired at the very end of the stated day", () => {
    const reading = readAt(new Date(2026, 7, 25, 23, 59, 59, 999));

    expect(reading.trustworthy).toBe(true);
    expect(reading.staleReason).toBeNull();
  });

  it("is expired the day after the stated day", () => {
    const reading = readAt(new Date(2026, 7, 26, 9, 30, 0));

    expect(reading.trustworthy).toBe(false);
    expect(reading.staleReason).toBe("expired");
  });

  it("still counts the stated day as a day of the plan", () => {
    // 29/07 through 25/08 inclusive is 28 days, which is what the user counts.
    expect(readAt(new Date(2026, 6, 29, 16, 33, 0)).daysUntilExpiry).toBe(28);
  });

  it("leaves one day on the stated day itself, not none", () => {
    expect(readAt(new Date(2026, 7, 25, 9, 30, 0)).daysUntilExpiry).toBe(1);
  });
});

describe("src/domain/allowance.ts", () => {
  it("imports neither Electron nor the network", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/domain/allowance.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/from\s+["']electron["']/);
    expect(source).not.toMatch(/node:http|node:https|fetch\(/);
  });
});
