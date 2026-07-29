import { describe, expect, it } from "vitest";

import { readPace } from "../../src/domain/pace.js";
import { readAllowanceNow } from "../../src/domain/allowance.js";
import type { AllowanceAnchor } from "../../src/domain/allowance.js";
import {
  parseAllowance,
  parseUssdContent,
} from "../../src/hilink/ussd-parse.js";
import type { Clock } from "../../src/domain/quota.js";
import type { MonthStatistics } from "../../src/hilink/types.js";

const GB = 1_000_000_000;
const MILLISECONDS_PER_DAY = 86_400_000;

const CLEAR_TIME = "2026-7-1";

/** The router's month counter at the instant the anchor was taken. */
const ANCHORED_COUNTER = 1_000_000_000;

/** A month counter reading totalling `bytes`, split across download and upload. */
function month(bytes: number, clearTime = CLEAR_TIME): MonthStatistics {
  return {
    monthDownloadBytes: bytes,
    monthUploadBytes: 0,
    monthDurationSeconds: 27_960,
    monthLastClearTime: clearTime,
  };
}

function anchor(overrides: Partial<AllowanceAnchor> = {}): AllowanceAnchor {
  return {
    planLabel: "NET MONTH 200 000",
    remainingBytes: 30 * GB,
    expiresAt: new Date(2026, 6, 11),
    routerMonthBytes: ANCHORED_COUNTER,
    routerClearTime: CLEAR_TIME,
    syncedAt: new Date(2026, 6, 1, 8, 0, 0),
    ...overrides,
  };
}

function at(instant: Date): Clock {
  return { now: () => instant };
}

/** 1 July 2026, 09:00 — ten whole days before the anchor's expiry. */
const NOW = new Date(2026, 6, 1, 9, 0, 0);

describe("readPace — tier 1, the anchor alone", () => {
  const reading = readPace({
    anchor: anchor(),
    month: month(ANCHORED_COUNTER),
    clock: at(NOW),
  });

  it("reports the volume a day the remainder still affords", () => {
    // 30 Go over the ten days left is 3 Go a day, and nothing was typed in to
    // get that figure.
    expect(reading?.tier).toBe(1);
    expect(reading?.daysUntilExpiry).toBe(10);
    expect(reading?.sustainablePerDay).toBe(3 * GB);
  });

  it("leaves every field of an unreached tier exactly null", () => {
    expect(reading?.usedShare).toBeNull();
    expect(reading?.elapsedShare).toBeNull();
    expect(reading?.pace).toBeNull();
    expect(reading?.averagePerDay).toBeNull();
    expect(reading?.affordedPerDay).toBeNull();
    expect(reading?.state).toBeNull();
  });

  it("takes the remainder from the anchor carried forward, not from the anchor", () => {
    // The router has counted 6 Go since the sync, so 24 Go is what is actually
    // left — and 2.4 Go a day is what that affords.
    const advanced = readPace({
      anchor: anchor(),
      month: month(ANCHORED_COUNTER + 6 * GB),
      clock: at(NOW),
    });

    const carried = readAllowanceNow({
      anchor: anchor(),
      month: month(ANCHORED_COUNTER + 6 * GB),
      clock: at(NOW),
    });

    expect(carried.remainingBytes).toBe(24 * GB);
    expect(advanced?.sustainablePerDay).toBe(2.4 * GB);
  });
});

describe("readPace — tier 2, with the plan cap", () => {
  const reading = readPace({
    anchor: anchor(),
    month: month(ANCHORED_COUNTER),
    planLimitBytes: 150 * GB,
    clock: at(NOW),
  });

  it("adds the consumed share the dial already draws", () => {
    const carried = readAllowanceNow({
      anchor: anchor(),
      month: month(ANCHORED_COUNTER),
      planLimitBytes: 150 * GB,
      clock: at(NOW),
    });

    expect(reading?.tier).toBe(2);
    // 150 Go bought, 30 Go left: four fifths of it is gone.
    expect(reading?.usedShare).toBeCloseTo(0.8, 10);
    expect(reading?.usedShare).toBeCloseTo(
      (carried.percentUsed ?? 0) / 100,
      10,
    );
  });

  it("still has no band, because no period has been stated", () => {
    expect(reading?.state).toBeNull();
    expect(reading?.pace).toBeNull();
    expect(reading?.elapsedShare).toBeNull();
    expect(reading?.averagePerDay).toBeNull();
    expect(reading?.affordedPerDay).toBeNull();
  });

  it("keeps tier 1's figure unchanged", () => {
    expect(reading?.sustainablePerDay).toBe(3 * GB);
  });
});

describe("readPace — tier 3, with the plan's length", () => {
  const PLAN_DAYS = 30;
  const PLAN_LIMIT = 30 * GB;
  /** 1 July 2026, 09:00 — the instant the period began. */
  const PERIOD_START = new Date(2026, 6, 1, 9, 0, 0);
  const EXPIRES_AT = new Date(
    PERIOD_START.getTime() + PLAN_DAYS * MILLISECONDS_PER_DAY,
  );

  /** The reading `daysElapsed` into the period, with `usedGo` spent. */
  function paceOn(daysElapsed: number, usedGo: number) {
    return readPace({
      anchor: anchor({
        remainingBytes: PLAN_LIMIT - usedGo * GB,
        expiresAt: EXPIRES_AT,
      }),
      month: month(ANCHORED_COUNTER),
      planLimitBytes: PLAN_LIMIT,
      planDays: PLAN_DAYS,
      clock: at(
        new Date(PERIOD_START.getTime() + daysElapsed * MILLISECONDS_PER_DAY),
      ),
    });
  }

  it("calls two days' worth on day one over", () => {
    const reading = paceOn(1, 2);

    expect(reading?.tier).toBe(3);
    expect(reading?.state).toBe("over");
    expect(reading?.pace).toBeCloseTo(2, 10);
  });

  it("calls the same two days' worth on day eight safe", () => {
    const reading = paceOn(8, 2);

    expect(reading?.state).toBe("safe");
    expect(reading?.pace).toBeLessThan(1);
  });

  it("separates over from warning at the halfway mark", () => {
    // Half the period gone: 20 Go of 30 is over, 16 Go is only a warning.
    expect(paceOn(15, 20)?.state).toBe("over");
    expect(paceOn(15, 16)?.state).toBe("warning");
  });

  it("reports the flat daily budget the plan affords", () => {
    expect(paceOn(15, 16)?.affordedPerDay).toBe(1 * GB);
  });

  it("recovers the sustainable figure as usage stops, while the budget holds", () => {
    const early = paceOn(1, 2);
    const later = paceOn(15, 2);

    // Nothing spent in a fortnight, so the same remainder is spread over fewer
    // days: the figure the band already encodes as compensation.
    expect(later?.sustainablePerDay ?? 0).toBeGreaterThan(
      early?.sustainablePerDay ?? 0,
    );
    expect(later?.affordedPerDay).toBe(early?.affordedPerDay);
  });

  it("reports both shares, cumulative rather than per day", () => {
    const reading = paceOn(15, 16);

    expect(reading?.elapsedShare).toBeCloseTo(0.5, 10);
    expect(reading?.usedShare).toBeCloseTo(16 / 30, 10);
  });

  it("calls the plan's first hours safe, whatever has been spent", () => {
    const reading = paceOn(0.25, 25);

    expect(reading?.state).toBe("safe");
    expect(Number.isFinite(reading?.pace ?? Number.NaN)).toBe(true);
  });
});

describe("readPace — the pace stated as two daily volumes", () => {
  const PLAN_DAYS = 30;
  /** 150 Go over 30 days: the worked example, which affords 5 Go a day. */
  const PLAN_LIMIT = 150 * GB;
  /** 1 July 2026, 09:00 — the instant the period began. */
  const PERIOD_START = new Date(2026, 6, 1, 9, 0, 0);
  const EXPIRES_AT = new Date(
    PERIOD_START.getTime() + PLAN_DAYS * MILLISECONDS_PER_DAY,
  );

  /** The reading `daysElapsed` into the period, with `usedGo` spent. */
  function paceOn(daysElapsed: number, usedGo: number) {
    return readPace({
      anchor: anchor({
        remainingBytes: PLAN_LIMIT - usedGo * GB,
        expiresAt: EXPIRES_AT,
      }),
      month: month(ANCHORED_COUNTER),
      planLimitBytes: PLAN_LIMIT,
      planDays: PLAN_DAYS,
      clock: at(
        new Date(PERIOD_START.getTime() + daysElapsed * MILLISECONDS_PER_DAY),
      ),
    });
  }

  it("states 60 Go over ten days as 6 Go a day against a budget of 5", () => {
    const reading = paceOn(10, 60);

    expect(reading?.averagePerDay).toBeCloseTo(6 * GB, -3);
    expect(reading?.affordedPerDay).toBe(5 * GB);
  });

  it("restates the ratio rather than recomputing it, in every tier 3 case", () => {
    const cases: readonly (readonly [number, number])[] = [
      [0, 25],
      [0.25, 25],
      [1, 6],
      [10, 60],
      [15, 90],
      [15, 75],
      [29, 150],
    ];

    for (const [daysElapsed, usedGo] of cases) {
      const reading = paceOn(daysElapsed, usedGo);
      const restated =
        (reading?.averagePerDay ?? Number.NaN) /
        (reading?.affordedPerDay ?? Number.NaN);

      expect(restated).toBeCloseTo(reading?.pace ?? Number.NaN, 10);
    }
  });

  it("calls 6 Go a day against a budget of 5 over, not a warning", () => {
    // Half the period gone, 90 Go of 150 spent: a ratio of exactly 1.20.
    const reading = paceOn(15, 90);

    expect(reading?.pace).toBe(1.2);
    expect(reading?.state).toBe("over");
  });

  it("keeps the band just under that boundary a warning", () => {
    const reading = paceOn(15, 89);

    expect(reading?.pace).toBeLessThan(1.2);
    expect(reading?.state).toBe("warning");
  });

  it("keeps spending that matches the calendar exactly safe", () => {
    const reading = paceOn(15, 75);

    expect(reading?.pace).toBe(1);
    expect(reading?.state).toBe("safe");
  });

  it("divides by the elapsed floor inside the first day, never by zero", () => {
    const reading = paceOn(0, 25);

    // Not a day has passed, so 25 Go reads as 25 Go a day rather than infinity.
    expect(reading?.averagePerDay).toBeCloseTo(25 * GB, -3);
    expect(Number.isFinite(reading?.averagePerDay ?? Number.NaN)).toBe(true);
    expect(reading?.state).toBe("safe");
  });
});

describe("readPace — when there is nothing honest to report", () => {
  it("is null with no anchor at all", () => {
    expect(
      readPace({
        anchor: undefined,
        month: month(ANCHORED_COUNTER),
        clock: at(NOW),
      }),
    ).toBeNull();
  });

  it("is null when the carrier stated no expiry, so there is no period", () => {
    expect(
      readPace({
        anchor: anchor({ expiresAt: null }),
        month: month(ANCHORED_COUNTER),
        clock: at(NOW),
      }),
    ).toBeNull();
  });

  it("is null once the expiry is behind us, and divides by nothing", () => {
    expect(
      readPace({
        anchor: anchor({ expiresAt: new Date(2026, 5, 20) }),
        month: month(ANCHORED_COUNTER),
        planLimitBytes: 150 * GB,
        planDays: 30,
        clock: at(NOW),
      }),
    ).toBeNull();
  });

  it("is null on the expiry day itself, when a day's division would blow up", () => {
    expect(
      readPace({
        anchor: anchor({ expiresAt: new Date(2026, 6, 1, 23, 59) }),
        month: month(ANCHORED_COUNTER),
        clock: at(NOW),
      }),
    ).toBeNull();
  });

  it("is null when the router's counter has restarted under the anchor", () => {
    // The delta is meaningless, so `remainingNow` is the anchored figure with
    // nothing applied — a pace drawn from it would describe a moment gone.
    const reading = readPace({
      anchor: anchor(),
      month: month(ANCHORED_COUNTER, "2026-8-1"),
      planLimitBytes: 150 * GB,
      planDays: 30,
      clock: at(NOW),
    });

    expect(reading).toBeNull();
  });
});

describe("readPace — the case reported from the router itself", () => {
  /**
   * 29 July 2026, 16:33: a 150 Go plan bought on 27/07 and stated by the
   * carrier as running "jusqu'au 25/08/2026", with 133.51 Go left — so 16.49 Go
   * spent. The panel called that 4.47 Go a day and green; the user counted
   * 6.13 Go a day against a 5 Go budget, which is over. The whole gap was the
   * expiry instant being read as the midnight that *opens* 25/08, which pushes
   * the period's start back to 26/07 and so invents an extra elapsed day.
   *
   * Parsed from the carrier's own words rather than hand-dated, because the
   * date arithmetic under test begins at the parser.
   */
  const CARRIER_REPLY =
    "NET MONTH 200 000, il vous reste 133.51 Go utilisable a toute heure jusqu'au 25/08/2026.";

  const PLAN_LIMIT = 150 * GB;
  const PLAN_DAYS = 30;
  const OBSERVED_AT = new Date(2026, 6, 29, 16, 33, 0);

  function statedByTheCarrier() {
    const parsed = parseAllowance(
      parseUssdContent(
        `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<content>${CARRIER_REPLY}</content>\n<date></date>\n</response>`,
      ),
    );
    if (parsed === null) {
      throw new Error("the recorded carrier reply must state an allowance");
    }

    return parsed;
  }

  function readingAt(now: Date) {
    return readPace({
      anchor: anchor({
        remainingBytes: statedByTheCarrier().remainingBytes,
        expiresAt: statedByTheCarrier().expiresAt,
        syncedAt: new Date(2026, 6, 29, 16, 0, 0),
      }),
      month: month(ANCHORED_COUNTER),
      planLimitBytes: PLAN_LIMIT,
      planDays: PLAN_DAYS,
      clock: at(now),
    });
  }

  it("reports the daily volume actually spent, not one diluted by a day never lived", () => {
    const reading = readingAt(OBSERVED_AT);

    expect((reading?.averagePerDay ?? Number.NaN) / GB).toBeCloseTo(6.13, 2);
    expect(reading?.affordedPerDay).toBe(5 * GB);
  });

  it("bands that spending over rather than safe", () => {
    const reading = readingAt(OBSERVED_AT);

    expect(reading?.pace ?? Number.NaN).toBeGreaterThanOrEqual(1.2);
    expect(reading?.pace ?? Number.NaN).toBeCloseTo(1.23, 2);
    expect(reading?.state).toBe("over");
  });

  it("leaves the user's own count of days remaining", () => {
    expect(readingAt(OBSERVED_AT)?.daysUntilExpiry).toBe(28);
  });

  it("starts the period on the day the plan was bought", () => {
    // Elapsed plus remaining is the plan's whole length and no more: at
    // midnight opening 29/07 two days have passed and twenty-eight are left.
    const reading = readingAt(new Date(2026, 6, 29, 0, 0, 0));
    const elapsedDays = (reading?.elapsedShare ?? Number.NaN) * PLAN_DAYS;

    expect(elapsedDays).toBeCloseTo(2, 10);
    expect(elapsedDays + (reading?.daysUntilExpiry ?? Number.NaN)).toBeCloseTo(
      PLAN_DAYS,
      10,
    );
  });

  it("still reports a pace on the carrier's last valid day", () => {
    const reading = readingAt(new Date(2026, 7, 25, 12, 0, 0));

    expect(reading).not.toBeNull();
    expect(reading?.daysUntilExpiry).toBe(1);
  });
});

describe("src/domain/pace.ts", () => {
  it("imports neither Electron nor anything the router speaks", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/domain/pace.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/from\s+["']electron["']/);
    expect(source).not.toMatch(/from\s+["'][^"']*hilink/);
    expect(source).not.toMatch(/node:http|node:https|fetch\(/);
  });
});
