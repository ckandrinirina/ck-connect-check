import { describe, expect, it } from "vitest";

import { defaultConfig } from "../../src/config/defaults.js";
import { formatPercent } from "../../src/domain/format.js";
import {
  type Clock,
  daysUntilReset,
  nextResetDate,
  percentUsed,
  totalUsedBytes,
  usageState,
} from "../../src/domain/quota.js";

/** A clock frozen at a local wall-clock instant — every reset case is driven by one. */
function fixedClock(
  year: number,
  month: number,
  day: number,
  hour = 9,
  minute = 30,
): Clock {
  return { now: () => new Date(year, month - 1, day, hour, minute) };
}

const PLAN_20GB = 20_000_000_000;
const DOWNLOAD = 4_427_475_340;
const UPLOAD = 1_403_243_047;

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

describe("nextResetDate", () => {
  it("returns the coming start day, at local midnight", () => {
    const reset = nextResetDate(1, fixedClock(2026, 7, 27));

    expect(reset.getFullYear()).toBe(2026);
    expect(reset.getMonth()).toBe(7); // August
    expect(reset.getDate()).toBe(1);
    expect(reset.getHours()).toBe(0);
    expect(reset.getMinutes()).toBe(0);
  });

  it("stays in the current month when the start day is still ahead", () => {
    const reset = nextResetDate(20, fixedClock(2026, 7, 5));

    expect(reset.getMonth()).toBe(6); // July
    expect(reset.getDate()).toBe(20);
  });

  it("resets on the last day of a 30-day month when startDay is 31", () => {
    const reset = nextResetDate(31, fixedClock(2026, 6, 15));

    expect(reset.getMonth()).toBe(5); // June
    expect(reset.getDate()).toBe(30);
  });

  it("clamps a startDay of 31 into February", () => {
    const reset = nextResetDate(31, fixedClock(2026, 2, 10));

    expect(reset.getMonth()).toBe(1); // February
    expect(reset.getDate()).toBe(28);
  });

  it("rolls into the next year from December", () => {
    const reset = nextResetDate(1, fixedClock(2026, 12, 27));

    expect(reset.getFullYear()).toBe(2027);
    expect(reset.getMonth()).toBe(0);
    expect(reset.getDate()).toBe(1);
  });

  it("looks past today when the cycle restarted today", () => {
    const reset = nextResetDate(1, fixedClock(2026, 7, 1));

    expect(reset.getMonth()).toBe(7); // August
    expect(reset.getDate()).toBe(1);
  });
});

describe("daysUntilReset", () => {
  it("is 5 on 27 July with a startDay of 1", () => {
    expect(daysUntilReset(1, fixedClock(2026, 7, 27))).toBe(5);
  });

  it("ignores the time of day", () => {
    expect(daysUntilReset(1, fixedClock(2026, 7, 27, 0, 1))).toBe(5);
    expect(daysUntilReset(1, fixedClock(2026, 7, 27, 23, 59))).toBe(5);
  });

  it("counts to the clamped last day of a 30-day month for a startDay of 31", () => {
    expect(daysUntilReset(31, fixedClock(2026, 6, 15))).toBe(15);
  });

  it("is a full cycle away on the reset day itself", () => {
    expect(daysUntilReset(1, fixedClock(2026, 7, 1))).toBe(31);
  });

  it("is 1 the day before the reset", () => {
    expect(daysUntilReset(1, fixedClock(2026, 7, 31))).toBe(1);
  });
});
