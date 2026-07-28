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
 * The progress bar, or the reason there is not one.
 *
 * The `state` field is how close the user is to the plan limit, decided in
 * `../domain/quota.js` against the exact percentage. The renderer does not
 * compare it to anything — it puts it on the root element and lets the
 * stylesheet colour the bar.
 */
export interface PopoverProgress {
  /** False when no plan limit is configured — there is no bar to draw. */
  available: boolean;
  /** `"29%"`, or a dash when there is no limit to measure against. */
  label: string;
  /** CSS width for the filled part, e.g. `"29.2%"`. Capped at `"100.0%"`. */
  fillWidth: string;
  /** What to tell the user instead of a bar. Empty when the bar is available. */
  prompt: string;
  /** How the bar should read: `"ok"`, `"warn"`, `"over"`, or `"unknown"`. */
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

/** Everything the popover displays, already spelled the way it appears on screen. */
export interface PopoverModel {
  monthDownload: string;
  monthUpload: string;
  monthTotal: string;
  progress: PopoverProgress;
  /** Live throughput, e.g. `"2.4 KB/s"`. */
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

  if (percent === null) {
    return {
      available: false,
      label: NO_VALUE,
      fillWidth: "0%",
      prompt:
        usedBytes === null
          ? "Waiting for the first reading from the router."
          : "Set a plan limit to see how much of it is left.",
      state,
    };
  }

  return {
    available: true,
    // The label carries the real share — going over the plan is the one thing
    // the user must not be shielded from — while the bar stops at full.
    label: formatPercent(percent),
    fillWidth: `${Math.min(Math.max(percent, 0), 100).toFixed(1)}%`,
    prompt: "",
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
  const live = result !== null && result.online;
  const snapshot = live ? result.snapshot : lastReading?.snapshot;
  const freshness = buildFreshness(!live, lastReading, clock.now());
  const history = buildHistory(input.history ?? []);

  if (snapshot === undefined) {
    return emptyModel(freshness, config.warnThresholdPercent, history);
  }

  const { month, traffic, status, carrier, billing } = snapshot;
  const used = totalUsedBytes(month.monthDownloadBytes, month.monthUploadBytes);

  return {
    monthDownload: formatBytes(month.monthDownloadBytes),
    monthUpload: formatBytes(month.monthUploadBytes),
    monthTotal: formatBytes(used),
    progress: buildProgress(
      used,
      config.planLimitBytes,
      config.warnThresholdPercent,
    ),
    downloadRate: formatRate(traffic.downloadRateBps),
    uploadRate: formatRate(traffic.uploadRateBps),
    connectedDevices: String(status.connectedDevices),
    carrier: formatCarrier(carrier.carrier),
    signal: `${status.signalBars}/${status.maxSignalBars}`,
    daysUntilReset: formatDays(daysUntilReset(billing.startDay, clock)),
    freshness,
    history,
  };
}
