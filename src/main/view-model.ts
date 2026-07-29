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
import { readPace } from "../domain/pace.js";
import type { PaceReading, PaceState } from "../domain/pace.js";
import {
  systemClock,
  usageState,
  type Clock,
  type UsageState,
} from "../domain/quota.js";
import { isRouterRefusal } from "../hilink/ussd.js";
import {
  planLimitInGigaoctets,
  type PlanDaysRefusal,
  type PlanLimitRefusal,
} from "../config/config.js";
import type { SyncFailure, SyncState, SyncStep } from "./sync.js";
import type { AppConfig } from "../config/defaults.js";
import type { RouterRefusal, SnapshotResult } from "../hilink/client.js";
import type { RouterSnapshot } from "../hilink/types.js";

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
 * The pace row, in whatever detail the stored figures allow.
 *
 * Every field is a finished string, empty when its tier has not been reached —
 * so the renderer shows what is there and hides what is not, and never decides
 * which tier it is looking at by inspecting the arithmetic.
 */
export interface PopoverPace {
  /** How much of the reading is available: 1 the anchor, 2 the cap, 3 the length. */
  tier: number;
  /** Always present: `"3.00 Go a day until 06/08/2026"`. */
  sustainable: string;
  /** Tier 2 and up: `"80% of the plan used"`. Empty below it. */
  consumed: string;
  /** Tier 3: `"5.00 Go a day budgeted"`. Empty below it. */
  afforded: string;
  /** Tier 3: the band as a word — the coloured one. Empty below it. */
  band: string;
  /** Tier 3: `safe`, `warning` or `over`, for the stylesheet. Empty below it. */
  state: string;
  /** Tier 3: which way it is going, as a sentence. Empty below it. */
  note: string;
  /**
   * Tiers 1 and 2: which setting would sharpen this, so the reason the band is
   * missing sits next to its absence. Empty at tier 3, where nothing is.
   */
  hint: string;
}

/** Everything the popover displays, already spelled the way it appears on screen. */
export interface PopoverModel {
  monthDownload: string;
  monthUpload: string;
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
   * The pace under the dial, or null when there is nothing honest to say — a
   * rate over a period nobody stated is the same lie the dial refuses to draw
   * before a sync.
   */
  pace: PopoverPace | null;
  /** The Sync button's state, and whatever the last press has to say. */
  sync: PopoverSync;
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

/**
 * Why there is no dial, in the words the panel shows. Each case names the one
 * thing the user can do about it — an "unavailable" ring with no instruction is
 * just a hole in the panel.
 */
function dialPrompt(
  allowance: AllowanceReading | null,
  limitBytes: number | null,
): string {
  if (allowance === null) {
    return "Sync to read how much of your plan is left.";
  }
  if (limitBytes === null) {
    return "Set a plan limit to see how much of it is left.";
  }

  return "That figure is out of date — sync to refresh the dial.";
}

/** The same three cases, for a screen reader. */
function dialDescription(
  allowance: AllowanceReading | null,
  limitBytes: number | null,
): string {
  if (allowance === null) {
    return "No allowance synced from the carrier yet";
  }
  if (limitBytes === null) {
    return "No plan limit set, so the share used is unknown";
  }

  return "The last synced figure can no longer be trusted";
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
      reading.expiresAt === null ? NO_VALUE : formatDate(reading.expiresAt),
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

/** What each band means, in the one sentence that says which way it is going. */
const PACE_NOTE_TEXT: Record<PaceState, string> = {
  safe: "Less spent than the month has run — a quiet week keeps it there.",
  warning: "Slightly ahead of the calendar. A lighter week pulls it back.",
  over: "Well ahead of the calendar — at this rate the plan runs out early.",
};

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

  const { state } = reading;

  return {
    tier: reading.tier,
    sustainable: `${formatBytes(reading.sustainablePerDay)} a day until ${formatDate(expiresAt)}`,
    consumed:
      reading.usedShare === null
        ? ""
        : `${formatPercent(reading.usedShare * 100)} of the plan used`,
    afforded:
      reading.affordedPerDay === null
        ? ""
        : `${formatBytes(reading.affordedPerDay)} a day budgeted`,
    band: state === null ? "" : PACE_BAND_TEXT[state],
    state: state ?? "",
    note: state === null ? "" : PACE_NOTE_TEXT[state],
    hint: PACE_HINT_TEXT[reading.tier] ?? "",
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
): PopoverModel {
  return {
    monthDownload: NO_VALUE,
    monthUpload: NO_VALUE,
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
    pace,
    sync,
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
): PopoverProgress {
  const percent = allowance?.percentUsed ?? null;
  const state = usageState(percent, warnThresholdPercent);

  if (percent === null) {
    return {
      available: false,
      label: NO_VALUE,
      sweep: 0,
      prompt: dialPrompt(allowance, limitBytes),
      description: dialDescription(allowance, limitBytes),
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
    );
  }

  const { month, traffic, status, carrier } = snapshot;
  // The same derivation the menu bar reads, so the two cannot disagree.
  const allowance = readPlanUsage(
    config.allowanceAnchor,
    month,
    config.planLimitBytes,
    clock,
  );

  return {
    // Download and upload stay the router's own counters: they are the evidence
    // behind the delta, and the user can see them move. The total is the plan
    // figure — a different month from the two lines above it, and the only one
    // the carrier stands behind.
    monthDownload: formatBytes(month.monthDownloadBytes),
    monthUpload: formatBytes(month.monthUploadBytes),
    monthTotal:
      allowance?.usedBytes === undefined || allowance.usedBytes === null
        ? NO_VALUE
        : formatBytes(allowance.usedBytes),
    progress: buildDial(
      allowance,
      config.planLimitBytes,
      config.warnThresholdPercent,
    ),
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
    allowance: buildAllowance(allowance, now),
    planLimit,
    planDays,
    pace: buildPace(
      readPace({
        anchor: config.allowanceAnchor,
        month,
        planLimitBytes: config.planLimitBytes,
        planDays: config.planDays,
        clock,
      }),
      allowance?.expiresAt ?? null,
    ),
    // An anchor that can no longer carry the arithmetic is the one thing the
    // button has to call out: the figure on screen is the last honest one.
    sync: buildSync(syncState, allowance !== null && !allowance.trustworthy),
  };
}
