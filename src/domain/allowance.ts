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
const MILLISECONDS_PER_MINUTE = 60_000;

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
  /**
   * How much of the plan has been consumed: the configured cap minus what is
   * left, clamped at zero. Null when no cap is configured — without one there
   * is no total to subtract from, only a remaining volume.
   *
   * Never the router's month counter. That counter runs from whenever the
   * device last cleared itself, which is not the carrier's billing period.
   */
  usedBytes: number | null;
  /**
   * Exact share of the configured cap consumed. Null when no cap is set, and
   * null when the anchor is stale — in both cases there is no dial to draw
   * rather than a figure to guess at.
   */
  percentUsed: number | null;
  /** When the anchor behind this reading was taken. */
  syncedAt: Date;
}

export interface AllowanceNowInput {
  anchor: AllowanceAnchor;
  /** The router's current month counter and clear time. */
  month: MonthStatistics;
  /**
   * The plan the user bought, in bytes — the dial's 100%. Absent or null until
   * they state one; the carrier never reports it.
   */
  planLimitBytes?: number | null;
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

/**
 * The one derivation of "what the plan looks like right now", shared by
 * everything that displays it: the menu bar title, the over-limit notification
 * and the popover's dial all read this and nothing else.
 *
 * Null when nothing has ever been synced. A caller that gets null — or a reading
 * whose {@link AllowanceReading.percentUsed} is null — has no share to show, and
 * must not substitute the router's month counter: that counter runs from
 * whenever the device last cleared itself, which is a different period from the
 * carrier's.
 */
export function readPlanUsage(
  anchor: AllowanceAnchor | undefined,
  month: MonthStatistics,
  planLimitBytes: number | null,
  clock: Clock = systemClock,
): AllowanceReading | null {
  if (anchor === undefined) return null;

  return readAllowanceNow({ anchor, month, planLimitBytes, clock });
}

/**
 * Whether the app should dial the carrier itself rather than wait to be asked.
 *
 * True in exactly the cases where there is nothing worth showing: nothing ever
 * synced, an allowance the carrier's own expiry date has passed, or an anchor
 * the router invalidated by restarting its counter. A healthy anchor is carried
 * forward with no dialogue at all.
 *
 * The narrowness is the point. A dialogue costs tens of seconds and a login
 * against a device that locks the account after five refusals, so this must
 * never become something that happens on a schedule.
 */
export function needsAutomaticSync(
  anchor: AllowanceAnchor | undefined,
  month: MonthStatistics,
  clock: Clock = systemClock,
): boolean {
  if (anchor === undefined) return true;

  return !readAllowanceNow({ anchor, month, clock }).trustworthy;
}

/**
 * Whether a usable anchor has simply gone old.
 *
 * The second of the two questions asked about an anchor, and deliberately
 * separate from {@link needsAutomaticSync}'s first one. That asks whether the
 * anchor can be trusted at all; this asks whether a trustworthy one is recent
 * enough to keep carrying forward. No anchor is *not* stale — that case belongs
 * to the usability check, and conflating the two would run the same dialogue
 * for two different reasons.
 *
 * The boundary is exclusive, so an anchor exactly at the window is not yet
 * stale. A `syncedAt` in the future — a clock moved back, a hand-edited config —
 * yields a negative age and is likewise not stale.
 */
export function isAnchorStale(
  anchor: AllowanceAnchor | null | undefined,
  now: Date,
  staleAfterMinutes: number,
): boolean {
  if (anchor === null || anchor === undefined) return false;

  const age = now.getTime() - anchor.syncedAt.getTime();

  return age > staleAfterMinutes * MILLISECONDS_PER_MINUTE;
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

  const cap = input.planLimitBytes ?? null;
  // Clamped: a cap typed in below what the carrier actually granted would
  // otherwise report a negative consumption.
  const usedBytes = cap === null ? null : Math.max(0, cap - remainingBytes);

  return {
    planLabel: anchor.planLabel,
    remainingBytes,
    expiresAt: anchor.expiresAt,
    daysUntilExpiry:
      anchor.expiresAt === null ? null : wholeDaysUntil(anchor.expiresAt, now),
    trustworthy: staleReason === null,
    staleReason,
    exhausted: remainingBytes === 0,
    usedBytes,
    percentUsed:
      staleReason === null && usedBytes !== null
        ? percentUsed(usedBytes, cap)
        : null,
    syncedAt: anchor.syncedAt,
  };
}
