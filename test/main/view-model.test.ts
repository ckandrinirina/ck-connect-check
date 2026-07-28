import { describe, expect, it } from 'vitest';

import { defaultConfig, type AppConfig } from '../../src/config/defaults.js';
import type { Clock } from '../../src/domain/quota.js';
import type { SnapshotResult } from '../../src/hilink/client.js';
import type { RouterSnapshot } from '../../src/hilink/types.js';
import { buildPopoverModel, type PopoverModel, type UsageReading } from '../../src/main/view-model.js';

/** The recorded live reading from T-02: 4.43 GB down, 1.40 GB up. */
const DOWNLOAD_BYTES = 4_427_475_340;
const UPLOAD_BYTES = 1_403_243_047;

/** 27 July 2026, 17:46 local — five days before a `startDay` of 1. */
const NOW = new Date(2026, 6, 27, 17, 46, 0);

/** 7h 46m before {@link NOW}. */
const SEVEN_HOURS_AGO = new Date(2026, 6, 27, 10, 0, 0);

const clock: Clock = { now: () => NOW };

function snapshot(overrides: Partial<RouterSnapshot> = {}): RouterSnapshot {
  return {
    month: {
      monthDownloadBytes: DOWNLOAD_BYTES,
      monthUploadBytes: UPLOAD_BYTES,
      monthDurationSeconds: 27_960,
      monthLastClearTime: '2026-7-27',
    },
    traffic: { downloadRateBps: 2_355, uploadRateBps: 0, connectTimeSeconds: 27_960 },
    status: { connected: true, signalBars: 4, maxSignalBars: 5, connectedDevices: 3 },
    carrier: { carrier: 'Yas' },
    billing: { startDay: 1, routerDataLimitBytes: 0, warnThresholdPercent: 90 },
    ...overrides,
  };
}

function online(override: Partial<RouterSnapshot> = {}): SnapshotResult {
  return { online: true, snapshot: snapshot(override) };
}

const OFFLINE: SnapshotResult = { online: false, reason: 'unreachable' };

function configWithLimit(limitBytes: number | null): AppConfig {
  return { ...defaultConfig(), planLimitBytes: limitBytes };
}

/** Every leaf of the model, so "no arithmetic in the renderer" can be asserted wholesale. */
function leaves(value: unknown): unknown[] {
  if (typeof value !== 'object' || value === null) {
    return [value];
  }
  return Object.values(value).flatMap((entry) => leaves(entry));
}

describe('buildPopoverModel — a live reading', () => {
  const model: PopoverModel = buildPopoverModel({
    result: online(),
    lastReading: { snapshot: snapshot(), at: NOW },
    config: configWithLimit(20_000_000_000),
    clock,
  });

  it('exposes the month download and upload totals', () => {
    expect(model.monthDownload).toBe('4.43 GB');
    expect(model.monthUpload).toBe('1.40 GB');
    expect(model.monthTotal).toBe('5.83 GB');
  });

  it('exposes the share of the plan used', () => {
    expect(model.progress.available).toBe(true);
    expect(model.progress.label).toBe('29%');
  });

  it('exposes the live download and upload rates', () => {
    expect(model.downloadRate).toBe('2.4 KB/s');
    expect(model.uploadRate).toBe('0 B/s');
  });

  it('exposes the connected device count, carrier and signal bars', () => {
    expect(model.connectedDevices).toBe('3');
    expect(model.carrier).toBe('Yas');
    expect(model.signal).toBe('4/5');
  });

  it('exposes the days until the billing cycle resets', () => {
    expect(model.daysUntilReset).toBe('5 days');
  });

  it('says a single day in the singular', () => {
    const soon = buildPopoverModel({
      result: online({ billing: { startDay: 28, routerDataLimitBytes: 0, warnThresholdPercent: 90 } }),
      lastReading: null,
      config: configWithLimit(20_000_000_000),
      clock,
    });

    expect(soon.daysUntilReset).toBe('1 day');
  });

  it('hands the renderer only display strings — never a number to format', () => {
    for (const leaf of leaves(model)) {
      expect(typeof leaf === 'string' || typeof leaf === 'boolean').toBe(true);
    }
  });

  it('pre-computes the progress bar width as a CSS length', () => {
    expect(model.progress.fillWidth).toBe('29.2%');
  });

  it('caps the bar at full width when the plan is overrun, but still reports the real share', () => {
    const over = buildPopoverModel({
      result: online(),
      lastReading: null,
      config: configWithLimit(5_000_000_000),
      clock,
    });

    expect(over.progress.label).toBe('117%');
    expect(over.progress.fillWidth).toBe('100.0%');
  });

  it('is not flagged stale and carries no age', () => {
    expect(model.freshness.stale).toBe(false);
    expect(model.freshness.age).toBe('—');
    expect(model.freshness.label).toBe('Live');
  });
});

describe('buildPopoverModel — no plan limit configured', () => {
  const model = buildPopoverModel({
    result: online(),
    lastReading: null,
    config: configWithLimit(null),
    clock,
  });

  it('marks the progress bar unavailable rather than reporting 0%', () => {
    expect(model.progress.available).toBe(false);
    expect(model.progress.label).toBe('—');
    expect(model.progress.fillWidth).toBe('0%');
  });

  it('prompts the user to set a limit', () => {
    expect(model.progress.prompt).toMatch(/limit/i);
  });

  it('still reports the usage figures it does know', () => {
    expect(model.monthTotal).toBe('5.83 GB');
    expect(model.carrier).toBe('Yas');
  });
});

describe('buildPopoverModel — the router is unreachable', () => {
  const model = buildPopoverModel({
    result: OFFLINE,
    lastReading: { snapshot: snapshot(), at: SEVEN_HOURS_AGO },
    config: configWithLimit(20_000_000_000),
    clock,
  });

  it('flags the model stale', () => {
    expect(model.freshness.stale).toBe(true);
  });

  it('carries the last successful reading rather than blanking the figures', () => {
    expect(model.monthDownload).toBe('4.43 GB');
    expect(model.monthUpload).toBe('1.40 GB');
    expect(model.progress.label).toBe('29%');
    expect(model.carrier).toBe('Yas');
  });

  it('reports how old that reading is', () => {
    expect(model.freshness.age).toBe('7h 46m');
    expect(model.freshness.label).toContain('7h 46m');
  });

  it('never surfaces the offline reason as an error to the renderer', () => {
    for (const leaf of leaves(model)) {
      expect(leaf).not.toBe('unreachable');
    }
  });
});

describe('buildPopoverModel — nothing has been read yet', () => {
  const model = buildPopoverModel({
    result: null,
    lastReading: null,
    config: configWithLimit(20_000_000_000),
    clock,
  });

  it('is stale with no age to report', () => {
    expect(model.freshness.stale).toBe(true);
    expect(model.freshness.age).toBe('—');
  });

  it('shows dashes instead of inventing zeroes', () => {
    expect(model.monthDownload).toBe('—');
    expect(model.monthTotal).toBe('—');
    expect(model.carrier).toBe('—');
    expect(model.connectedDevices).toBe('—');
    expect(model.daysUntilReset).toBe('—');
  });

  it('leaves the progress bar unavailable', () => {
    expect(model.progress.available).toBe(false);
    expect(model.progress.fillWidth).toBe('0%');
  });
});

describe('UsageReading', () => {
  it('pairs a snapshot with the moment it was taken', () => {
    const reading: UsageReading = { snapshot: snapshot(), at: NOW };

    expect(reading.at).toBe(NOW);
    expect(reading.snapshot.carrier.carrier).toBe('Yas');
  });
});
