import { describe, expect, it } from "vitest";

import {
  DEFAULT_RATE_HISTORY_CAPACITY,
  createRateHistory,
  peak,
  type RateSample,
} from "../../src/domain/history.js";
import type { Clock } from "../../src/domain/quota.js";

/** A clock that hands out a fresh instant per call, so samples are ordered in time. */
function tickingClock(startMs = 1_700_000_000_000, stepMs = 2_000): Clock {
  let current = startMs - stepMs;

  return {
    now: () => {
      current += stepMs;

      return new Date(current);
    },
  };
}

const FROZEN: Clock = { now: () => new Date(2026, 6, 27, 17, 46, 0) };

describe("createRateHistory", () => {
  it("keeps every sample while it is below capacity, oldest first", () => {
    const history = createRateHistory(4, tickingClock());

    history.record({ downloadBytesPerSecond: 1, uploadBytesPerSecond: 10 });
    history.record({ downloadBytesPerSecond: 2, uploadBytesPerSecond: 20 });

    expect(
      history.samples().map((sample) => sample.downloadBytesPerSecond),
    ).toEqual([1, 2]);
  });

  it("keeps at most `capacity` samples", () => {
    const history = createRateHistory(3, tickingClock());

    for (let index = 0; index < 10; index += 1) {
      history.record({
        downloadBytesPerSecond: index,
        uploadBytesPerSecond: 0,
      });
    }

    expect(history.samples()).toHaveLength(3);
  });

  it("drops the oldest sample first once it is full", () => {
    const history = createRateHistory(3, tickingClock());

    for (const rate of [1, 2, 3, 4, 5]) {
      history.record({
        downloadBytesPerSecond: rate,
        uploadBytesPerSecond: rate * 2,
      });
    }

    expect(
      history.samples().map((sample) => sample.downloadBytesPerSecond),
    ).toEqual([3, 4, 5]);
  });

  it("returns the samples oldest first, so a chart reads left to right", () => {
    const history = createRateHistory(5, tickingClock());

    history.record({ downloadBytesPerSecond: 1, uploadBytesPerSecond: 0 });
    history.record({ downloadBytesPerSecond: 2, uploadBytesPerSecond: 0 });
    history.record({ downloadBytesPerSecond: 3, uploadBytesPerSecond: 0 });

    const times = history.samples().map((sample) => sample.at.getTime());

    expect(times).toEqual([...times].sort((left, right) => left - right));
  });

  it("stamps each sample with both rates and the time it was taken", () => {
    const history = createRateHistory(5, FROZEN);

    history.record({
      downloadBytesPerSecond: 2_355,
      uploadBytesPerSecond: 471,
    });

    const [sample] = history.samples();

    expect(sample.downloadBytesPerSecond).toBe(2_355);
    expect(sample.uploadBytesPerSecond).toBe(471);
    expect(sample.at.getTime()).toBe(FROZEN.now().getTime());
  });

  it("takes the time from the injected clock, never from the wall clock", () => {
    const history = createRateHistory(5, FROZEN);

    history.record({ downloadBytesPerSecond: 0, uploadBytesPerSecond: 0 });

    expect(history.samples()[0].at.getFullYear()).toBe(2026);
  });

  it("records nothing for an offline poll — a gap is not a zero", () => {
    const history = createRateHistory(5, tickingClock());

    history.record({
      downloadBytesPerSecond: 1_000,
      uploadBytesPerSecond: 500,
    });
    history.record(null);
    history.record(null);
    history.record({
      downloadBytesPerSecond: 2_000,
      uploadBytesPerSecond: 800,
    });

    expect(
      history.samples().map((sample) => sample.downloadBytesPerSecond),
    ).toEqual([1_000, 2_000]);
  });

  it("is empty before anything has been recorded", () => {
    expect(createRateHistory(5, FROZEN).samples()).toEqual([]);
  });

  it("hands out a copy, so a reader cannot rewrite the history", () => {
    const history = createRateHistory(5, tickingClock());

    history.record({ downloadBytesPerSecond: 7, uploadBytesPerSecond: 0 });
    history.samples().push({
      downloadBytesPerSecond: 999,
      uploadBytesPerSecond: 999,
      at: new Date(),
    });

    expect(history.samples()).toHaveLength(1);
  });

  it("holds about three minutes of two-second polls by default", () => {
    expect(DEFAULT_RATE_HISTORY_CAPACITY).toBe(90);
    expect(createRateHistory().capacity).toBe(DEFAULT_RATE_HISTORY_CAPACITY);
  });

  it("falls back to the default capacity when asked for a nonsensical one", () => {
    expect(createRateHistory(0).capacity).toBe(DEFAULT_RATE_HISTORY_CAPACITY);
    expect(createRateHistory(Number.NaN).capacity).toBe(
      DEFAULT_RATE_HISTORY_CAPACITY,
    );
  });
});

describe("peak", () => {
  function sample(download: number, upload: number): RateSample {
    return {
      downloadBytesPerSecond: download,
      uploadBytesPerSecond: upload,
      at: new Date(2026, 6, 27),
    };
  }

  it("is the largest rate across both series", () => {
    expect(peak([sample(100, 20), sample(80, 40), sample(60, 10)])).toBe(100);
  });

  it("looks at uploads too, not only downloads", () => {
    expect(peak([sample(100, 20), sample(80, 4_000)])).toBe(4_000);
  });

  it("is 0 for an empty history", () => {
    expect(peak([])).toBe(0);
  });

  it("is 0 when nothing has moved, rather than a negative scale", () => {
    expect(peak([sample(0, 0), sample(0, 0)])).toBe(0);
  });
});
