import { describe, expect, it } from "vitest";

import {
  anchorFrom,
  planTotalBytes,
  readAllowanceNow,
  type AllowanceAnchor,
} from "../../src/domain/allowance.js";
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

describe("planTotalBytes", () => {
  it("is the anchored remaining when nothing has been remembered yet", () => {
    expect(planTotalBytes(anchor(), null)).toBe(ANCHORED_REMAINING);
  });

  it("does not fall when a later sync anchors a smaller remaining", () => {
    expect(
      planTotalBytes(
        anchor({ remainingBytes: 20_000_000_000 }),
        ANCHORED_REMAINING,
      ),
    ).toBe(ANCHORED_REMAINING);
  });

  it("rises when a later sync anchors a larger remaining", () => {
    expect(
      planTotalBytes(
        anchor({ remainingBytes: 200_000_000_000 }),
        ANCHORED_REMAINING,
      ),
    ).toBe(200_000_000_000);
  });

  it("keeps the remembered high-water mark when there is no anchor at all", () => {
    expect(planTotalBytes(null, ANCHORED_REMAINING)).toBe(ANCHORED_REMAINING);
  });

  it("is null when nothing has ever been anchored", () => {
    expect(planTotalBytes(null, null)).toBeNull();
  });

  it("is the dial's 100% in the reading", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ remainingBytes: 20_000_000_000 }),
      month: month(ANCHORED_COUNTER),
      planTotalBytes: ANCHORED_REMAINING,
      clock,
    });

    expect(reading.planTotalBytes).toBe(ANCHORED_REMAINING);
  });

  it("falls back to the anchor's own remaining when none is remembered", () => {
    const reading = readAllowanceNow({
      anchor: anchor(),
      month: month(ANCHORED_COUNTER),
      clock,
    });

    expect(reading.planTotalBytes).toBe(ANCHORED_REMAINING);
  });
});

describe("readAllowanceNow — the share of the allowance used", () => {
  it("measures the delta against the high-water plan total", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ remainingBytes: 100_000_000_000 }),
      month: month(ANCHORED_COUNTER + 10_000_000_000),
      planTotalBytes: 200_000_000_000,
      clock,
    });

    // 200 Go total, 90 Go left → 110 Go used.
    expect(reading.remainingBytes).toBe(90_000_000_000);
    expect(reading.percentUsed).toBeCloseTo(55, 9);
  });

  it("is 0% on a freshly anchored full allowance", () => {
    const reading = readAllowanceNow({
      anchor: anchor(),
      month: month(ANCHORED_COUNTER),
      clock,
    });

    expect(reading.percentUsed).toBe(0);
  });

  it("is 100% once the allowance is exhausted", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ remainingBytes: 2_000_000_000 }),
      month: month(ANCHORED_COUNTER + 9_000_000_000),
      clock,
    });

    expect(reading.percentUsed).toBe(100);
  });

  it("is null when the anchor is not trustworthy, so the caller falls back", () => {
    const reading = readAllowanceNow({
      anchor: anchor(),
      month: month(400_000_000),
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
      clock: fixedClock(2026, 7, 12, 9, 30),
    });

    expect(reading.daysUntilExpiry).toBe(0);
  });

  it("is 1 the day before the expiry", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 7, 12) }),
      month: month(ANCHORED_COUNTER),
      clock: fixedClock(2026, 7, 11, 23, 0),
    });

    expect(reading.daysUntilExpiry).toBe(1);
  });

  it("goes negative once the expiry is behind us, rather than reading zero", () => {
    const reading = readAllowanceNow({
      anchor: anchor({ expiresAt: new Date(2026, 7, 12) }),
      month: month(ANCHORED_COUNTER),
      clock: fixedClock(2026, 7, 15),
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
