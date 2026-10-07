/**
 * Forfait alerts: whether the plan is running low, and whether its end is near
 * enough to remind the user.
 *
 * One pure function, {@link decideAlerts}, takes the reading, the period end and
 * what was already announced, and returns what the banner shows, which
 * notifications to send, and the announced set to store in their place. The
 * caller persists that set (keyed by the period end) and feeds it back on the
 * next poll, so a restart neither repeats a notice nor loses one.
 *
 * Two independent rules:
 *
 * - **low** — at or under {@link LOW_SHARE_THRESHOLD} of the cap remaining. A
 *   state, not an event: the banner holds while it lasts, and one notice is sent
 *   per drop. It re-arms only once the share is back above the threshold.
 * - **period ending** — a reminder at 5, 4, 3 and 2 days before the end, then
 *   hourly through the final 24 hours. None during {@link QUIET_HOURS}, and when
 *   several were missed only the newest is sent.
 *
 * Pure — no Electron, no network, and "now" only arrives through the
 * injected {@link Clock}.
 */

import type { Carrier } from "./carrier.js";
import {
  calendarMonthPeriod,
  planCap,
  systemClock,
  type Clock,
} from "./quota.js";

const MILLISECONDS_PER_HOUR = 3_600_000;

/** At or under this share of the cap remaining, the forfait is low. */
export const LOW_SHARE_THRESHOLD = 0.3;

/**
 * Local hours during which no reminder is due: from `startHour:00` up to, not
 * including, `endHour:00` the next morning.
 */
export const QUIET_HOURS = { startHour: 22, endHour: 7 } as const;

/** Days before the end that each get one reminder. */
const DAYS_BEFORE = [5, 4, 3, 2] as const;

/** The final stretch reminded hourly. */
const FINAL_HOURS = 24;

/** The announced-set id of the low notice. */
const LOW_ID = "low";

/**
 * What has already been announced, as stored in `config.json`. Plain JSON so it
 * round-trips untouched. Belongs to one period end: a different end starts
 * from nothing.
 */
export interface AnnouncedAlerts {
  /** The period end these belong to, as an ISO instant. Null with none known. */
  periodEnd: string | null;
  /** Ids already sent: `low`, `days-N` or `hours-N`. */
  ids: string[];
}

/** The announced set before anything has been sent. */
export const NOTHING_ANNOUNCED: AnnouncedAlerts = { periodEnd: null, ids: [] };

/** The figures the low rule reads. */
export interface AlertReading {
  /** Volume left now. Null when it cannot be known (Orange with no cap). */
  remainingBytes: number | null;
  /** The plan cap. Absent, null or zero means none known — never low. */
  planLimitBytes?: number | null;
}

export interface AlertInput {
  reading: AlertReading;
  /** The instant the forfait ends — see {@link alertPeriodEnd}. Null when unknown. */
  periodEnd: Date | null;
  /** What the previous decision returned as {@link AlertDecision.announced}. */
  announced: AnnouncedAlerts;
  /** Injected so every boundary is testable. */
  clock?: Clock;
}

/** How far ahead of the period end a reminder slot sits. */
export interface ReminderLead {
  unit: "days" | "hours";
  count: number;
}

/** One macOS notification to send. */
export type AlertNotification =
  | { kind: "low" }
  | {
      kind: "period-ending";
      /** The schedule slot, e.g. `days-4` or `hours-14`. */
      id: string;
      periodEnd: Date;
      before: ReminderLead;
    };

export interface AlertDecision {
  /** `low` while the forfait is low; null otherwise. */
  banner: "low" | null;
  /** Notifications due now. Empty most of the time. */
  notifications: AlertNotification[];
  /** The set to store and pass back next time. */
  announced: AnnouncedAlerts;
}

/** Where the period end comes from, per carrier. */
export type PeriodEndSource =
  | { carrier: "yas"; expiresAt: Date | null }
  | { carrier: Exclude<Carrier, "yas"> };

/**
 * The instant the current forfait ends.
 *
 * On YAS it is the anchor's `expiresAt`, which the USSD parse already states as
 * the midnight closing the last valid day. On Orange it is the same instant for
 * the calendar month: the midnight closing its last day, so the whole of that
 * day is still inside the period. Null when neither applies.
 */
export function alertPeriodEnd(
  source: PeriodEndSource,
  clock: Clock = systemClock,
): Date | null {
  if (source.carrier === "yas") return source.expiresAt;
  if (source.carrier !== "orange") return null;

  const { periodStart } = calendarMonthPeriod(clock);

  return new Date(periodStart.getFullYear(), periodStart.getMonth() + 1, 1);
}

interface ReminderSlot {
  id: string;
  at: Date;
  before: ReminderLead;
}

/**
 * Every reminder for `end`, oldest first. Day slots step back on the local
 * calendar so a daylight-saving change cannot shift them by an hour; hour slots
 * are real hours.
 */
function reminderSlots(end: Date): ReminderSlot[] {
  const days = DAYS_BEFORE.map((count): ReminderSlot => {
    const at = new Date(end);
    at.setDate(at.getDate() - count);

    return { id: `days-${count}`, at, before: { unit: "days", count } };
  });

  const hours = Array.from({ length: FINAL_HOURS }, (_, i): ReminderSlot => {
    const count = FINAL_HOURS - i;

    return {
      id: `hours-${count}`,
      at: new Date(end.getTime() - count * MILLISECONDS_PER_HOUR),
      before: { unit: "hours", count },
    };
  });

  return [...days, ...hours];
}

function isQuiet(now: Date): boolean {
  const hour = now.getHours();

  return hour >= QUIET_HOURS.startHour || hour < QUIET_HOURS.endHour;
}

/** The share of the cap left, or null when there is no cap to measure against. */
function remainingShare(reading: AlertReading): number | null {
  const cap = planCap(reading.planLimitBytes);

  if (cap === null || reading.remainingBytes === null) return null;

  return reading.remainingBytes / cap;
}

/**
 * The one reminder due now, or null.
 *
 * Only the newest slot already reached is ever a candidate: older ones that
 * were missed (asleep, quiet hours) are superseded by it, never replayed.
 */
function dueReminder(
  end: Date,
  now: Date,
  announced: ReadonlySet<string>,
): ReminderSlot | null {
  if (now.getTime() >= end.getTime() || isQuiet(now)) return null;

  const reached = reminderSlots(end).filter(
    (slot) => slot.at.getTime() <= now.getTime(),
  );
  const newest = reached.at(-1);

  if (newest === undefined || announced.has(newest.id)) return null;

  return newest;
}

/**
 * What to show and what to notify, right now.
 *
 * The returned {@link AlertDecision.announced} replaces the stored set: it adds
 * what this decision sends, drops the low notice once the share has recovered
 * above the threshold, and starts empty whenever the period end has changed.
 */
export function decideAlerts(input: AlertInput): AlertDecision {
  const now = (input.clock ?? systemClock).now();
  const periodEnd = input.periodEnd?.toISOString() ?? null;
  const announced = new Set(
    input.announced.periodEnd === periodEnd ? input.announced.ids : [],
  );
  const notifications: AlertNotification[] = [];

  const share = remainingShare(input.reading);
  const low = share !== null && share <= LOW_SHARE_THRESHOLD;

  if (low && !announced.has(LOW_ID)) {
    notifications.push({ kind: "low" });
    announced.add(LOW_ID);
  } else if (share !== null && !low) {
    // A recharge: the next drop is a new event worth a notice.
    announced.delete(LOW_ID);
  }

  if (input.periodEnd !== null) {
    const slot = dueReminder(input.periodEnd, now, announced);

    if (slot !== null) {
      notifications.push({
        kind: "period-ending",
        id: slot.id,
        periodEnd: input.periodEnd,
        before: slot.before,
      });
      announced.add(slot.id);
    }
  }

  return {
    banner: low ? "low" : null,
    notifications,
    announced: { periodEnd, ids: [...announced] },
  };
}
