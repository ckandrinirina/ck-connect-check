/**
 * Whether the connection is being used moderately, read in three tiers.
 *
 * The question the user actually asks is "am I going through this too fast?",
 * and the honest answer depends on how much of the plan's life has passed. But
 * a useful part of that answer needs nothing typed in at all: a sync states a
 * remaining volume and an expiry date, and those two divide into the figure
 * that gets looked at daily.
 *
 * So each input adds detail rather than unlocking the feature:
 *
 * - **tier 1**, the anchor alone — `remainingNow / daysUntilExpiry`, the volume
 *   a day the remainder still affords.
 * - **tier 2**, plus `planLimitBytes` — the consumed share the dial draws.
 * - **tier 3**, plus `planDays` — the only input that can say how far the
 *   calendar has travelled, and so the only one that can compare the two.
 *
 * Both sides of the tier 3 ratio are cumulative, never per-day, so a weekend of
 * no usage pulls the pace back on its own and no daily history is ever stored.
 *
 * Pure — no Electron, no network, nothing the router speaks, and "now" only
 * ever arrives through the injected {@link Clock}.
 */

import { readAllowanceNow } from "./allowance.js";
import type { AllowanceAnchor, AllowanceNowInput } from "./allowance.js";
import { systemClock, type Clock } from "./quota.js";

const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * The floor on elapsed days. In the plan's first hours the elapsed share is
 * near zero and the ratio explodes, so anything under a day is measured as a
 * day and reported {@link PACE_SAFE} regardless — a plan cannot be behind
 * before it has started.
 */
const MINIMUM_ELAPSED_DAYS = 1;

/** At or under this the spending matches the calendar, or is behind it. */
const SAFE_PACE = 1;

/** Above {@link SAFE_PACE} and up to this it is ahead, but recoverably so. */
const WARNING_PACE = 1.2;

/**
 * How the spending compares with the calendar. `safe` is the state a week of
 * light use produces, and the one a weekend of none returns to.
 */
export type PaceState = "safe" | "warning" | "over";

/**
 * The pace reading. Fields belonging to an unreached tier are `null` rather
 * than absent, so every caller reads one shape and branches on {@link tier}.
 */
export interface PaceReading {
  /** How much of the answer is available: 1 the anchor, 2 the cap, 3 the length. */
  tier: 1 | 2 | 3;
  /** Whole days from now to the carrier's expiry date. Always at least 1. */
  daysUntilExpiry: number;
  /** What the remainder affords each day until then. Rises when nothing is used. */
  sustainablePerDay: number;
  /** Share of the cap consumed. Null below tier 2. */
  usedShare: number | null;
  /** Share of the period elapsed. Null below tier 3. */
  elapsedShare: number | null;
  /** `usedShare / elapsedShare`. Null below tier 3. */
  pace: number | null;
  /** The flat daily budget the plan affords. Null below tier 3. */
  affordedPerDay: number | null;
  /** The band {@link pace} falls in. Null below tier 3. */
  state: PaceState | null;
}

export interface PaceInput {
  /** The anchored carrier reading, or absent before the first sync. */
  anchor: AllowanceAnchor | undefined;
  /** The router's current month counter, for carrying the anchor forward. */
  month: AllowanceNowInput["month"];
  /** The plan the user bought, in bytes. Absent until they state one. */
  planLimitBytes?: number | null;
  /** How many days the plan runs for. Absent until they state it. */
  planDays?: number | null;
  /** Injected so every edge is testable. */
  clock?: Clock;
}

/** Which band a ratio falls in. */
function bandFor(pace: number): PaceState {
  if (pace <= SAFE_PACE) return "safe";

  return pace <= WARNING_PACE ? "warning" : "over";
}

/**
 * What the pace looks like right now, or null when there is nothing honest to
 * say about it.
 *
 * Null in four cases, all of them the same refusal: no anchor at all, a carrier
 * reply that stated no expiry, an anchor the expiry has overtaken, and one the
 * router invalidated by restarting its counter. The last is the subtle one —
 * its `remainingNow` is the anchored figure with no delta applied, so a pace
 * drawn from it would describe a moment that has already passed.
 *
 * Everything else is arithmetic on figures already in hand. The remainder and
 * the days left both come from {@link readAllowanceNow}, so the pace and the
 * dial can never disagree about how much is left.
 */
export function readPace(input: PaceInput): PaceReading | null {
  const { anchor, month } = input;

  if (anchor === undefined) return null;

  const clock = input.clock ?? systemClock;
  const cap = input.planLimitBytes ?? null;
  const reading = readAllowanceNow({
    anchor,
    month,
    planLimitBytes: cap,
    clock,
  });

  // Covers both an expiry that has passed and a counter that restarted: an
  // anchor that cannot carry its own arithmetic cannot carry a pace either.
  if (!reading.trustworthy) return null;

  const daysUntilExpiry = reading.daysUntilExpiry;

  // No expiry stated, or the expiry is today: there is no run of days left to
  // divide the remainder across.
  if (daysUntilExpiry === null || daysUntilExpiry <= 0) return null;

  const tierOne = {
    daysUntilExpiry,
    sustainablePerDay: reading.remainingBytes / daysUntilExpiry,
  };

  if (cap === null || reading.usedBytes === null) {
    return {
      tier: 1,
      ...tierOne,
      usedShare: null,
      elapsedShare: null,
      pace: null,
      affordedPerDay: null,
      state: null,
    };
  }

  const usedShare = reading.usedBytes / cap;
  const planDays = input.planDays ?? null;

  if (planDays === null || anchor.expiresAt === null) {
    return {
      tier: 2,
      ...tierOne,
      usedShare,
      elapsedShare: null,
      pace: null,
      affordedPerDay: null,
      state: null,
    };
  }

  // The carrier states a date, never a duration, so the period's start has to
  // be counted back from the one figure it does give.
  const periodStart =
    anchor.expiresAt.getTime() - planDays * MILLISECONDS_PER_DAY;
  const elapsed = (clock.now().getTime() - periodStart) / MILLISECONDS_PER_DAY;
  const elapsedShare = Math.max(MINIMUM_ELAPSED_DAYS, elapsed) / planDays;
  const pace = usedShare / elapsedShare;

  return {
    tier: 3,
    ...tierOne,
    usedShare,
    elapsedShare,
    pace,
    affordedPerDay: cap / planDays,
    // Below the floor the ratio is the floor's doing rather than the user's,
    // so it is reported as a finite number but never as a verdict.
    state: elapsed < MINIMUM_ELAPSED_DAYS ? "safe" : bandFor(pace),
  };
}
