import { describe, expect, it } from "vitest";

import { defaultConfig } from "../../src/config/defaults.js";
import { formatPercent } from "../../src/domain/format.js";
import {
  percentUsed,
  totalUsedBytes,
  usageState,
} from "../../src/domain/quota.js";

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
