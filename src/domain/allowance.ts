/**
 * Carrying one USSD reading forward with the router's own counter.
 *
 * A sync is expensive — tens of seconds of carrier dialogue — so it happens
 * rarely and its answer has to stay right for days. The trick is to anchor the
 * reading against the router's month counter and then subtract only the
 * counter's growth:
 *
 * ```
 * remainingNow = anchor.remainingBytes − (routerMonthBytes − anchor.routerMonthBytes)
 * ```
 *
 * Because only the delta matters, the anchor survives quits and restarts: the
 * router keeps counting while the app is closed. What it cannot survive is the
 * counter resetting under it, which is why `MonthLastClearTime` is anchored too.
 *
 * An untrustworthy anchor is *reported* as untrustworthy, never quietly
 * repaired: the last figure it could honestly compute is still exposed so the
 * panel can show it marked, but the arithmetic behind it is flagged.
 *
 * Pure — no Electron, no network, and "now" only ever arrives through the
 * injected {@link Clock} shared with `quota.ts`.
 */

import {
  percentUsed,
  systemClock,
  totalUsedBytes,
  type Clock,
} from "./quota.js";
import type { Allowance, MonthStatistics } from "../hilink/types.js";

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * One USSD reading pinned to the router's counter at the instant it was taken.
 * Everything else in this module is derived from one of these.
 */
export interface AllowanceAnchor {
  /** Offer name the carrier stated, e.g. `NET MONTH 200 000`. */
  planLabel: string;
  /** The exact volume left at the instant of the sync. */
  remainingBytes: number;
  /** Null when the carrier stated a volume but no expiry date. */
  expiresAt: Date | null;
  /** The router's month counter — download plus upload — at that same instant. */
  routerMonthBytes: number;
  /** The router's `MonthLastClearTime` then; a change means the counter restarted. */
  routerClearTime: string;
  /** When the sync happened, so the panel can say how old the figure is. */
  syncedAt: Date;
}

/**
 * Why an anchor can no longer be trusted. `"counter-reset"` is the router's
 * month counter restarting under the anchor; `"expired"` is the carrier's own
 * expiry date having passed.
 */
export type AllowanceStaleReason = "counter-reset" | "expired";

/** What the anchor says the allowance is *now*. */
export interface AllowanceReading {
  planLabel: string;
  /**
   * The volume left now, clamped at zero. Present even when the anchor is
   * stale — the last figure that could be computed is better than none, as
   * long as it is marked.
   */
  remainingBytes: number;
  expiresAt: Date | null;
  /**
   * Whole days from now to the expiry, 0 on the expiry day itself and negative
   * once it is behind us. Null when the carrier stated no expiry.
   */
  daysUntilExpiry: number | null;
  /** False when the anchor can no longer carry the arithmetic. */
  trustworthy: boolean;
  /** Why not. Null while the anchor holds. */
  staleReason: AllowanceStaleReason | null;
  /** True when the delta has consumed the whole anchored volume. */
  exhausted: boolean;
  /** The dial's 100%: the highest remaining ever anchored. */
  planTotalBytes: number;
  /**
   * Exact share of {@link planTotalBytes} consumed, or null when the anchor is
   * stale — a caller that gets null falls back to the configured plan limit.
   */
  percentUsed: number | null;
  /** When the anchor behind this reading was taken. */
  syncedAt: Date;
}

export interface AllowanceNowInput {
  anchor: AllowanceAnchor;
  /** The router's current month counter and clear time. */
  month: MonthStatistics;
  /** The remembered high-water total; the anchor's own remaining when absent. */
  planTotalBytes?: number | null;
  /** Injected so every staleness and expiry case is testable. */
  clock?: Clock;
}

/** The router's month counter as one number: download plus upload. */
function counterOf(month: MonthStatistics): number {
  return totalUsedBytes(month.monthDownloadBytes, month.monthUploadBytes);
}

/** Local midnight of `date`, so day counts ignore the time of day. */
function midnight(date: Date): number {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
}

/**
 * Whole days from `now` to `expiry`, both taken at local midnight. Rounded
 * rather than floored, because a daylight-saving shift makes a day 23 or 25
 * hours long.
 */
function wholeDaysUntil(expiry: Date, now: Date): number {
  return Math.round((midnight(expiry) - midnight(now)) / MILLISECONDS_PER_DAY);
}

/** Record one USSD reading against the router's counter at this instant. */
export function anchorFrom(
  allowance: Allowance,
  month: MonthStatistics,
  clock: Clock = systemClock,
): AllowanceAnchor {
  return {
    planLabel: allowance.planLabel,
    remainingBytes: allowance.remainingBytes,
    expiresAt: allowance.expiresAt,
    routerMonthBytes: counterOf(month),
    routerClearTime: month.monthLastClearTime,
    syncedAt: clock.now(),
  };
}

/**
 * The dial's 100%, held separately from any single anchor: the largest
 * remaining volume ever anchored. It must not fall when a later sync anchors a
 * smaller remaining — that is the plan being consumed, not the plan shrinking.
 *
 * Null only when nothing has ever been anchored.
 */
export function planTotalBytes(
  anchor: AllowanceAnchor | null,
  rememberedBytes: number | null,
): number | null {
  if (anchor === null) return rememberedBytes;
  if (rememberedBytes === null) return anchor.remainingBytes;

  return Math.max(anchor.remainingBytes, rememberedBytes);
}

/**
 * Why this anchor cannot be trusted, or null while it can.
 *
 * A reset is checked before an expiry: a counter that restarted invalidates the
 * arithmetic outright, which is the more useful thing to report.
 */
function stalenessOf(
  anchor: AllowanceAnchor,
  month: MonthStatistics,
  now: Date,
): AllowanceStaleReason | null {
  if (
    month.monthLastClearTime !== anchor.routerClearTime ||
    counterOf(month) < anchor.routerMonthBytes
  ) {
    return "counter-reset";
  }

  if (anchor.expiresAt !== null && anchor.expiresAt.getTime() < now.getTime()) {
    return "expired";
  }

  return null;
}

/**
 * What the anchor says is left right now.
 *
 * A reset counter makes the delta meaningless, so the anchored figure itself is
 * reported — never a larger one. An expired anchor still has a coherent
 * counter, so its delta is honoured; only the trust flag changes.
 */
export function readAllowanceNow(input: AllowanceNowInput): AllowanceReading {
  const { anchor, month } = input;
  const now = (input.clock ?? systemClock).now();
  const staleReason = stalenessOf(anchor, month, now);

  const delta =
    staleReason === "counter-reset"
      ? 0
      : counterOf(month) - anchor.routerMonthBytes;
  const remainingBytes = Math.max(0, anchor.remainingBytes - delta);

  const total =
    planTotalBytes(anchor, input.planTotalBytes ?? null) ??
    anchor.remainingBytes;

  return {
    planLabel: anchor.planLabel,
    remainingBytes,
    expiresAt: anchor.expiresAt,
    daysUntilExpiry:
      anchor.expiresAt === null ? null : wholeDaysUntil(anchor.expiresAt, now),
    trustworthy: staleReason === null,
    staleReason,
    exhausted: remainingBytes === 0,
    planTotalBytes: total,
    percentUsed:
      staleReason === null ? percentUsed(total - remainingBytes, total) : null,
    syncedAt: anchor.syncedAt,
  };
}
