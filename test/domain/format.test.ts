import { describe, expect, it } from "vitest";

import {
  formatBytes,
  formatDuration,
  formatPercent,
  formatRate,
} from "../../src/domain/format.js";

describe("formatBytes", () => {
  it("renders 4427475340 as decimal Go", () => {
    expect(formatBytes(4_427_475_340)).toBe("4.43 Go");
  });

  it("renders 1024 as decimal Ko, not 1 Kio", () => {
    expect(formatBytes(1024)).toBe("1.02 Ko");
  });

  it("renders whole octets below a kilo-octet", () => {
    expect(formatBytes(0)).toBe("0 o");
    expect(formatBytes(512)).toBe("512 o");
    expect(formatBytes(999)).toBe("999 o");
  });

  it("steps up at every decimal boundary", () => {
    expect(formatBytes(1_000)).toBe("1.00 Ko");
    expect(formatBytes(1_000_000)).toBe("1.00 Mo");
    expect(formatBytes(1_000_000_000)).toBe("1.00 Go");
    expect(formatBytes(1_000_000_000_000)).toBe("1.00 To");
  });

  it("stops scaling at To rather than inventing a wider unit", () => {
    expect(formatBytes(1_500_000_000_000)).toBe("1.50 To");
    expect(formatBytes(9_000_000_000_000_000)).toBe("9000.00 To");
  });

  it("renders a dash for a non-finite byte count", () => {
    expect(formatBytes(Number.NaN)).toBe("—");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("—");
  });
});

describe("formatRate", () => {
  it('renders 2400 octets per second as "2.4 Ko/s"', () => {
    expect(formatRate(2400)).toBe("2.4 Ko/s");
  });

  it('renders a zero rate as "0 o/s"', () => {
    expect(formatRate(0)).toBe("0 o/s");
  });

  it("renders sub-kilo-octet rates in whole octets", () => {
    expect(formatRate(512)).toBe("512 o/s");
  });

  it("steps up to Mo/s and Go/s", () => {
    expect(formatRate(2_400_000)).toBe("2.4 Mo/s");
    expect(formatRate(2_400_000_000)).toBe("2.4 Go/s");
  });

  it("renders a dash for a non-finite rate", () => {
    expect(formatRate(Number.NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it('renders 28008 seconds as "7h 46m"', () => {
    expect(formatDuration(28_008)).toBe("7h 46m");
  });

  it("drops the hour component below an hour", () => {
    expect(formatDuration(2_808)).toBe("46m");
  });

  it("renders seconds below a minute", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
  });

  it("keeps a zero minute component alongside hours", () => {
    expect(formatDuration(3_600)).toBe("1h 0m");
  });
});

describe("formatPercent", () => {
  it("rounds the exact percentage for display", () => {
    expect(formatPercent(29.153591935)).toBe("29%");
  });

  it("shows a value above 100 unclamped", () => {
    expect(formatPercent(125)).toBe("125%");
  });

  it("renders a dash when no plan limit is configured", () => {
    expect(formatPercent(null)).toBe("—");
  });
});
