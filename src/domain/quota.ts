/**
 * Quota math: how much of the plan is used, and when the billing cycle
 * restarts. Pure — no I/O, no Electron, no network. "Now" always arrives
 * through an injected {@link Clock} so every reset case is testable.
 *
 * The percentage returned here is exact. Rounding is a display concern and
 * lives in `format.ts`; thresholds compare against the exact value.
 */

const MILLISECONDS_PER_DAY = 86_400_000;

/** The only source of "now" in the domain — injected so tests can freeze it. */
export interface Clock {
  now(): Date;
}

/** The real clock, for production wiring. */
export const systemClock: Clock = {
  now: () => new Date(),
};

/** Total consumed this cycle. The router counts download and upload separately. */
export function totalUsedBytes(
  downloadBytes: number,
  uploadBytes: number,
): number {
  return downloadBytes + uploadBytes;
}

/**
 * Share of the plan consumed, as an exact percentage.
 *
 * `null` means "no plan limit configured" — the router reports `DataLimit` as
 * `0MB`, so an unset limit is the normal case and must never read as 0% used
 * or divide by zero. A value above 100 is returned as-is: going over the plan
 * is exactly what the user needs to see.
 */
export function percentUsed(
  usedBytes: number,
  limitBytes: number | null,
): number | null {
  if (limitBytes === null || !Number.isFinite(limitBytes) || limitBytes <= 0) {
    return null;
  }
  return (usedBytes / limitBytes) * 100;
}

/**
 * How the current usage should read: comfortable, close to the plan, past it,
 * or not measurable at all.
 *
 * `"unknown"` is not a failure — it is the normal state with no plan limit
 * configured, and it is deliberately distinct from `"ok"`: an unmeasured plan
 * must never be presented as a healthy one.
 */
export type UsageState = "unknown" | "ok" | "warn" | "over";

/** The share of the plan at which usage stops being an approach and becomes an overrun. */
export const OVER_THRESHOLD_PERCENT = 100;

/**
 * Classifies an exact percentage from {@link percentUsed} against the warn
 * threshold the user configured.
 *
 * Both boundaries are inclusive — at exactly the threshold the state is
 * `"warn"`, and at exactly 100% it is `"over"` — because reaching a limit is
 * the moment worth reporting, not the moment after. The comparison is against
 * the exact percentage rather than the rounded display value: 89.6% reads
 * `"90%"` on screen but has not reached a 90% threshold.
 */
export function usageState(
  percent: number | null,
  warnThresholdPercent: number,
): UsageState {
  if (percent === null || !Number.isFinite(percent)) {
    return "unknown";
  }

  if (percent >= OVER_THRESHOLD_PERCENT) {
    return "over";
  }

  return percent >= warnThresholdPercent ? "warn" : "ok";
}

/** Days in the given month, where `month` is a 0-based index that may overflow. */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/**
 * The start day pinned into a real date for that month. A `startDay` of 31 in
 * a 30-day month becomes the 30th — the cycle restarts on the last day rather
 * than skipping the month.
 */
function resetDayOf(year: number, month: number, startDay: number): number {
  const day = Number.isFinite(startDay) ? Math.floor(startDay) : 1;
  return Math.min(Math.max(day, 1), daysInMonth(year, month));
}

function resetAfter(now: Date, startDay: number): Date {
  const year = now.getFullYear();
  const month = now.getMonth();
  const thisMonth = resetDayOf(year, month, startDay);

  // Strictly ahead: on the reset day itself the cycle has already restarted,
  // so the next one is a full cycle away.
  if (thisMonth > now.getDate()) {
    return new Date(year, month, thisMonth);
  }
  return new Date(year, month + 1, resetDayOf(year, month + 1, startDay));
}

/**
 * Local midnight of the next billing-cycle restart, derived from `startDay`.
 * The router's `MonthLastClearTime` disagrees with `StartDay` on this device
 * and is treated as advisory only — `startDay` is the source of truth.
 */
export function nextResetDate(startDay: number, clock: Clock): Date {
  return resetAfter(clock.now(), startDay);
}

/** Whole days from today until the next reset. The reset day itself is a full cycle. */
export function daysUntilReset(startDay: number, clock: Clock): number {
  const now = clock.now();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Rounded, not floored: a daylight-saving shift makes a day 23 or 25 hours long.
  return Math.round(
    (resetAfter(now, startDay).getTime() - today.getTime()) /
      MILLISECONDS_PER_DAY,
  );
}
