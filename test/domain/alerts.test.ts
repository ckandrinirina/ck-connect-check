import { describe, expect, it } from "vitest";

import {
  LOW_SHARE_THRESHOLD,
  NOTHING_ANNOUNCED,
  QUIET_HOURS,
  alertPeriodEnd,
  decideAlerts,
  type AlertDecision,
  type AlertInput,
  type AnnouncedAlerts,
} from "../../src/domain/alerts.js";
import type { Clock } from "../../src/domain/quota.js";

const GB = 1_000_000_000;
const CAP = 150 * GB;

function at(instant: Date): Clock {
  return { now: () => instant };
}

/**
 * The YAS expiry the reminder tests run against: midnight opening 20 October
 * 2026, which is how the USSD parse states "valid until the 19th".
 */
const END = new Date(2026, 9, 20);

/** Nowhere near low, so only the end-of-period schedule speaks. */
const PLENTY = { remainingBytes: 100 * GB, planLimitBytes: CAP };

function decide(now: Date, overrides: Partial<AlertInput> = {}): AlertDecision {
  return decideAlerts({
    reading: PLENTY,
    periodEnd: END,
    announced: NOTHING_ANNOUNCED,
    clock: at(now),
    ...overrides,
  });
}

/** The ids of the end reminders a decision says to send. */
function reminders(decision: AlertDecision): string[] {
  return decision.notifications.flatMap((notification) =>
    notification.kind === "period-ending" ? [notification.id] : [],
  );
}

function lowNotices(decision: AlertDecision): number {
  return decision.notifications.filter(
    (notification) => notification.kind === "low",
  ).length;
}

describe("constants", () => {
  it("exports the low threshold and the quiet window", () => {
    expect(LOW_SHARE_THRESHOLD).toBe(0.3);
    expect(QUIET_HOURS).toEqual({ startHour: 22, endHour: 7 });
  });
});

describe("the low state", () => {
  const NOON = new Date(2026, 9, 7, 12, 0, 0);

  it("is reported at exactly 30 % remaining, with one notice", () => {
    const decision = decide(NOON, {
      reading: { remainingBytes: 45 * GB, planLimitBytes: CAP },
    });

    expect(decision.banner).toBe("low");
    expect(lowNotices(decision)).toBe(1);
  });

  it("is reported below 30 %", () => {
    const decision = decide(NOON, {
      reading: { remainingBytes: 1 * GB, planLimitBytes: CAP },
    });

    expect(decision.banner).toBe("low");
  });

  it("is reported when nothing at all is left", () => {
    const decision = decide(NOON, {
      reading: { remainingBytes: 0, planLimitBytes: CAP },
    });

    expect(decision.banner).toBe("low");
  });

  it("is not reported above 30 %", () => {
    const decision = decide(NOON, {
      reading: { remainingBytes: 46 * GB, planLimitBytes: CAP },
    });

    expect(decision.banner).toBeNull();
    expect(lowNotices(decision)).toBe(0);
  });

  it("is never reported with no cap, however little is said to be left", () => {
    for (const planLimitBytes of [null, undefined, 0]) {
      const decision = decide(NOON, {
        reading: { remainingBytes: 0, planLimitBytes },
      });

      expect(decision.banner).toBeNull();
      expect(lowNotices(decision)).toBe(0);
    }
  });

  it("is never reported for an Orange forfait with no stated total", () => {
    const decision = decide(NOON, {
      reading: { remainingBytes: null, planLimitBytes: null },
    });

    expect(decision.banner).toBeNull();
    expect(decision.notifications).toEqual([]);
  });

  it("is not notified again once announced for the same period end", () => {
    const first = decide(NOON, {
      reading: { remainingBytes: 40 * GB, planLimitBytes: CAP },
    });
    const later = decide(new Date(2026, 9, 7, 15, 0, 0), {
      reading: { remainingBytes: 30 * GB, planLimitBytes: CAP },
      announced: first.announced,
    });

    expect(later.banner).toBe("low");
    expect(lowNotices(later)).toBe(0);
  });

  it("is notified again after a recovery above 30 % and a new drop", () => {
    const low = decide(NOON, {
      reading: { remainingBytes: 40 * GB, planLimitBytes: CAP },
    });
    const recovered = decide(new Date(2026, 9, 7, 13, 0, 0), {
      reading: { remainingBytes: 140 * GB, planLimitBytes: CAP },
      announced: low.announced,
    });
    const lowAgain = decide(new Date(2026, 9, 7, 14, 0, 0), {
      reading: { remainingBytes: 45 * GB, planLimitBytes: CAP },
      announced: recovered.announced,
    });

    expect(recovered.banner).toBeNull();
    expect(lowNotices(recovered)).toBe(0);
    expect(lowAgain.banner).toBe("low");
    expect(lowNotices(lowAgain)).toBe(1);
  });

  it("is not re-armed by a reading that has no cap to measure against", () => {
    const low = decide(NOON, {
      reading: { remainingBytes: 40 * GB, planLimitBytes: CAP },
    });
    const capless = decide(new Date(2026, 9, 7, 13, 0, 0), {
      reading: { remainingBytes: null, planLimitBytes: null },
      announced: low.announced,
    });
    const back = decide(new Date(2026, 9, 7, 14, 0, 0), {
      reading: { remainingBytes: 40 * GB, planLimitBytes: CAP },
      announced: capless.announced,
    });

    expect(lowNotices(back)).toBe(0);
  });
});

describe("alertPeriodEnd", () => {
  const NOW = at(new Date(2026, 9, 7, 12, 0, 0));

  it("is the anchor's expiresAt on YAS", () => {
    const expiresAt = new Date(2026, 9, 20);

    expect(alertPeriodEnd({ carrier: "yas", expiresAt }, NOW)).toEqual(
      expiresAt,
    );
  });

  it("is absent on YAS when the carrier stated no expiry", () => {
    expect(alertPeriodEnd({ carrier: "yas", expiresAt: null }, NOW)).toBeNull();
  });

  it("is the close of the month's last day on Orange", () => {
    // The whole of 31 October is still inside the period.
    expect(alertPeriodEnd({ carrier: "orange" }, NOW)).toEqual(
      new Date(2026, 10, 1),
    );
  });

  it("handles a leap February and the turn of the year on Orange", () => {
    expect(
      alertPeriodEnd({ carrier: "orange" }, at(new Date(2028, 1, 10, 9))),
    ).toEqual(new Date(2028, 2, 1));
    expect(
      alertPeriodEnd({ carrier: "orange" }, at(new Date(2026, 11, 31, 23))),
    ).toEqual(new Date(2027, 0, 1));
  });

  it("is absent for an unrecognised carrier", () => {
    expect(alertPeriodEnd({ carrier: "unknown" }, NOW)).toBeNull();
  });
});

describe("the end-of-period schedule", () => {
  it("says nothing before five days out", () => {
    expect(reminders(decide(new Date(2026, 9, 14, 12, 0, 0)))).toEqual([]);
  });

  it("is due once each at 5, 4, 3 and 2 days before the end", () => {
    let announced: AnnouncedAlerts = NOTHING_ANNOUNCED;
    const sent: string[] = [];

    // 09:00 on the 15th to the 18th, then again an hour later each day.
    for (const day of [15, 16, 17, 18]) {
      for (const hour of [9, 10]) {
        const decision = decide(new Date(2026, 9, day, hour, 0, 0), {
          announced,
        });

        sent.push(...reminders(decision));
        announced = decision.announced;
      }
    }

    expect(sent).toEqual(["days-5", "days-4", "days-3", "days-2"]);
  });

  it("states how far ahead each reminder is", () => {
    const decision = decide(new Date(2026, 9, 16, 9, 0, 0));

    expect(decision.notifications).toEqual([
      {
        kind: "period-ending",
        id: "days-4",
        periodEnd: END,
        before: { unit: "days", count: 4 },
      },
    ]);
  });

  it("is due once per hour during the final 24 hours", () => {
    let announced: AnnouncedAlerts = NOTHING_ANNOUNCED;
    const sent: string[] = [];

    // Every half hour from 07:00 to 21:30 on the last day.
    for (let minutes = 7 * 60; minutes < 22 * 60; minutes += 30) {
      const decision = decide(
        new Date(2026, 9, 19, Math.floor(minutes / 60), minutes % 60, 0),
        { announced },
      );

      sent.push(...reminders(decision));
      announced = decision.announced;
    }

    // 07:00 is 17 hours before midnight, 21:00 is 3.
    const expected = Array.from({ length: 15 }, (_, i) => `hours-${17 - i}`);
    expect(sent).toEqual(expected);
  });

  it("states the hours left on an hourly reminder", () => {
    const decision = decide(new Date(2026, 9, 19, 10, 0, 0));

    expect(decision.notifications).toEqual([
      {
        kind: "period-ending",
        id: "hours-14",
        periodEnd: END,
        before: { unit: "hours", count: 14 },
      },
    ]);
  });

  it("says nothing once the period has ended", () => {
    expect(reminders(decide(new Date(2026, 9, 20, 9, 0, 0)))).toEqual([]);
  });

  it("says nothing when there is no period end", () => {
    const decision = decide(new Date(2026, 9, 19, 10, 0, 0), {
      periodEnd: null,
    });

    expect(decision.notifications).toEqual([]);
  });

  it("does not repeat a reminder already announced for the same end", () => {
    const first = decide(new Date(2026, 9, 16, 9, 0, 0));
    const again = decide(new Date(2026, 9, 16, 18, 0, 0), {
      announced: first.announced,
    });

    expect(reminders(first)).toEqual(["days-4"]);
    expect(reminders(again)).toEqual([]);
  });
});

describe("quiet hours", () => {
  it("holds every reminder from 22:00", () => {
    // 22:00 on the last day is the 2-hours-left slot itself.
    expect(reminders(decide(new Date(2026, 9, 19, 22, 0, 0)))).toEqual([]);
    expect(reminders(decide(new Date(2026, 9, 19, 23, 30, 0)))).toEqual([]);
  });

  it("holds every reminder until 07:00", () => {
    expect(reminders(decide(new Date(2026, 9, 16, 0, 0, 0)))).toEqual([]);
    expect(reminders(decide(new Date(2026, 9, 16, 6, 59, 59)))).toEqual([]);
    expect(reminders(decide(new Date(2026, 9, 16, 7, 0, 0)))).toEqual([
      "days-4",
    ]);
  });

  it("leaves the held reminder unannounced, so it is still owed at 07:00", () => {
    const night = decide(new Date(2026, 9, 16, 2, 0, 0));
    const morning = decide(new Date(2026, 9, 16, 7, 0, 0), {
      announced: night.announced,
    });

    expect(reminders(morning)).toEqual(["days-4"]);
  });
});

describe("missed reminders", () => {
  it("collapse to the newest after a sleep across several days", () => {
    // Asleep from before the 5-day mark until the morning of the 18th.
    const decision = decide(new Date(2026, 9, 18, 9, 0, 0));

    expect(reminders(decision)).toEqual(["days-2"]);
  });

  it("collapse to the newest after a quiet night on the last day", () => {
    // Hours 24 to 18 all fell between midnight and 07:00.
    const decision = decide(new Date(2026, 9, 19, 7, 0, 0));

    expect(reminders(decision)).toEqual(["hours-17"]);
  });

  it("stay silent once the newest has been sent", () => {
    const morning = decide(new Date(2026, 9, 18, 9, 0, 0));
    const later = decide(new Date(2026, 9, 18, 20, 0, 0), {
      announced: morning.announced,
    });

    expect(reminders(later)).toEqual([]);
  });
});

describe("a new period end", () => {
  it("starts with nothing announced", () => {
    const old = decide(new Date(2026, 9, 18, 9, 0, 0), {
      reading: { remainingBytes: 10 * GB, planLimitBytes: CAP },
    });
    expect(lowNotices(old)).toBe(1);
    expect(reminders(old)).toEqual(["days-2"]);

    // A recharge on the 18th moves the expiry a month on, and the user then
    // spends straight back under 30 % — the low notice is owed again.
    const nextEnd = new Date(2026, 10, 20);
    const renewed = decide(new Date(2026, 10, 18, 9, 0, 0), {
      periodEnd: nextEnd,
      reading: { remainingBytes: 10 * GB, planLimitBytes: CAP },
      announced: old.announced,
    });

    expect(lowNotices(renewed)).toBe(1);
    expect(reminders(renewed)).toEqual(["days-2"]);
  });

  it("starts with nothing announced on a new Orange month", () => {
    const lastDay = new Date(2026, 9, 31, 9, 0, 0);
    const october = decide(lastDay, {
      periodEnd: alertPeriodEnd({ carrier: "orange" }, at(lastDay)),
      reading: { remainingBytes: 10 * GB, planLimitBytes: CAP },
    });

    const november = new Date(2026, 10, 1, 9, 0, 0);
    const next = decide(november, {
      periodEnd: alertPeriodEnd({ carrier: "orange" }, at(november)),
      reading: { remainingBytes: 10 * GB, planLimitBytes: CAP },
      announced: october.announced,
    });

    expect(lowNotices(october)).toBe(1);
    expect(lowNotices(next)).toBe(1);
  });

  it("carries only what was announced for the new end", () => {
    const old = decide(new Date(2026, 9, 18, 9, 0, 0), {
      reading: { remainingBytes: 10 * GB, planLimitBytes: CAP },
    });
    const renewed = decide(new Date(2026, 9, 25, 9, 0, 0), {
      periodEnd: new Date(2026, 10, 20),
      announced: old.announced,
    });

    expect(renewed.announced).toEqual(
      decide(new Date(2026, 9, 25, 9, 0, 0), {
        periodEnd: new Date(2026, 10, 20),
      }).announced,
    );
  });
});
