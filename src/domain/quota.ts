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
