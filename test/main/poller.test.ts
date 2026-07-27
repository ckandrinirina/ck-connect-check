import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from '../../src/config/defaults.js';
import type { SnapshotResult } from '../../src/hilink/client.js';
import type { RouterSnapshot } from '../../src/hilink/types.js';
import { STARTUP_TRAY_TITLE, UsagePoller } from '../../src/main/poller.js';

const GB = 1_000_000_000;
const POLL_INTERVAL_SECONDS = 30;
const POLL_INTERVAL_MS = POLL_INTERVAL_SECONDS * 1_000;

const CONFIG: AppConfig = {
  host: '192.168.8.1',
  pollIntervalSeconds: POLL_INTERVAL_SECONDS,
  warnThresholdPercent: 90,
  planLimitBytes: 20 * GB,
};

function snapshot(usedBytes: number): RouterSnapshot {
  return {
    month: {
      monthDownloadBytes: usedBytes,
      monthUploadBytes: 0,
      monthDurationSeconds: 27_960,
      monthLastClearTime: '2026-7-27',
    },
    traffic: { downloadRateBps: 0, uploadRateBps: 0, connectTimeSeconds: 27_960 },
    status: { connected: true, signalBars: 4, maxSignalBars: 5, connectedDevices: 3 },
    carrier: { carrier: 'Yas' },
    billing: { startDay: 1, routerDataLimitBytes: 0, warnThresholdPercent: 90 },
  };
}

const USED_5_8_GB: SnapshotResult = { online: true, snapshot: snapshot(5_830_718_387) };
const USED_9_GB: SnapshotResult = { online: true, snapshot: snapshot(9 * GB) };
const OFFLINE: SnapshotResult = { online: false, reason: 'unreachable' };

/** Answers with `results[n]` for poll `n`, repeating the last one thereafter. */
function stubClient(results: SnapshotResult[]) {
  let calls = 0;

  return {
    get calls(): number {
      return calls;
    },
    snapshot(): Promise<SnapshotResult> {
      const result = results[Math.min(calls, results.length - 1)];
      calls += 1;

      return Promise.resolve(result);
    },
  };
}

describe('UsagePoller', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts on a placeholder title before the first reading arrives', () => {
    const poller = new UsagePoller({ client: stubClient([USED_5_8_GB]), config: CONFIG });

    expect(poller.title).toBe(STARTUP_TRAY_TITLE);
    poller.stop();
  });

  it('calls the router once per configured interval and no more', async () => {
    const client = stubClient([USED_5_8_GB]);
    const poller = new UsagePoller({ client, config: CONFIG });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    expect(client.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(client.calls).toBe(2);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);
    expect(client.calls).toBe(5);

    poller.stop();
  });

  it('stops calling the router once stopped', async () => {
    const client = stubClient([USED_5_8_GB]);
    const poller = new UsagePoller({ client, config: CONFIG });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(client.calls).toBe(2);

    poller.stop();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    expect(client.calls).toBe(2);
  });

  it('publishes the title of a successful reading', async () => {
    const titles: string[] = [];
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB]),
      config: CONFIG,
      onTitle: (title) => titles.push(title),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.title).toBe('5.8G · 29%');
    expect(titles).toEqual(['5.8G · 29%']);

    poller.stop();
  });

  it('leaves the previous title in place when a single poll fails', async () => {
    const titles: string[] = [];
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB, OFFLINE, USED_5_8_GB]),
      config: CONFIG,
      onTitle: (title) => titles.push(title),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.title).toBe('5.8G · 29%');

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(poller.title).toBe('5.8G · 29%');
    expect(titles).toEqual(['5.8G · 29%']);

    poller.stop();
  });

  it('switches to the offline title after two consecutive failed polls', async () => {
    const titles: string[] = [];
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB, OFFLINE, OFFLINE]),
      config: CONFIG,
      onTitle: (title) => titles.push(title),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(poller.title).toBe('5.8G · 29%');

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(poller.title).toBe('offline');
    expect(titles).toEqual(['5.8G · 29%', 'offline']);

    poller.stop();
  });

  it('goes offline after two failures even when no reading ever succeeded', async () => {
    const poller = new UsagePoller({ client: stubClient([OFFLINE]), config: CONFIG });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.title).toBe(STARTUP_TRAY_TITLE);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(poller.title).toBe('offline');
    poller.stop();
  });

  it('recovers to a usage title once the router answers again', async () => {
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB, OFFLINE, OFFLINE, USED_9_GB]),
      config: CONFIG,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(poller.title).toBe('offline');

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(poller.title).toBe('9G · 45%');
  });

  it('resets the failure count so an isolated failure never reaches offline', async () => {
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB, OFFLINE, USED_9_GB, OFFLINE, USED_5_8_GB]),
      config: CONFIG,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4);

    expect(poller.title).toBe('5.8G · 29%');
  });
});
