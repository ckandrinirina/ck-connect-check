/**
 * What the popover shows. Pure — a poll result and the config go in, a bag of
 * display strings comes out; nothing here imports Electron, touches the network
 * or reads the wall clock, so every rendering case is testable without a router
 * or a window.
 *
 * The contract with `src/renderer/` is deliberately blunt: **the renderer does
 * no arithmetic**. Every number the user sees is formatted here, through the
 * shared helpers in `../domain/format.js`, so the popover and the tray can never
 * disagree about what 4 427 475 340 bytes reads as. The renderer's whole job is
 * to put these strings into the DOM.
 */

import { readPlanUsage, type AllowanceReading } from "../domain/allowance.js";
import {
  formatBytes,
  formatDuration,
  formatPercent,
  formatRate,
} from "../domain/format.js";
import { peak, type RateSample } from "../domain/history.js";
import { networkTypeLabel } from "../domain/network-type.js";
import { readMonthlyPace, readPace } from "../domain/pace.js";
import type {
  MonthlyPaceReading,
  PaceReading,
  PaceState,
} from "../domain/pace.js";
import {
  systemClock,
  usageState,
  type Clock,
  type UsageState,
} from "../domain/quota.js";
import { isRouterRefusal } from "../hilink/ussd.js";
import {
  confirmedPlanLimit,
  planLimitInGigaoctets,
  type PlanDaysRefusal,
  type PlanLimitRefusal,
} from "../config/config.js";
import type { PortalReading, PortalStatus } from "./poller.js";
import type { SyncFailure, SyncState, SyncStep } from "./sync.js";
import type { AppConfig } from "../config/defaults.js";
import type { RouterRefusal, SnapshotResult } from "../hilink/client.js";
import type { RouterSnapshot } from "../hilink/types.js";
import type { OrangePortalResult } from "../orange/portal.js";
import type { OrangeForfait } from "../orange/types.js";

/**
 * Shown wherever there is nothing to show — no reading yet, or no plan limit.
 * Matches the dash `../domain/format.js` returns for an unknown value, so a
 * missing field looks the same however it went missing.
 */
const NO_VALUE = "—";

const MILLISECONDS_PER_SECOND = 1_000;

/** The unit the plan-size field is read in, spelled once. */
const PLAN_LIMIT_UNIT = "Go";

/** The plan-length field's unit, spelled once here rather than in the page. */
const PLAN_DAYS_UNIT = "days";

/** A reading that succeeded, remembered so an unreachable router still has something to show. */
export interface UsageReading {
  snapshot: RouterSnapshot;
  /** When the reading was taken — the age in the popover is measured from here. */
  at: Date;
}

/**
 * The usage dial, or the reason there is not one.
 *
 * The `state` field is how close the user is to the plan limit, decided in
 * `../domain/quota.js` against the exact percentage. The renderer does not
 * compare it to anything — it puts it on the root element and lets the
 * stylesheet colour the arc.
 */
export interface PopoverProgress {
  /** False when no plan limit is configured — there is no arc to draw. */
  available: boolean;
  /** `"29%"`, or a dash when there is no limit to measure against. */
  label: string;
  /**
   * How much of the ring to draw, 0 to 1 — geometry rather than text, like
   * {@link PopoverHistory}, so the renderer scales it by the arc's
   * circumference without deriving anything. Clamped, so an overrun plan draws
   * a full ring instead of wrapping round a second time; {@link label} still
   * carries the real share, which is the one thing the user must see.
   */
  sweep: number;
  /** What to tell the user instead of a dial. Empty when the dial is available. */
  prompt: string;
  /** The dial's accessible label: the share of the plan, and the bytes behind it. */
  description: string;
  /** How the dial should read: `"ok"`, `"warn"`, `"over"`, or `"unknown"`. */
  state: UsageState;
}

/** How current the figures are. An unreachable router is stale, never an error. */
export interface PopoverFreshness {
  /** True when the figures come from a past reading rather than a live one. */
  stale: boolean;
  /** Age of the displayed reading, e.g. `"7h 46m"`, or a dash when unknown. */
  age: string;
  /** One line for the header: `"Live"`, or `"Updated 7h 46m ago"`. */
  label: string;
}

/**
 * The last few minutes of throughput, for the sparklines.
 *
 * The one part of the model that is not display strings: a chart is geometry,
 * not text. The renderer still does no arithmetic beyond plotting — the scale
 * it needs is handed to it as {@link PopoverHistory.peak} rather than derived
 * from the series.
 */
export interface PopoverHistory {
  /** Download rates in bytes per second, oldest first. */
  download: number[];
  /** Upload rates in bytes per second, oldest first. */
  upload: number[];
  /** The largest rate across both series — one shared scale. 0 when empty. */
  peak: number;
}

/**
 * The carrier's own figure, carried forward from the last sync.
 *
 * Separate from {@link PopoverProgress} because it answers a different
 * question: the dial is a share of the plan, this is the exact volume the
 * carrier said was left. When {@link PopoverAllowance.stale} is set the figure
 * is the last one that could honestly be computed — shown, but marked.
 */
export interface PopoverAllowance {
  /** False when nothing has been synced yet — there is no figure to show. */
  available: boolean;
  /** Carrier's offer name, e.g. `"NET MONTH 200 000"`, or a dash. */
  planLabel: string;
  /** Exact volume left, e.g. `"90.00 Go"`, or a dash. */
  remaining: string;
  /** Expiry as a date, e.g. `"12/08/2026"`, or a dash. */
  expires: string;
  /** Time left before the allowance expires, e.g. `"16 days"`, or a dash. */
  daysUntilExpiry: string;
  /** True when the anchor can no longer be trusted, so the figure is marked. */
  stale: boolean;
  /** Why it is marked, in words. Empty while the anchor holds. */
  note: string;
  /** True when the whole allowance has been consumed. */
  exhausted: boolean;
  /**
   * How old the figure is, e.g. `"Synced 7h 46m ago"`, or a dash before the
   * first sync. Measured against the injected clock rather than stored, so
   * every poll push ages it without a sync being needed.
   */
  syncedAgo: string;
}

/**
 * The Sync button and the line beneath it.
 *
 * The renderer decides nothing here either: whether the button is pressable,
 * what it says, and what the line under it reads are all settled in this file,
 * so the panel cannot disagree with the dialogue it is reporting on.
 */
export interface PopoverSync {
  /** True while a dialogue is in flight — the button refuses a second press. */
  busy: boolean;
  /** True when the anchored figure has gone stale, so Sync is called out. */
  attention: boolean;
  /** True when the panel must ask for the router password before dialling. */
  needsPassword: boolean;
  /** What the button says: `"Sync"`, or `"Syncing…"`. */
  buttonLabel: string;
  /** The button's accessible name — a sentence, not a word. */
  buttonDescription: string;
  /** The line under the button: progress, failure, or empty when idle. */
  status: string;
  /**
   * True when the dialogue behind {@link PopoverSync.status} started on its
   * own rather than from a press. The line reads the same either way — the
   * steps and the failures are the same steps and failures — but a panel that
   * lights up unbidden should say that it did.
   */
  automatic: boolean;
}

/**
 * The plan-size field beside the dial.
 *
 * The cap is the one figure the carrier never states, so it has to be typed in.
 * The field is always on the panel rather than appearing only when unset: a
 * plan that changes has to be correctable, and an editor you have to discover
 * how to reopen is one nobody reopens.
 */
export interface PopoverPlanLimit {
  /** The stored cap as bare Go digits for the input, e.g. `"150"`. Empty when unset. */
  value: string;
  /** The unit the field is read in — spelled here, never in the renderer. */
  unit: string;
  /** True while no cap is stored, so the field can be shown as the thing to fill in. */
  needsValue: boolean;
  /** Why the last entry was refused, as a sentence. Empty when it was not. */
  error: string;
  /** The field's accessible name. */
  description: string;
}

/**
 * The plan-length field, in the same shape as {@link PopoverPlanLimit}. The two
 * sit beside each other on the panel because they are the same kind of thing:
 * the only two figures the carrier never states, so the user has to.
 */
export interface PopoverPlanDays {
  /** The stored length as bare digits for the input, e.g. `"30"`. Empty when unset. */
  value: string;
  /** The unit the field is read in — spelled here, never in the renderer. */
  unit: string;
  /** True while no length is stored, so the field can be shown as fillable. */
  needsValue: boolean;
  /** Why the last entry was refused, as a sentence. Empty when it was not. */
  error: string;
  /** The field's accessible name. */
  description: string;
}

/**
 * The bar the band is drawn as, or absent below tier 3.
 *
 * A band is a magnitude with three named regions, which a bar states faster
 * than a sentence. The two shares are geometry rather than text — the third
 * exception to the no-numbers rule, alongside {@link PopoverHistory} and the
 * dial's sweep — because only the renderer knows how wide its own track is.
 * Everything else here is already spelled the way it appears.
 */
export interface PopoverPaceMeter {
  /**
   * How much of the drawn track to fill, 0 to 1. Clamped at the full track, so
   * a runaway month is visibly pinned rather than running off the panel; the
   * numerals beside it stay exact, which is the part that must not be rounded
   * away.
   */
  fill: number;
  /**
   * Where the afforded figure sits on that same track, 0 to 1. Fill past this
   * mark is what says "over" without relying on hue, so it comes from here
   * rather than being a number the stylesheet happens to agree with.
   */
  tick: number;
  /** `safe`, `warning` or `over` — the band, for the stylesheet. */
  state: PaceState;
  /** `"6.10 Go"` — what is actually being spent a day. */
  average: string;
  /** `"5.00 Go"` — what the plan affords a day. */
  afforded: string;
  /** The meter's accessible name: the two volumes, and which band they fall in. */
  description: string;
}

/**
 * The pace row, in whatever detail the stored figures allow.
 *
 * Every field is a finished string, empty when its tier has not been reached —
 * so the renderer shows what is there and hides what is not, and never decides
 * which tier it is looking at by inspecting the arithmetic.
 */
export interface PopoverPace {
  /** How much of the reading is available: 1 the anchor, 2 the cap, 3 the length. */
  tier: number;
  /**
   * `"3.00 Go a day left to spend until 06/08/2026"`, and empty wherever
   * {@link meter} is drawn.
   *
   * The two face opposite directions in time. The meter is a diagnosis — what
   * has been spent a day against what the plan affords a day, both looking
   * back — and this is a prescription, what is left to spend a day from now.
   * Side by side they read as one contradiction rather than two answers, and
   * where the meter can be drawn it is the reading that says what is needed.
   * The prescription is given up knowingly: at tier 3 the panel says the
   * connection is being used too fast without naming the figure that would
   * correct it.
   *
   * Below tier 3 there is no meter, and this line is the whole pace row — so
   * it says *left to spend* out loud, having nothing beside it to be read
   * against. That includes T-42's unconfirmed cap, which falls back to tier 1
   * with the meter off the panel entirely.
   */
  sustainable: string;
  /** Tier 3: `safe`, `warning` or `over`, for the stylesheet. Empty below it. */
  state: string;
  /**
   * Tiers 1 and 2: which setting would sharpen this, so the reason the band is
   * missing sits next to its absence. Empty at tier 3, where nothing is.
   */
  hint: string;
  /**
   * Tier 3: the band drawn as a bar. Null below it — there is no afforded
   * figure to measure against, so there is nothing to draw a track from.
   */
  meter: PopoverPaceMeter | null;
}

/**
 * The ask that replaces the dial when a sync has brought back a plan the stored
 * cap cannot describe.
 *
 * Present only while the cap is in doubt: with it on screen the panel keeps the
 * tier 1 pace, which needs no cap, and shows neither a share nor a band rather
 * than deriving either from a figure the carrier has contradicted.
 */
export interface PopoverPlanCapPrompt {
  /** What happened and what to do about it, in one sentence. */
  message: string;
  /** What the confirm control says: `"Confirm"`. */
  confirmLabel: string;
  /** That control's accessible name — a sentence, not a word. */
  description: string;
}

/**
 * Which of the panel's controls the carrier has anything behind.
 *
 * A control the user can reach but not use is worse than the space it costs: a
 * Sync button that syncs nothing and a plan length the calendar overrules both
 * invite an action that does nothing. So the panel does not draw them at all
 * rather than greying them out — a disabled control still says the app might
 * have done the thing, and a hidden one is still reachable by keyboard.
 */
export interface PopoverControls {
  /** Whether the Sync button and its status line belong on the panel. */
  sync: boolean;
  /** Whether the plan-length field belongs in the settings view. */
  planDays: boolean;
}

/** Every control the panel has — what an anchored carrier offers. */
const ALL_CONTROLS: PopoverControls = { sync: true, planDays: true };

/**
 * What a carrier the app cannot place offers. `createAllowanceSync` already
 * refuses to dial on one — there is no allowance source to dial for — so the
 * button is a control that does nothing when pressed, and the row it stands in
 * is exactly the room the line saying so needs.
 */
const UNPLACED_CONTROLS: PopoverControls = { sync: false, planDays: true };

/**
 * What Orange offers. Neither absence is a limitation of the app: there is no
 * dialogue to press for, since the portal answers a plain `GET`, and the
 * calendar month states the period any typed length would contradict.
 */
const PORTAL_CONTROLS: PopoverControls = { sync: false, planDays: false };

/** One forfait the meter could be pointed at instead of the current one. */
export interface PopoverForfaitOption {
  /** The label the portal gave it, which is also what the choice is stored as. */
  label: string;
  /** The control's accessible name — a sentence, not a bare name. */
  description: string;
}

/**
 * The plan the carrier's own page says it is measuring.
 *
 * The user asked for the app to detect the plan rather than be told it, so the
 * detected name on the panel is the evidence detection worked. The
 * alternatives are the one case where the name alone is not enough: a plan
 * silently chosen from several is a guess presented as a decision unless the
 * panel says so and offers the others.
 */
export interface PopoverForfait {
  /** The plan being measured, as the portal names it. A dash when it named none. */
  label: string;
  /** Why a choice is being offered. Empty when none is. */
  note: string;
  /** The plans the meter could measure instead. Empty unless the app chose alone. */
  alternatives: PopoverForfaitOption[];
}

/**
 * What the panel says when it picked and the user did not. Short on purpose:
 * the alternatives beneath it say the rest, and there are 320 px to say it in.
 */
const FORFAIT_PICKED_NOTE = "Picked for you from several plans.";

/**
 * The plan the portal named, and the ones it did not.
 *
 * The offer is gated on both halves of {@link ForfaitSelection}: several
 * candidates, and a selection the app made rather than the user. Either alone
 * is not worth a control — a single forfait has no alternative to offer, and a
 * remembered one was already decided.
 *
 * `offering` is the third gate, and it is the panel's rather than the page's:
 * wherever there is a notice to show, every alternative is a dead control.
 * `selectForfait` only ever remembers a data forfait, so a page that listed
 * none has nothing a press could point the meter at, and a page that could not
 * be read cannot show the effect of a choice either.
 */
function buildForfait(
  reading: PortalReading,
  offering: boolean,
): PopoverForfait {
  const { forfait, candidates, remembered } = reading;
  const label =
    forfait === null || forfait.label === "" ? NO_VALUE : forfait.label;

  if (!offering || candidates.length <= 1 || remembered) {
    return { label, note: "", alternatives: [] };
  }

  return {
    label,
    note: FORFAIT_PICKED_NOTE,
    alternatives: candidates
      .filter((candidate) => candidate.label !== forfait?.label)
      .map((candidate) => ({
        label: candidate.label,
        description: `Measure ${candidate.label} instead`,
      })),
  };
}

/** Everything the popover displays, already spelled the way it appears on screen. */
export interface PopoverModel {
  /**
   * The plan consumed this month, as the carrier counts it.
   *
   * There is deliberately no download/upload split beside it: the plan is
   * billed on their sum, which this figure and the carrier's own remaining
   * already state twice over, and the panel had outgrown its window.
   */
  monthTotal: string;
  progress: PopoverProgress;
  /** Live throughput, e.g. `"2.4 Ko/s"`. */
  downloadRate: string;
  uploadRate: string;
  /** Devices currently on the router's Wi-Fi, e.g. `"3"`. */
  connectedDevices: string;
  /** Network name, e.g. `"Yas"`. */
  carrier: string;
  /**
   * Signal strength as the router counts it, and the scale it counts on — the
   * other exception to the no-numbers rule, alongside {@link PopoverHistory}
   * and the dial's sweep. The header draws four bars whatever the router's own
   * maximum is, so it needs the level as a share to scale rather than as text
   * to print; `"4/5"` can be read but not drawn. 0 of 0 before the first
   * reading, which is no signal rather than an empty one.
   */
  signalBars: number;
  maxSignalBars: number;
  /** The bars' accessible name: `"Signal 4 of 5"`, or the state before one. */
  signalDescription: string;
  /**
   * The radio behind those bars: `"4G"`, `"2G"`, `"No service"`, or the bare
   * code when no table covers it. Five bars on a 2G fallback are not five bars
   * on LTE, and the bars alone cannot say which.
   */
  networkType: string;
  freshness: PopoverFreshness;
  /** Recent throughput for the sparklines. */
  history: PopoverHistory;
  /** The carrier's exact remaining volume, carried forward from the last sync. */
  allowance: PopoverAllowance;
  /** The plan-size field, and whatever the last entry has to answer for. */
  planLimit: PopoverPlanLimit;
  /** The plan-length field, beside it, on the same terms. */
  planDays: PopoverPlanDays;
  /**
   * The new-plan confirmation, or null while the stored cap is believed. Null
   * is the ordinary state: this appears only after a sync contradicted the cap.
   */
  planCapPrompt: PopoverPlanCapPrompt | null;
  /**
   * The pace under the dial, or null when there is nothing honest to say — a
   * rate over a period nobody stated is the same lie the dial refuses to draw
   * before a sync.
   */
  pace: PopoverPace | null;
  /** The Sync button's state, and whatever the last press has to say. */
  sync: PopoverSync;
  /** Which of those controls the panel should draw at all, on this carrier. */
  controls: PopoverControls;
  /**
   * The plan the carrier's own page named, or null on a carrier with no such
   * page — where the plan's name arrives with the allowance instead.
   */
  forfait: PopoverForfait | null;
  /**
   * Why there is no figure, in one sentence. Empty whenever there is one.
   *
   * A line rather than a dialog or a thrown error: the app runs unattended in
   * the menu bar, where there is nobody to dismiss a box and nowhere for an
   * exception to go. Each cause gets its own wording, and each names what was
   * actually observed — the HTTP status where there was one, the count of
   * plans where the page parsed, the network name where the router gave one —
   * because "it failed" tells the user nothing they can act on.
   */
  notice: string;
}

export interface PopoverInput {
  /** The latest poll result, or `null` before the first poll has settled. */
  result: SnapshotResult | null;
  /** The most recent successful reading, or `null` if there has never been one. */
  lastReading: UsageReading | null;
  config: AppConfig;
  /**
   * Recent throughput samples, oldest first — read, never recorded here, so
   * building the model twice shows the same history twice.
   */
  history?: readonly RateSample[];
  /** Where the Sync button has got to. Idle when the caller has no sync running. */
  sync?: SyncState;
  /**
   * Where the Orange portal stands, read only when the SIM is on Orange.
   *
   * Deliberately separate from {@link PopoverInput.result}: the router and the
   * portal are two sources that fail on their own terms, and flattening them
   * into one "offline" would tell the user to fix the wrong thing.
   */
  portal?: PortalStanding;
  /** Why the last typed plan size was refused, if one was. */
  planLimitProblem?: PlanLimitRefusal | undefined;
  /** Why the last typed plan length was refused, if one was. */
  planDaysProblem?: PlanDaysRefusal | undefined;
  /** Injected so the reset countdown and the staleness age are testable. */
  clock?: Clock;
}

/** `"5 days"`, `"1 day"` — the countdown never reads `"1 days"`. */
function formatDays(days: number): string {
  return `${days} day${days === 1 ? "" : "s"}`;
}

/** Empty carrier names are normal on this device; they read as a dash, not as blank. */
function formatCarrier(carrier: string): string {
  return carrier.trim() === "" ? NO_VALUE : carrier;
}

/** What the bars are called before there is a reading behind them. */
const NO_SIGNAL_DESCRIPTION = "No signal reading yet";

/**
 * The bars' accessible name. A scale of zero is a router that has not said
 * anything yet rather than a connection at its worst, so it reads as the
 * former — the same distinction the dial draws between 0% and no dial.
 */
function signalDescription(bars: number, maxBars: number): string {
  return maxBars <= 0
    ? NO_SIGNAL_DESCRIPTION
    : `Signal ${String(bars)} of ${String(maxBars)}`;
}

/** What the panel says where the ring used to be, once the cap is in doubt. */
const PLAN_CAP_PROMPT = "This looks like a new plan — confirm its size.";

/**
 * The one thing a share always needs, in the words the panel shows. Spelled
 * once because both carriers reach it: the cap is the figure neither a USSD
 * reply nor the portal ever states.
 */
const SET_LIMIT_PROMPT = "Set a plan limit to see how much of it is left.";

/** The same, for a screen reader. */
const NO_LIMIT_DESCRIPTION = "No plan limit set, so the share used is unknown";

/**
 * Why there is no dial, in the words the panel shows. Each case names the one
 * thing the user can do about it — an "unavailable" ring with no instruction is
 * just a hole in the panel.
 *
 * An unconfirmed cap is checked before a missing one, because a stored cap in
 * doubt is not a cap nobody typed: telling the user to set one they have
 * already set names the wrong fix.
 */
function dialPrompt(
  allowance: AllowanceReading | null,
  limitBytes: number | null,
  capUnconfirmed: boolean,
): string {
  if (allowance === null) {
    return "Sync to read how much of your plan is left.";
  }
  if (capUnconfirmed) {
    return PLAN_CAP_PROMPT;
  }
  if (limitBytes === null) {
    return SET_LIMIT_PROMPT;
  }

  return "That figure is out of date — sync to refresh the dial.";
}

/** The same four cases, for a screen reader. */
function dialDescription(
  allowance: AllowanceReading | null,
  limitBytes: number | null,
  capUnconfirmed: boolean,
): string {
  if (allowance === null) {
    return "No allowance synced from the carrier yet";
  }
  if (capUnconfirmed) {
    return "The plan size needs confirming before the share can be shown";
  }
  if (limitBytes === null) {
    return NO_LIMIT_DESCRIPTION;
  }

  return "The last synced figure can no longer be trusted";
}

/**
 * The confirmation, or null while the cap is believed.
 *
 * The wording names the cause rather than the symptom: a user who topped up
 * knows they did, and "confirm its size" is the one action that clears it. The
 * field beside it already holds the stored cap, so an unchanged plan size is
 * confirmed with a single press rather than retyped.
 */
function buildPlanCapPrompt(
  capUnconfirmed: boolean,
): PopoverPlanCapPrompt | null {
  if (!capUnconfirmed) return null;

  return {
    message: `${PLAN_CAP_PROMPT} The dial and the pace stay hidden until it is.`,
    confirmLabel: "Confirm",
    description: "Confirm the plan size shown in the field beside this",
  };
}

function buildFreshness(
  stale: boolean,
  reading: UsageReading | null,
  now: Date,
): PopoverFreshness {
  if (!stale) {
    return { stale: false, age: NO_VALUE, label: "Live" };
  }

  if (reading === null) {
    return { stale: true, age: NO_VALUE, label: "Waiting for the router" };
  }

  const age = formatDuration(
    (now.getTime() - reading.at.getTime()) / MILLISECONDS_PER_SECOND,
  );

  return { stale: true, age, label: `Updated ${age} ago` };
}

/** `"12/08/2026"` — built by hand, so the panel reads the same on every machine. */
function formatDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");

  return `${day}/${month}/${date.getFullYear()}`;
}

/**
 * The day an expiry runs *through*, which is the day the panel prints.
 *
 * `expiresAt` is the midnight that ends the last valid day — an exclusive upper
 * bound, which is what every span measured against it wants: the period start,
 * the days remaining, the expiry check. Printed as-is it names the day after
 * the one the carrier stated, and an app that contradicts the carrier's own SMS
 * is the unreliability the anchor exists to remove. So the display steps back
 * to the last valid moment; the stored instant stays the single one it was.
 */
function formatLastValidDay(expiresAt: Date): string {
  return formatDate(new Date(expiresAt.getTime() - 1));
}

/** Why a marked figure is marked, in the words the panel shows. */
function staleNote(reading: AllowanceReading): string {
  if (reading.staleReason === "counter-reset") {
    return "The router's counter was reset — sync to refresh.";
  }
  if (reading.staleReason === "expired") {
    return "This allowance has expired — sync to refresh.";
  }

  return "";
}

/** The panel before the first sync: an allowance section with nothing in it. */
function noAllowance(): PopoverAllowance {
  return {
    available: false,
    planLabel: NO_VALUE,
    remaining: NO_VALUE,
    expires: NO_VALUE,
    daysUntilExpiry: NO_VALUE,
    stale: false,
    note: "",
    exhausted: false,
    syncedAgo: NO_VALUE,
  };
}

function buildAllowance(
  reading: AllowanceReading | null,
  now: Date,
): PopoverAllowance {
  if (reading === null) return noAllowance();

  const age = formatDuration(
    (now.getTime() - reading.syncedAt.getTime()) / MILLISECONDS_PER_SECOND,
  );

  return {
    available: true,
    planLabel: reading.planLabel === "" ? NO_VALUE : reading.planLabel,
    remaining: formatBytes(reading.remainingBytes),
    expires:
      reading.expiresAt === null
        ? NO_VALUE
        : formatLastValidDay(reading.expiresAt),
    daysUntilExpiry:
      reading.daysUntilExpiry === null
        ? NO_VALUE
        : formatDays(reading.daysUntilExpiry),
    stale: !reading.trustworthy,
    note: staleNote(reading),
    exhausted: reading.exhausted,
    syncedAgo: `Synced ${age} ago`,
  };
}

/**
 * The one place a failure reason becomes a sentence. Every reason gets its own
 * wording: "the sync failed" tells the user nothing they can act on, whereas a
 * busy channel, a wrong password and a locked account each call for something
 * different.
 */
const SYNC_FAILURE_TEXT: Record<Exclude<SyncFailure, RouterRefusal>, string> = {
  busy: "The router is busy with another request — try again in a moment.",
  timeout: "The carrier did not answer in time — try again.",
  "wrong-credential": "The router refused that password.",
  "account-locked":
    "The router has locked the account after too many refused sign-ins.",
  "no-password": "No password saved for the router yet.",
  "keychain-unavailable":
    "The Keychain is unavailable, so nothing was stored — try again.",
  unreachable: "The router is not answering.",
  session: "The router dropped the session — try again.",
  error: "The router refused the request.",
  "not-logged-in": "The router wants a sign-in before it will dial.",
  unreadable: "The carrier replied with something we could not read.",
};

/**
 * A refusal that carries a number says the number. It is the one thing on this
 * panel the user cannot work out for themselves and the only thing that makes
 * the failure reportable, so it is spelled out rather than summarised away.
 */
function refusalText(refusal: RouterRefusal): string {
  return refusal.source === "http"
    ? `The router answered HTTP ${String(refusal.code)} at ${refusal.endpoint}.`
    : `The router refused the request (code ${String(refusal.code)} at ${refusal.endpoint}).`;
}

/** One failure, whether it arrived as a word or as a number. */
function failureText(reason: SyncFailure): string {
  return isRouterRefusal(reason)
    ? refusalText(reason)
    : SYNC_FAILURE_TEXT[reason];
}

/** What the panel says while a dialogue is on a given step. */
const SYNC_STEP_TEXT: Record<SyncStep, string> = {
  "signing-in": "Signing in to the router…",
  "asking-carrier": "Asking the carrier what is left…",
};

/** The button and its status line, for one sync state. */
function buildSync(state: SyncState, attention: boolean): PopoverSync {
  const busy = state.phase === "running";

  return {
    busy,
    attention,
    automatic:
      (state.phase === "running" || state.phase === "failed") &&
      state.automatic === true,
    needsPassword: state.phase === "needs-password",
    buttonLabel: busy ? "Syncing…" : "Sync",
    buttonDescription: busy
      ? "Syncing the allowance with the carrier"
      : "Sync the allowance with the carrier",
    status: syncStatus(state),
  };
}

function syncStatus(state: SyncState): string {
  if (state.phase === "running") return SYNC_STEP_TEXT[state.step];
  if (state.phase === "needs-password") {
    return SYNC_FAILURE_TEXT["no-password"];
  }
  if (state.phase === "failed") return failureText(state.reason);

  return "";
}

/**
 * One sentence per refusal. "That value is not valid" tells the user nothing
 * they can act on, whereas an empty box, a typo and a zero each call for
 * something different.
 */
const PLAN_LIMIT_ERROR_TEXT: Record<PlanLimitRefusal, string> = {
  blank: "Enter the size of your plan in Go.",
  "not-a-number": "That is not a number — enter the size in Go, like 150.",
  "not-positive": "A plan has to be larger than zero.",
};

/** The plan-size field for one stored cap, and whatever the last entry left behind. */
function buildPlanLimit(
  limitBytes: number | null,
  problem: PlanLimitRefusal | undefined,
): PopoverPlanLimit {
  return {
    value: limitBytes === null ? "" : planLimitInGigaoctets(limitBytes),
    unit: PLAN_LIMIT_UNIT,
    needsValue: limitBytes === null,
    error: problem === undefined ? "" : PLAN_LIMIT_ERROR_TEXT[problem],
    description: "The size of your plan, in Go",
  };
}

/**
 * One sentence per refusal, on the same terms as the cap's. A fraction gets its
 * own line rather than being folded into "not a number": the user typed a
 * perfectly good number, and the thing to say is which kind is wanted.
 */
const PLAN_DAYS_ERROR_TEXT: Record<PlanDaysRefusal, string> = {
  blank: "Enter how many days your plan runs for.",
  "not-a-number": "That is not a number — enter the length in days, like 30.",
  "not-positive": "A plan has to last at least a day.",
  "not-whole": "Enter whole days, like 30.",
};

/** The plan-length field for one stored period, and the last entry's complaint. */
function buildPlanDays(
  days: number | null,
  problem: PlanDaysRefusal | undefined,
): PopoverPlanDays {
  return {
    value: days === null ? "" : String(days),
    unit: PLAN_DAYS_UNIT,
    needsValue: days === null,
    error: problem === undefined ? "" : PLAN_DAYS_ERROR_TEXT[problem],
    description: "How many days your plan runs for",
  };
}

/**
 * The band as the user reads it. A word rather than a colour alone: the colour
 * is the fast answer, and the word is the one that survives a colourblind eye
 * and an accessible label.
 */
const PACE_BAND_TEXT: Record<PaceState, string> = {
  safe: "On track",
  warning: "A little fast",
  over: "Too fast",
};

/**
 * How wide the meter is drawn, in multiples of the afforded figure. Twice, so
 * the tick sits at the middle and an overshoot has somewhere to go: a pace of 8
 * on a track exactly one budget wide would be indistinguishable from a pace of
 * 2, and on an unclamped one it would leave the panel.
 */
const PACE_METER_SPAN = 2;

/**
 * The four figures a meter is drawn from, whichever carrier stated them. YAS
 * reaches them at tier 3 and Orange from the calendar month, and the bar is the
 * same bar either way — the bands are the one thing the two readings share.
 */
type PaceBands = Pick<
  PaceReading,
  "pace" | "averagePerDay" | "affordedPerDay" | "state"
>;

/**
 * The band drawn as a bar, or null below tier 3.
 *
 * Every tier 3 field is read together rather than trusting {@link
 * PaceReading.tier}: the four are filled by the same branch, so a null in any
 * of them is the same absence, and reading them is what convinces the compiler
 * as well as the reader.
 */
function buildPaceMeter(reading: PaceBands): PopoverPaceMeter | null {
  const { pace, averagePerDay, affordedPerDay, state } = reading;

  if (
    pace === null ||
    averagePerDay === null ||
    affordedPerDay === null ||
    state === null
  ) {
    return null;
  }

  const average = formatBytes(averagePerDay);
  const afforded = formatBytes(affordedPerDay);

  return {
    // Clamped for drawing only. A negative pace cannot arise — both sides of
    // the ratio are volumes — but a bar drawn from one would run backwards.
    fill: Math.min(Math.max(pace, 0), PACE_METER_SPAN) / PACE_METER_SPAN,
    tick: 1 / PACE_METER_SPAN,
    state,
    average,
    afforded,
    description: `${average} a day against ${afforded} a day budgeted — ${PACE_BAND_TEXT[state]}`,
  };
}

/**
 * What would sharpen a reading that has not reached tier 3, named so the reason
 * the band is missing sits beside its absence — both settings are fields on
 * this same panel.
 */
const PACE_HINT_TEXT: Record<number, string> = {
  1: "Set your plan size to see how much of it is gone.",
  2: "Set how long your plan lasts to see whether that is fast.",
};

/**
 * The pace row for one reading, or null when there is no reading.
 *
 * `expiresAt` comes from the allowance rather than from the pace: the pace
 * carries the days left, which is what it divides by, and the row states the
 * date those days run to. A reading with no date behind it cannot exist —
 * `readPace` already refuses one — so a null here is null throughout.
 */
function buildPace(
  reading: PaceReading | null,
  expiresAt: Date | null,
): PopoverPace | null {
  if (reading === null || expiresAt === null) return null;

  const meter = buildPaceMeter(reading);

  return {
    tier: reading.tier,
    // One decision, read twice: the line is exactly the meter's absence. Both
    // fields come from `meter` rather than from the tier, because the tier is
    // not the question — T-42's unconfirmed cap falls back to tier 1 and draws
    // no meter, and there the line is the only pace reading the panel has.
    sustainable:
      meter === null
        ? `${formatBytes(reading.sustainablePerDay)} a day left to spend until ${formatLastValidDay(expiresAt)}`
        : "",
    state: reading.state ?? "",
    hint: PACE_HINT_TEXT[reading.tier] ?? "",
    meter,
  };
}

function buildHistory(samples: readonly RateSample[]): PopoverHistory {
  return {
    download: samples.map((sample) => sample.downloadBytesPerSecond),
    upload: samples.map((sample) => sample.uploadBytesPerSecond),
    peak: peak(samples),
  };
}

/** The model shown before the first reading, and whenever every reading has been lost. */
function emptyModel(
  freshness: PopoverFreshness,
  warnThresholdPercent: number,
  history: PopoverHistory,
  sync: PopoverSync,
  planLimit: PopoverPlanLimit,
  planDays: PopoverPlanDays,
  pace: PopoverPace | null,
  planCapPrompt: PopoverPlanCapPrompt | null,
): PopoverModel {
  return {
    monthTotal: NO_VALUE,
    progress: buildDial(null, null, warnThresholdPercent),
    downloadRate: NO_VALUE,
    uploadRate: NO_VALUE,
    connectedDevices: NO_VALUE,
    carrier: NO_VALUE,
    signalBars: 0,
    maxSignalBars: 0,
    signalDescription: NO_SIGNAL_DESCRIPTION,
    // Not "No service": that is a claim about the link, and nothing has been
    // read yet. An unknown field looks the same however it went missing.
    networkType: NO_VALUE,
    freshness,
    history,
    allowance: noAllowance(),
    planLimit,
    planDays,
    planCapPrompt,
    pace,
    sync,
    // No reading has named a carrier, so nothing has stood a control down.
    controls: ALL_CONTROLS,
    forfait: null,
    // Nothing has been read, so nothing has gone wrong: the dial's own prompt
    // already says the panel is waiting rather than failing.
    notice: "",
  };
}

/**
 * The dial: the plan the user bought, and how much of it the carrier says is
 * gone. It needs both halves — a trustworthy anchor and a stated cap — and
 * shows nothing when either is missing.
 *
 * There is deliberately no fallback to the router's month counter. That counter
 * runs from whenever the device last cleared itself, so measuring it against the
 * plan puts two different months in one ring; a prompt is more use than a
 * percentage of the wrong number.
 */
function buildDial(
  allowance: AllowanceReading | null,
  limitBytes: number | null,
  warnThresholdPercent: number,
  capUnconfirmed = false,
): PopoverProgress {
  const percent = allowance?.percentUsed ?? null;
  const state = usageState(percent, warnThresholdPercent);

  if (percent === null) {
    return {
      available: false,
      label: NO_VALUE,
      sweep: 0,
      prompt: dialPrompt(allowance, limitBytes, capUnconfirmed),
      description: dialDescription(allowance, limitBytes, capUnconfirmed),
      state,
    };
  }

  const used = formatBytes(allowance?.usedBytes ?? 0);

  return {
    available: true,
    label: formatPercent(percent),
    // Clamped for the same reason it always was, though the carrier's own
    // remaining never goes below zero, so the share never passes 100%.
    sweep: Math.min(Math.max(percent, 0), 100) / 100,
    prompt: "",
    description: `${formatPercent(percent)} of the plan used, ${used} so far`,
    state,
  };
}

/**
 * The half of the panel the carrier decides: what the plan has left, and how
 * fast it is going. Everything else — throughput, signal, devices, the network
 * name — comes from the router and reads the same on every network.
 *
 * The two carriers fill it from opposite directions. YAS carries a remaining
 * volume forward from an anchor; Orange is handed a consumed volume on every
 * fetch and derives the remainder. Naming the shape they share is what keeps
 * the branch to one line at the bottom of this file.
 */
interface AllowanceHalf {
  monthTotal: string;
  progress: PopoverProgress;
  allowance: PopoverAllowance;
  pace: PopoverPace | null;
  /** Whether the Sync button should be calling for attention. */
  syncAttention: boolean;
  /** Which controls this carrier leaves the panel anything to do with. */
  controls: PopoverControls;
  /** The plan the carrier's page named, or null where there is no such page. */
  forfait: PopoverForfait | null;
  /** Why this half has no figure, or empty while it has one. */
  notice: string;
}

/**
 * The YAS half: the anchor, carried forward by the router's counter delta.
 *
 * Also the half a carrier the app cannot place falls to, which is why the
 * carrier reaches it. There is no second source to try there — the anchor is
 * the only one this branch has — so the panel says which network the router
 * named and that nothing is known about where its allowance lives.
 */
function anchoredHalf(
  config: AppConfig,
  month: RouterSnapshot["month"],
  carrier: RouterSnapshot["carrier"],
  cap: number | null,
  capUnconfirmed: boolean,
  clock: Clock,
  now: Date,
): AllowanceHalf {
  // The same derivation the menu bar reads, so the two cannot disagree.
  const allowance = readPlanUsage(config.allowanceAnchor, month, cap, clock);
  const placed = carrier.id !== "unknown";

  return {
    // The plan figure, which is the only month the carrier stands behind. The
    // router's own download and upload counters are still read — the anchor is
    // carried forward with them — but they are not shown: they measure a
    // different month from this one, and the panel has no room to explain that.
    monthTotal:
      allowance?.usedBytes === undefined || allowance.usedBytes === null
        ? NO_VALUE
        : formatBytes(allowance.usedBytes),
    progress: buildDial(
      allowance,
      cap,
      config.warnThresholdPercent,
      capUnconfirmed,
    ),
    allowance: buildAllowance(allowance, now),
    pace: buildPace(
      readPace({
        anchor: config.allowanceAnchor,
        month,
        planLimitBytes: cap,
        planDays: config.planDays,
        clock,
      }),
      allowance?.expiresAt ?? null,
    ),
    // An anchor that can no longer carry the arithmetic is the one thing the
    // button has to call out: the figure on screen is the last honest one.
    syncAttention: allowance !== null && !allowance.trustworthy,
    controls: placed ? ALL_CONTROLS : UNPLACED_CONTROLS,
    // The plan's name arrives on the anchor here, and the allowance strip
    // already carries it — there is no second page to read one off.
    forfait: null,
    notice: placed ? "" : unplacedCarrierNotice(carrier.carrier),
  };
}

/**
 * Why the last attempt at the portal produced no page — the tagged result from
 * `../orange/portal.js` with its one success removed.
 */
export type PortalFailure = Exclude<OrangePortalResult, { state: "read" }>;

/**
 * Where the portal stands, and why its last attempt failed.
 *
 * {@link PortalStatus} says whether the page answered; it does not say why it
 * did not, because the poller republishes it on every settled fetch and the
 * reason belongs to the attempt rather than to the standing. So the reason is
 * carried alongside by whoever made the fetch. Absent means a caller that does
 * not track one — the panel then says the page is out of reach and no more.
 */
export type PortalStanding = PortalStatus & {
  failure?: PortalFailure | undefined;
};

/** Where the portal stands before anything has ever been fetched from it. */
const NO_PORTAL: PortalStanding = { reading: null, live: false };

/** Why an Orange figure is marked, in the words the panel shows. */
const PORTAL_STALE_NOTE =
  "The Orange portal is out of reach — this is the last figure it gave.";

/**
 * The page did not answer at all: a refused connection, or a name that does
 * not resolve. The page only answers on the Orange network, so the remedy is
 * the connection rather than anything about the plan.
 */
const PORTAL_OFFLINE_NOTICE =
  "Orange's page did not answer — connect through the router to read your plan.";

/** The same page, reached but silent. A different fault with the same remedy. */
const PORTAL_TIMEOUT_NOTICE =
  "Orange's page did not answer in time — connect through the router and it will be read again shortly.";

/**
 * Something answered `200` and it was not the subscriber's page.
 *
 * Kept apart from every "no plan" wording on purpose. A captive-portal
 * middlebox sits in front of this page and is exactly the kind of thing that
 * hands back someone else's `200`, which parses to no forfait at all — and
 * reporting that as an expired plan would state something false about the
 * account.
 */
const PORTAL_UNREADABLE_NOTICE =
  "Orange's page answered with something we could not read — the page has changed, or a middlebox replied for it.";

/** The remedy both unreachable wordings end on, and the one an HTTP code needs. */
function portalHttpNotice(status: number): string {
  return `Orange's page answered HTTP ${String(status)} — connect through the router to read your plan.`;
}

/** One failed attempt, in the words the panel shows. */
function portalFailureNotice(failure: PortalFailure): string {
  if (failure.state === "unreadable") {
    return PORTAL_UNREADABLE_NOTICE;
  }
  if (failure.reason === "http") {
    return portalHttpNotice(failure.status);
  }

  return failure.reason === "timeout"
    ? PORTAL_TIMEOUT_NOTICE
    : PORTAL_OFFLINE_NOTICE;
}

/**
 * The page parsed, and none of what it listed is an Internet plan.
 *
 * The count is named because it is the one thing that separates this from a
 * page that could not be read at all: forfaits were found and they were the
 * wrong kind. Zero is the honest count when the page held nothing but voice,
 * SMS or credit bundles — `selectForfait` never carries those forward — and it
 * reads as an absence rather than as a figure.
 */
function noDataForfaitNotice(found: number): string {
  const cause = "the plan may have expired, or the line may be voice-only";

  if (found === 0) {
    return `Orange's page listed no Internet plan — ${cause}.`;
  }

  return `Orange's page listed ${String(found)} plan${found === 1 ? "" : "s"} and none of them is an Internet plan — ${cause}.`;
}

/**
 * The SIM is on a network no table covers.
 *
 * The name is carried to the surface exactly as the router spelled it, for the
 * reason an unrecognised router error code keeps its number: it is the one
 * thing the user cannot work out for themselves and the only thing that makes
 * the gap reportable.
 */
function unplacedCarrierNotice(fullName: string): string {
  const name = fullName.trim();

  if (name === "") {
    return "The router named no network, and no allowance source is known without one.";
  }

  return `The router reports ${name} — no allowance source is known for that network.`;
}

/**
 * Why there is no figure from the portal, or empty while there is one.
 *
 * The reason is read before the standing, and only where the page did not
 * answer: a stale reason surviving a successful fetch would report a fault
 * that has already cleared. Where nothing has failed and nothing has been read
 * there is nothing to say — the dial's own prompt already says the page has
 * not answered yet, and a second line claiming a failure would be a claim
 * about a fetch nobody made.
 */
function portalNotice(portal: PortalStanding): string {
  const { reading, live, failure } = portal;

  if (!live) {
    if (failure !== undefined) {
      return portalFailureNotice(failure);
    }

    return reading === null ? "" : PORTAL_OFFLINE_NOTICE;
  }

  return reading !== null && reading.forfait === null
    ? noDataForfaitNotice(reading.candidates.length)
    : "";
}

/**
 * The dial on Orange. The share comes from the portal's consumed volume against
 * the typed cap, and there is no anchor anywhere in it: the portal states
 * consumption outright on every fetch, so nothing is carried forward and
 * nothing can go untrustworthy.
 */
function buildMonthlyDial(
  reading: MonthlyPaceReading | null,
  warnThresholdPercent: number,
): PopoverProgress {
  const usedShare = reading?.usedShare ?? null;
  const percent = usedShare === null ? null : usedShare * 100;
  const state = usageState(percent, warnThresholdPercent);

  if (percent === null || reading === null) {
    return {
      available: false,
      label: NO_VALUE,
      sweep: 0,
      // Two absences, and they call for different things: a page that has not
      // answered will answer by itself, whereas a missing cap will not.
      prompt:
        reading === null
          ? "Waiting for the Orange portal to answer."
          : SET_LIMIT_PROMPT,
      description:
        reading === null
          ? "No reading from the Orange portal yet"
          : NO_LIMIT_DESCRIPTION,
      state,
    };
  }

  const used = formatBytes(reading.usedBytes);

  return {
    available: true,
    label: formatPercent(percent),
    sweep: Math.min(Math.max(percent, 0), 100) / 100,
    prompt: "",
    description: `${formatPercent(percent)} of the plan used, ${used} so far`,
    state,
  };
}

/**
 * The allowance row on Orange.
 *
 * `stale` is the portal's own reachability and nothing else — never the
 * router's. A laptop on some other Wi-Fi cannot reach the page while the
 * connection it is measuring is perfectly healthy, and the panel has to be able
 * to say exactly that.
 */
function buildPortalAllowance(
  forfait: OrangeForfait,
  reading: MonthlyPaceReading,
  portal: PortalStatus,
  now: Date,
): PopoverAllowance {
  const at = portal.reading?.at;

  return {
    available: true,
    planLabel: forfait.label === "" ? NO_VALUE : forfait.label,
    remaining:
      reading.remainingBytes === null
        ? NO_VALUE
        : formatBytes(reading.remainingBytes),
    // The page carries neither for this plan, and inventing one from the
    // calendar would be stating a carrier fact the carrier never stated.
    expires: NO_VALUE,
    daysUntilExpiry: NO_VALUE,
    stale: !portal.live,
    note: portal.live ? "" : PORTAL_STALE_NOTE,
    exhausted: reading.remainingBytes === 0,
    // Read, not synced: nothing was dialled and nothing was anchored.
    syncedAgo:
      at === undefined
        ? NO_VALUE
        : `Read ${formatDuration(
            (now.getTime() - at.getTime()) / MILLISECONDS_PER_SECOND,
          )} ago`,
  };
}

/**
 * The pace on Orange, or null with no cap.
 *
 * The tiers collapse here. Tier 1 existed because a carrier-stated remaining
 * and expiry arrived together, and the portal supplies neither; the calendar
 * supplies the period for free. So the cap is the single gate — with it the
 * whole reading, without it no meter, no per-day figure and therefore no row.
 */
function buildMonthlyPace(reading: MonthlyPaceReading): PopoverPace | null {
  const meter = buildPaceMeter(reading);

  if (meter === null) return null;

  return {
    tier: 3,
    // The prescription needs a date to run to, and the portal states none.
    sustainable: "",
    state: reading.state ?? "",
    hint: "",
    meter,
  };
}

/** The Orange half: one portal figure, measured against the calendar month. */
function portalHalf(
  portal: PortalStanding,
  cap: number | null,
  warnThresholdPercent: number,
  clock: Clock,
  now: Date,
): AllowanceHalf {
  const read = portal.reading;
  const forfait = read?.forfait ?? null;
  const consumedBytes = forfait?.consumedBytes ?? null;
  const notice = portalNotice(portal);
  // Built from the whole reading rather than from the measured figure: a page
  // that listed several plans is worth saying so about even when none of them
  // carried a volume the dial could use. The offer stands down wherever a
  // notice does, which is the same row of the panel and the same 48px.
  const chosen =
    read === null || read === undefined
      ? null
      : buildForfait(read, notice === "");

  // Nothing has been read, or the page listed no data forfait at all: the panel
  // shows the router's figures and says the allowance is not known yet.
  if (forfait === null || consumedBytes === null) {
    return {
      monthTotal: NO_VALUE,
      progress: buildMonthlyDial(null, warnThresholdPercent),
      allowance: noAllowance(),
      pace: null,
      syncAttention: false,
      controls: PORTAL_CONTROLS,
      forfait: chosen,
      notice,
    };
  }

  const reading = readMonthlyPace({
    consumedBytes,
    planLimitBytes: cap,
    clock,
  });

  return {
    // Stated by the carrier rather than derived, and available with no cap —
    // which is the one thing Orange can always answer.
    monthTotal: formatBytes(reading.usedBytes),
    progress: buildMonthlyDial(reading, warnThresholdPercent),
    allowance: buildPortalAllowance(forfait, reading, portal, now),
    pace: buildMonthlyPace(reading),
    // There is no dialogue to press for and no anchor to re-take: the Sync
    // button has no work on Orange, and `controls` takes it off the panel.
    syncAttention: false,
    controls: PORTAL_CONTROLS,
    forfait: chosen,
    notice,
  };
}

/**
 * The popover's contents for one poll result.
 *
 * A live result renders itself. An offline result — or no result at all yet —
 * renders the last successful reading, flagged stale and stamped with its age,
 * because a router that is not answering has not changed how much data was used
 * before it stopped answering. The offline *reason* never reaches the renderer:
 * unreachable is a normal state, not an error to report.
 */
export function buildPopoverModel(input: PopoverInput): PopoverModel {
  const { result, lastReading, config } = input;
  const clock = input.clock ?? systemClock;
  const now = clock.now();
  const syncState = input.sync ?? { phase: "idle" };
  const live = result !== null && result.online;
  const snapshot = live ? result.snapshot : lastReading?.snapshot;
  const freshness = buildFreshness(!live, lastReading, now);
  const history = buildHistory(input.history ?? []);
  // Independent of the router: the cap is typed in, so the field is on the
  // panel even before the first reading arrives.
  const planLimit = buildPlanLimit(
    config.planLimitBytes,
    input.planLimitProblem,
  );
  const planDays = buildPlanDays(config.planDays, input.planDaysProblem);
  // One flag drives all three of the panel's responses — the confirmation, the
  // dial's wording, and which cap the arithmetic may use. Only an explicit
  // `false` withdraws the cap, the same test {@link confirmedPlanLimit} makes.
  const capUnconfirmed = config.planCapConfirmed === false;
  const planCapPrompt = buildPlanCapPrompt(capUnconfirmed);
  // The cap the panel may actually measure against. A sync that brought back a
  // different plan leaves the stored one unbelievable, and an unbelievable cap
  // reads as no cap: the dial and the share go, the tier 1 pace stays.
  const cap = confirmedPlanLimit(config);

  if (snapshot === undefined) {
    return emptyModel(
      freshness,
      config.warnThresholdPercent,
      history,
      // Nothing has been read, so nothing can be stale: no attention to call.
      buildSync(syncState, false),
      planLimit,
      planDays,
      // No snapshot means no router counter to carry the anchor forward with,
      // and the pace is measured on what is left *now*.
      null,
      planCapPrompt,
    );
  }

  const { month, traffic, status, carrier } = snapshot;
  // The one branch in the file, and it is a fact about the SIM rather than a
  // display decision: on Orange the figure comes from a page fetched on the
  // poll, and everywhere else from the anchor a dialogue left behind.
  const half =
    carrier.id === "orange"
      ? portalHalf(
          input.portal ?? NO_PORTAL,
          cap,
          config.warnThresholdPercent,
          clock,
          now,
        )
      : anchoredHalf(config, month, carrier, cap, capUnconfirmed, clock, now);

  return {
    monthTotal: half.monthTotal,
    progress: half.progress,
    downloadRate: formatRate(traffic.downloadRateBps),
    uploadRate: formatRate(traffic.uploadRateBps),
    connectedDevices: String(status.connectedDevices),
    carrier: formatCarrier(carrier.carrier),
    signalBars: status.signalBars,
    maxSignalBars: status.maxSignalBars,
    signalDescription: signalDescription(
      status.signalBars,
      status.maxSignalBars,
    ),
    networkType: networkTypeLabel(status.networkTypeCode),
    freshness,
    history,
    allowance: half.allowance,
    planLimit,
    planDays,
    planCapPrompt,
    pace: half.pace,
    sync: buildSync(syncState, half.syncAttention),
    controls: half.controls,
    forfait: half.forfait,
    notice: half.notice,
  };
}
