/**
 * The last few minutes of throughput, so the popover can draw a sparkline.
 *
 * The router only ever reports an instantaneous rate — it remembers nothing —
 * so the shape of the last few minutes has to be kept here. Pure: no I/O, no
 * Electron, no network, and "now" arrives through an injected {@link Clock}.
 *
 * This is a fixed-size in-memory ring, never written to disk. The project's
 * "no history database" decision still holds: nothing outlives the process,
 * and nothing is remembered beyond the width of the panel's own chart.
 */

import { systemClock, type Clock } from "./quota.js";

/**
 * Samples kept by default. At the active poll interval of two seconds that is
 * about three minutes of history — as far back as the sparkline reaches.
 */
export const DEFAULT_RATE_HISTORY_CAPACITY = 90;

/** The throughput one poll observed. Both rates are bytes per second. */
export interface RateReading {
  downloadBytesPerSecond: number;
  uploadBytesPerSecond: number;
}

/** One recorded reading, stamped with the moment it was taken. */
export interface RateSample extends RateReading {
  at: Date;
}

export interface RateHistory {
  /** How many samples are kept before the oldest starts falling off. */
  readonly capacity: number;
  /**
   * Records one poll. `null` — an offline poll — records nothing: the router
   * did not say the throughput was zero, it said nothing at all, and a gap
   * drawn as a zero would read as an idle connection.
   */
  record(reading: RateReading | null): void;
  /** The samples kept, oldest first, so a chart reads left to right. */
  samples(): RateSample[];
}

function sizeOf(capacity: number): number {
  if (!Number.isFinite(capacity) || capacity < 1) {
    return DEFAULT_RATE_HISTORY_CAPACITY;
  }

  return Math.floor(capacity);
}

/**
 * A ring of the most recent samples. Once full, recording one more drops the
 * oldest — the window slides rather than growing without bound.
 */
export function createRateHistory(
  capacity: number = DEFAULT_RATE_HISTORY_CAPACITY,
  clock: Clock = systemClock,
): RateHistory {
  const size = sizeOf(capacity);
  const kept: RateSample[] = [];

  return {
    capacity: size,
    record(reading: RateReading | null): void {
      if (reading === null) {
        return;
      }

      kept.push({ ...reading, at: clock.now() });

      if (kept.length > size) {
        kept.shift();
      }
    },
    // A copy: the history is the only thing that may change the history.
    samples: () => [...kept],
  };
}

/**
 * The largest rate across both series — the scale a download and an upload
 * sparkline share, so the two can be compared by eye.
 *
 * An empty history peaks at 0, which callers read as "nothing to draw" rather
 * than as a chart scale.
 */
export function peak(samples: readonly RateSample[]): number {
  return samples.reduce(
    (largest, sample) =>
      Math.max(
        largest,
        sample.downloadBytesPerSecond,
        sample.uploadBytesPerSecond,
      ),
    0,
  );
}
