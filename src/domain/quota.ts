/**
 * Quota math: how much of the plan is used, and how close that is to the limit.
 * Pure — no I/O, no Electron, no network.
 *
 * The percentage returned here is exact. Rounding is a display concern and
 * lives in `format.ts`; thresholds compare against the exact value.
 *
 * This module once also derived the billing cycle's restart from the router's
 * `StartDay`. That went with the panel's "Resets in" tile: the carrier never
 * confirmed `StartDay`, and its own expiry date — which comes back over USSD and
 * lives on the allowance reading — is the one that actually governs.
 */

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

/**
 * The cap as a number worth measuring against, or null.
 *
 * Zero is the router's own way of saying "unset" (`DataLimit: 0MB`), so it is
 * no cap rather than a limit of nothing — and a cap of nothing would put every
 * reading permanently over.
 */
export function planCap(
  planLimitBytes: number | null | undefined,
): number | null {
  if (planLimitBytes === null || planLimitBytes === undefined) return null;

  return Number.isFinite(planLimitBytes) && planLimitBytes > 0
    ? planLimitBytes
    : null;
}

/**
 * The period a Wifiber plan runs over: the calendar month, read rather than
 * typed. Orange states no expiry date and no plan length, so both come from the
 * calendar, which supplies them for free and cannot be left stale.
 */
export interface CalendarMonthPeriod {
  /** Local midnight opening the first of the current month. */
  periodStart: Date;
  /** Days in the current month — 28, 29, 30 or 31. */
  planDays: number;
  /** Days elapsed, counted inclusively: 1 on the first, never 0. */
  elapsedDays: number;
  /** `elapsedDays / planDays`. Exactly 1 on the month's last day. */
  elapsedShare: number;
}

/**
 * Where the calendar month currently stands.
 *
 * Counting is **inclusive**, the same convention T-46 settled for the carrier's
 * last valid day: the day being lived is a day elapsed, not a fraction of one.
 * So the first of the month is one day in — never zero, which would divide the
 * pace ratio by nothing — and the last day is the whole month, which is what
 * makes `elapsedShare` reach exactly 1 rather than stopping just short of it.
 *
 * Everything is taken from the local calendar date, so the hour of day never
 * moves a reading and a daylight-saving shift cannot shorten a day.
 */
export function calendarMonthPeriod(
  clock: Clock = systemClock,
): CalendarMonthPeriod {
  const now = clock.now();
  const year = now.getFullYear();
  const month = now.getMonth();
  // Day zero of the next month is the last day of this one, which is how the
  // calendar answers 28 · 29 · 30 · 31 without a leap-year rule written here.
  const planDays = new Date(year, month + 1, 0).getDate();
  const elapsedDays = now.getDate();

  return {
    periodStart: new Date(year, month, 1),
    planDays,
    elapsedDays,
    elapsedShare: elapsedDays / planDays,
  };
}

/**
 * What the Orange portal's reading says about the plan.
 *
 * The arithmetic inverts here. On YAS the carrier states a *remaining* volume
 * and consumption is derived from the cap; the portal states the *consumed*
 * volume and the remainder is what gets derived. So `usedBytes` is the portal's
 * figure exactly — not a total, not a difference, and never the router's month
 * counter, which counts different traffic entirely: 51.1 Go against the
 * portal's 7.37 Go on the same day.
 */
export interface PortalUsage {
  /** The portal's consumed figure, passed through untouched. */
  usedBytes: number;
  /** `cap − used`, clamped at zero. Null with no cap: nothing to subtract from. */
  remainingBytes: number | null;
  /** Exact share of the cap consumed. Null with no cap — no dial to draw. */
  percentUsed: number | null;
}

/**
 * Reads one portal figure against the cap the user typed in.
 *
 * With no cap there is a consumed volume and nothing else, which is the honest
 * state rather than a degraded one: without a total there is no share to show
 * and no remainder to compute.
 */
export function readPortalUsage(
  consumedBytes: number,
  planLimitBytes: number | null,
): PortalUsage {
  const cap = planCap(planLimitBytes);

  return {
    usedBytes: consumedBytes,
    // Clamped: a cap typed in below what has already been spent would otherwise
    // report a negative remainder rather than an exhausted plan.
    remainingBytes: cap === null ? null : Math.max(0, cap - consumedBytes),
    percentUsed: percentUsed(consumedBytes, cap),
  };
}
