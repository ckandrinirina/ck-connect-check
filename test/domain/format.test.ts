import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  formatDuration,
  formatPercent,
  formatRate,
} from '../../src/domain/format.js';

describe('formatBytes', () => {
  it('renders 4427475340 as decimal GB', () => {
    expect(formatBytes(4_427_475_340)).toBe('4.43 GB');
  });

  it('renders 1024 as decimal kB, not 1 KiB', () => {
    expect(formatBytes(1024)).toBe('1.02 kB');
  });

  it('renders whole bytes below a kilobyte', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('steps up at every decimal boundary', () => {
    expect(formatBytes(1_000)).toBe('1.00 kB');
    expect(formatBytes(1_000_000)).toBe('1.00 MB');
    expect(formatBytes(1_000_000_000)).toBe('1.00 GB');
    expect(formatBytes(1_000_000_000_000)).toBe('1.00 TB');
  });
});

describe('formatRate', () => {
  it('renders 2300 bytes per second as "2.3 KB/s"', () => {
    expect(formatRate(2300)).toBe('2.3 KB/s');
  });

  it('renders a zero rate as "0 B/s"', () => {
    expect(formatRate(0)).toBe('0 B/s');
  });

  it('renders sub-kilobyte rates in whole bytes', () => {
    expect(formatRate(512)).toBe('512 B/s');
  });

  it('steps up to MB/s', () => {
    expect(formatRate(2_400_000)).toBe('2.4 MB/s');
  });
});

describe('formatDuration', () => {
  it('renders 28008 seconds as "7h 46m"', () => {
    expect(formatDuration(28_008)).toBe('7h 46m');
  });

  it('drops the hour component below an hour', () => {
    expect(formatDuration(2_808)).toBe('46m');
  });

  it('renders seconds below a minute', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45)).toBe('45s');
  });

  it('keeps a zero minute component alongside hours', () => {
    expect(formatDuration(3_600)).toBe('1h 0m');
  });
});

describe('formatPercent', () => {
  it('rounds the exact percentage for display', () => {
    expect(formatPercent(29.153591935)).toBe('29%');
  });

  it('shows a value above 100 unclamped', () => {
    expect(formatPercent(125)).toBe('125%');
  });

  it('renders a dash when no plan limit is configured', () => {
    expect(formatPercent(null)).toBe('—');
  });
});
