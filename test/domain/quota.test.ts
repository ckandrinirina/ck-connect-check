import { describe, expect, it } from "vitest";

import { defaultConfig } from "../../src/config/defaults.js";
import { formatPercent } from "../../src/domain/format.js";
import {
  calendarMonthPeriod,
  percentUsed,
  readPortalUsage,
  totalUsedBytes,
  usageState,
} from "../../src/domain/quota.js";
import type { Clock } from "../../src/domain/quota.js";

const PLAN_20GB = 20_000_000_000;
const DOWNLOAD = 4_427_475_340;
const UPLOAD = 1_403_243_047;
const GB = 1_000_000_000;

/** A clock frozen at one instant — the only way "now" enters the domain. */
function at(instant: Date): Clock {
  return { now: () => instant };
}

describe("totalUsedBytes", () => {
  it("adds download and upload", () => {
    expect(totalUsedBytes(DOWNLOAD, UPLOAD)).toBe(5_830_718_387);
  });
});

describe("percentUsed", () => {
  it("reports 4427475340 + 1403243047 bytes against a 20 GB plan as 29% used", () => {
    const used = totalUsedBytes(DOWNLOAD, UPLOAD);

    expect(percentUsed(used, PLAN_20GB)).toBeCloseTo(29.153591935, 9);
    expect(formatPercent(percentUsed(used, PLAN_20GB))).toBe("29%");
  });

  it("keeps the exact value rather than a pre-rounded one", () => {
    expect(percentUsed(5_830_718_387, PLAN_20GB)).not.toBe(29);
  });

  it("is null when no plan limit is configured", () => {
    expect(percentUsed(5_830_718_387, null)).toBeNull();
  });

  it("is null rather than a divide-by-zero when the limit is zero", () => {
    expect(percentUsed(5_830_718_387, 0)).toBeNull();
  });

  it("is zero — not null — when a plan exists but nothing has been used", () => {
    expect(percentUsed(0, PLAN_20GB)).toBe(0);
  });

  it("goes above 100 when usage passes the plan limit, never clamped", () => {
    expect(percentUsed(25_000_000_000, PLAN_20GB)).toBe(125);
    expect(percentUsed(40_000_000_000, PLAN_20GB)).toBeGreaterThan(100);
  });
});

describe("usageState", () => {
  const WARN_AT = 90;

  it('is "ok" well below the warn threshold', () => {
    expect(usageState(0, WARN_AT)).toBe("ok");
    expect(usageState(29.153591935, WARN_AT)).toBe("ok");
  });

  it('is still "ok" just below the warn threshold', () => {
    expect(usageState(89.999, WARN_AT)).toBe("ok");
  });

  it('is "warn" exactly at the warn threshold, never "ok"', () => {
    expect(usageState(90, WARN_AT)).toBe("warn");
  });

  it('is "warn" between the threshold and the limit', () => {
    expect(usageState(95.5, WARN_AT)).toBe("warn");
    expect(usageState(99.999, WARN_AT)).toBe("warn");
  });

  it('is "over" exactly at 100%, never "warn"', () => {
    expect(usageState(100, WARN_AT)).toBe("over");
  });

  it('is "over" once the plan has been overshot', () => {
    expect(usageState(125, WARN_AT)).toBe("over");
    expect(usageState(9_999, WARN_AT)).toBe("over");
  });

  it('is "unknown" with no plan limit configured, never "ok"', () => {
    expect(usageState(null, WARN_AT)).toBe("unknown");
    expect(usageState(percentUsed(5_830_718_387, null), WARN_AT)).toBe(
      "unknown",
    );
  });

  it("takes the threshold from the caller rather than assuming 90", () => {
    expect(usageState(74.999, 75)).toBe("ok");
    expect(usageState(75, 75)).toBe("warn");
    expect(usageState(89, 75)).toBe("warn");
  });

  it("reads the default threshold of 90 out of the config", () => {
    const { warnThresholdPercent } = defaultConfig();

    expect(warnThresholdPercent).toBe(90);
    expect(usageState(89.999, warnThresholdPercent)).toBe("ok");
    expect(usageState(90, warnThresholdPercent)).toBe("warn");
  });

  it('lets "over" win when the threshold sits at the limit itself', () => {
    expect(usageState(99.999, 100)).toBe("ok");
    expect(usageState(100, 100)).toBe("over");
  });

  it("compares against the exact percentage, not a rounded one", () => {
    // 89.6% rounds to 90% for display but has not reached the threshold.
    expect(formatPercent(89.6)).toBe("90%");
    expect(usageState(89.6, WARN_AT)).toBe("ok");
  });
});

describe("calendarMonthPeriod — the Orange period, read off the calendar", () => {
  it("takes the month's length from the calendar rather than a typed figure", () => {
    expect(
      calendarMonthPeriod(at(new Date(2026, 7, 4, 10, 0, 0))).planDays,
    ).toBe(31);
    expect(
      calendarMonthPeriod(at(new Date(2026, 8, 4, 10, 0, 0))).planDays,
    ).toBe(30);
  });

  it("knows February's two lengths apart", () => {
    expect(calendarMonthPeriod(at(new Date(2026, 1, 10))).planDays).toBe(28);
    expect(calendarMonthPeriod(at(new Date(2028, 1, 10))).planDays).toBe(29);
  });

  it("counts the first of the month as one day elapsed, never zero", () => {
    const period = calendarMonthPeriod(at(new Date(2026, 7, 1, 0, 1, 0)));

    expect(period.elapsedDays).toBe(1);
    expect(period.elapsedShare).toBeGreaterThan(0);
  });

  it("counts the last day of a 31-day month as the whole month", () => {
    const period = calendarMonthPeriod(at(new Date(2026, 7, 31, 23, 59, 0)));

    expect(period.elapsedDays).toBe(31);
    expect(period.elapsedShare).toBe(1);
  });

  it("counts February's last day as the whole month, at either length", () => {
    expect(calendarMonthPeriod(at(new Date(2026, 1, 28))).elapsedDays).toBe(28);
    expect(calendarMonthPeriod(at(new Date(2026, 1, 28))).elapsedShare).toBe(1);
    expect(calendarMonthPeriod(at(new Date(2028, 1, 29))).elapsedDays).toBe(29);
    expect(calendarMonthPeriod(at(new Date(2028, 1, 29))).elapsedShare).toBe(1);
  });

  it("counts the current day inclusively, whatever the hour", () => {
    // The same inclusive counting T-46 settled for the carrier's last valid
    // day: a day being lived is a day elapsed, not a fraction of one.
    expect(
      calendarMonthPeriod(at(new Date(2026, 7, 15, 0, 0, 0))).elapsedDays,
    ).toBe(15);
    expect(
      calendarMonthPeriod(at(new Date(2026, 7, 15, 23, 59, 59))).elapsedDays,
    ).toBe(15);
  });

  it("starts the period at the midnight opening the first", () => {
    const { periodStart } = calendarMonthPeriod(
      at(new Date(2026, 7, 15, 9, 0, 0)),
    );

    expect(periodStart.getTime()).toBe(new Date(2026, 7, 1).getTime());
  });
});

describe("readPortalUsage — consumption stated, remainder derived", () => {
  /** The live capture: the portal stated 7.37 Go where the router counted 51.1. */
  const PORTAL_CONSUMED = 7_370_000_000;

  it("states the consumed volume the portal gave, exactly", () => {
    expect(readPortalUsage(PORTAL_CONSUMED, 100 * GB).usedBytes).toBe(
      PORTAL_CONSUMED,
    );
    expect(readPortalUsage(PORTAL_CONSUMED, null).usedBytes).toBe(
      PORTAL_CONSUMED,
    );
  });

  it("derives the remainder as the cap less the consumption", () => {
    expect(readPortalUsage(30 * GB, 100 * GB).remainingBytes).toBe(70 * GB);
  });

  it("clamps the remainder at zero once the cap is passed", () => {
    expect(readPortalUsage(120 * GB, 100 * GB).remainingBytes).toBe(0);
  });

  it("draws the dial from the cap when there is one", () => {
    expect(readPortalUsage(25 * GB, 100 * GB).percentUsed).toBeCloseTo(25, 9);
  });

  it("reports a share above 100 rather than clamping it", () => {
    expect(readPortalUsage(120 * GB, 100 * GB).percentUsed).toBeCloseTo(120, 9);
  });

  it("has no remainder and no share without a cap, but keeps the volume", () => {
    const usage = readPortalUsage(PORTAL_CONSUMED, null);

    expect(usage.remainingBytes).toBeNull();
    expect(usage.percentUsed).toBeNull();
    expect(usage.usedBytes).toBe(PORTAL_CONSUMED);
  });

  it("treats a cap of zero as no cap at all, never as a limit of nothing", () => {
    const usage = readPortalUsage(PORTAL_CONSUMED, 0);

    expect(usage.remainingBytes).toBeNull();
    expect(usage.percentUsed).toBeNull();
    expect(usage.usedBytes).toBe(PORTAL_CONSUMED);
  });
});
