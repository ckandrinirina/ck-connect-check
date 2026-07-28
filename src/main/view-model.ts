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

import {
  readAllowanceNow,
  type AllowanceAnchor,
  type AllowanceReading,
} from "../domain/allowance.js";
import {
  formatBytes,
  formatDuration,
  formatPercent,
  formatRate,
} from "../domain/format.js";
import { peak, type RateSample } from "../domain/history.js";
import {
  daysUntilReset,
  percentUsed,
  totalUsedBytes,
  systemClock,
  usageState,
  type Clock,
  type UsageState,
} from "../domain/quota.js";
import type { SyncFailure, SyncState, SyncStep } from "./sync.js";
import type { AppConfig } from "../config/defaults.js";
import type { SnapshotResult } from "../hilink/client.js";
import type { RouterSnapshot } from "../hilink/types.js";

/**
 * Shown wherever there is nothing to show — no reading yet, or no plan limit.
 * Matches the dash `../domain/format.js` returns for an unknown value, so a
 * missing field looks the same however it went missing.
 */
const NO_VALUE = "—";

const MILLISECONDS_PER_SECOND = 1_000;

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
  /** Signal strength out of the router's maximum, e.g. `"4/5"`. */
  signal: string;
  /** Time left in the billing cycle, e.g. `"5 days"`. */
  daysUntilReset: string;
  freshness: PopoverFreshness;
  /** Recent throughput for the sparklines. */
  history: PopoverHistory;
  /** The carrier's exact remaining volume, carried forward from the last sync. */
  allowance: PopoverAllowance;
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

function buildProgress(
  usedBytes: number | null,
  limitBytes: number | null,
  warnThresholdPercent: number,
): PopoverProgress {
  const percent =
    usedBytes === null ? null : percentUsed(usedBytes, limitBytes);
  const state = usageState(percent, warnThresholdPercent);

  const total = usedBytes === null ? NO_VALUE : formatBytes(usedBytes);

  if (percent === null) {
    return {
      available: false,
      label: NO_VALUE,
      sweep: 0,
      prompt:
        usedBytes === null
          ? "Waiting for the first reading from the router."
          : "Set a plan limit to see how much of it is left.",
      description:
        usedBytes === null
          ? "No usage read from the router yet"
          : `${total} used this month, with no plan limit set`,
      state,
    };
  }

  return {
    available: true,
    // The label carries the real share — going over the plan is the one thing
    // the user must not be shielded from — while the ring stops at full.
    label: formatPercent(percent),
    sweep: Math.min(Math.max(percent, 0), 100) / 100,
    prompt: "",
    description: `${formatPercent(percent)} of the plan used, ${total} this month`,
    state,
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
const SYNC_FAILURE_TEXT: Record<SyncFailure, string> = {
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
  if (state.phase === "failed") return SYNC_FAILURE_TEXT[state.reason];

  return "";
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
): PopoverModel {
  return {
    monthDownload: NO_VALUE,
    monthUpload: NO_VALUE,
    monthTotal: NO_VALUE,
    progress: buildProgress(null, null, warnThresholdPercent),
    downloadRate: NO_VALUE,
    uploadRate: NO_VALUE,
    connectedDevices: NO_VALUE,
    carrier: NO_VALUE,
    signal: NO_VALUE,
    daysUntilReset: NO_VALUE,
    freshness,
    history,
    allowance: noAllowance(),
    sync,
  };
}

/**
 * The anchored allowance read against this snapshot's counter, or null when
 * nothing has been synced yet. The anchor lives in the config because it has to
 * survive a quit — the router keeps counting while the app is closed.
 */
function readAnchored(
  anchor: AllowanceAnchor | undefined,
  snapshot: RouterSnapshot,
  planTotalBytes: number | undefined,
  clock: Clock,
): AllowanceReading | null {
  if (anchor === undefined) return null;

  return readAllowanceNow({
    anchor,
    month: snapshot.month,
    planTotalBytes: planTotalBytes ?? null,
    clock,
  });
}

/**
 * The dial, measured against whichever total can be trusted.
 *
 * A trustworthy anchor is the carrier's own arithmetic, so it wins over the
 * limit the user typed in. A stale one falls back to that limit rather than
 * drawing a share it cannot stand behind — the marked volume itself stays in
 * {@link PopoverModel.allowance}, where it is labelled as stale.
 */
function buildDial(
  allowance: AllowanceReading | null,
  monthUsedBytes: number,
  config: AppConfig,
): PopoverProgress {
  if (allowance !== null && allowance.trustworthy) {
    return buildProgress(
      allowance.planTotalBytes - allowance.remainingBytes,
      allowance.planTotalBytes,
      config.warnThresholdPercent,
    );
  }

  return buildProgress(
    monthUsedBytes,
    config.planLimitBytes,
    config.warnThresholdPercent,
  );
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

  if (snapshot === undefined) {
    return emptyModel(
      freshness,
      config.warnThresholdPercent,
      history,
      // Nothing has been read, so nothing can be stale: no attention to call.
      buildSync(syncState, false),
    );
  }

  const { month, traffic, status, carrier, billing } = snapshot;
  const used = totalUsedBytes(month.monthDownloadBytes, month.monthUploadBytes);
  const allowance = readAnchored(
    config.allowanceAnchor,
    snapshot,
    config.planTotalBytes,
    clock,
  );

  return {
    monthDownload: formatBytes(month.monthDownloadBytes),
    monthUpload: formatBytes(month.monthUploadBytes),
    monthTotal: formatBytes(used),
    progress: buildDial(allowance, used, config),
    downloadRate: formatRate(traffic.downloadRateBps),
    uploadRate: formatRate(traffic.uploadRateBps),
    connectedDevices: String(status.connectedDevices),
    carrier: formatCarrier(carrier.carrier),
    signal: `${status.signalBars}/${status.maxSignalBars}`,
    daysUntilReset: formatDays(daysUntilReset(billing.startDay, clock)),
    freshness,
    history,
    allowance: buildAllowance(allowance, now),
    // An anchor that can no longer carry the arithmetic is the one thing the
    // button has to call out: the figure on screen is the last honest one.
    sync: buildSync(syncState, allowance !== null && !allowance.trustworthy),
  };
}
