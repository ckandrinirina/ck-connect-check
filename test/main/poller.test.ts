import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/config/defaults.js";
import type { SnapshotResult } from "../../src/hilink/client.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import type { UsageState } from "../../src/domain/quota.js";
import { STARTUP_TRAY_TITLE, UsagePoller } from "../../src/main/poller.js";

const GB = 1_000_000_000;
const POLL_INTERVAL_SECONDS = 30;
const POLL_INTERVAL_MS = POLL_INTERVAL_SECONDS * 1_000;

/** The faster cadence used while the panel is on screen. */
const ACTIVE_INTERVAL_SECONDS = 2;
const ACTIVE_INTERVAL_MS = ACTIVE_INTERVAL_SECONDS * 1_000;

const CONFIG: AppConfig = {
  host: "192.168.8.1",
  pollIntervalSeconds: POLL_INTERVAL_SECONDS,
  activePollIntervalSeconds: ACTIVE_INTERVAL_SECONDS,
  warnThresholdPercent: 90,
  planLimitBytes: 20 * GB,
};

function snapshot(usedBytes: number): RouterSnapshot {
  return {
    month: {
      monthDownloadBytes: usedBytes,
      monthUploadBytes: 0,
      monthDurationSeconds: 27_960,
      monthLastClearTime: "2026-7-27",
    },
    traffic: {
      downloadRateBps: 0,
      uploadRateBps: 0,
      connectTimeSeconds: 27_960,
    },
    status: {
      connected: true,
      signalBars: 4,
      maxSignalBars: 5,
      connectedDevices: 3,
    },
    carrier: { carrier: "Yas" },
    billing: { startDay: 1, routerDataLimitBytes: 0, warnThresholdPercent: 90 },
  };
}

const USED_5_8_GB: SnapshotResult = {
  online: true,
  snapshot: snapshot(5_830_718_387),
};
const USED_9_GB: SnapshotResult = { online: true, snapshot: snapshot(9 * GB) };
const OFFLINE: SnapshotResult = { online: false, reason: "unreachable" };

/** 90% of the 20 GB plan — exactly the warn threshold. */
const USED_18_GB: SnapshotResult = {
  online: true,
  snapshot: snapshot(18 * GB),
};
/** 95% of the plan: still "warn", a different reading from {@link USED_18_GB}. */
const USED_19_GB: SnapshotResult = {
  online: true,
  snapshot: snapshot(19 * GB),
};
/** 125% of the plan — over the limit. */
const USED_25_GB: SnapshotResult = {
  online: true,
  snapshot: snapshot(25 * GB),
};

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

describe("UsagePoller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts on a placeholder title before the first reading arrives", () => {
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB]),
      config: CONFIG,
    });

    expect(poller.title).toBe(STARTUP_TRAY_TITLE);
    poller.stop();
  });

  it("calls the router once per configured interval and no more", async () => {
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

  it("stops calling the router once stopped", async () => {
    const client = stubClient([USED_5_8_GB]);
    const poller = new UsagePoller({ client, config: CONFIG });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(client.calls).toBe(2);

    poller.stop();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);
    expect(client.calls).toBe(2);
  });

  it("publishes the title of a successful reading", async () => {
    const titles: string[] = [];
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB]),
      config: CONFIG,
      onTitle: (title) => titles.push(title),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.title).toBe("5.8Go · 29%");
    expect(titles).toEqual(["5.8Go · 29%"]);

    poller.stop();
  });

  it("leaves the previous title in place when a single poll fails", async () => {
    const titles: string[] = [];
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB, OFFLINE, USED_5_8_GB]),
      config: CONFIG,
      onTitle: (title) => titles.push(title),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.title).toBe("5.8Go · 29%");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(poller.title).toBe("5.8Go · 29%");
    expect(titles).toEqual(["5.8Go · 29%"]);

    poller.stop();
  });

  it("switches to the offline title after two consecutive failed polls", async () => {
    const titles: string[] = [];
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB, OFFLINE, OFFLINE]),
      config: CONFIG,
      onTitle: (title) => titles.push(title),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(poller.title).toBe("5.8Go · 29%");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(poller.title).toBe("offline");
    expect(titles).toEqual(["5.8Go · 29%", "offline"]);

    poller.stop();
  });

  it("goes offline after two failures even when no reading ever succeeded", async () => {
    const poller = new UsagePoller({
      client: stubClient([OFFLINE]),
      config: CONFIG,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(poller.title).toBe(STARTUP_TRAY_TITLE);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(poller.title).toBe("offline");
    poller.stop();
  });

  it("recovers to a usage title once the router answers again", async () => {
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB, OFFLINE, OFFLINE, USED_9_GB]),
      config: CONFIG,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);
    expect(poller.title).toBe("offline");

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(poller.title).toBe("9Go · 45%");
  });

  it("resets the failure count so an isolated failure never reaches offline", async () => {
    const poller = new UsagePoller({
      client: stubClient([
        USED_5_8_GB,
        OFFLINE,
        USED_9_GB,
        OFFLINE,
        USED_5_8_GB,
      ]),
      config: CONFIG,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4);

    expect(poller.title).toBe("5.8Go · 29%");
  });
});

describe("UsagePoller — the active interval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("polls at the active interval once the panel is open", async () => {
    const client = stubClient([USED_5_8_GB]);
    const poller = new UsagePoller({ client, config: CONFIG });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    poller.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    const opened = client.calls;

    await vi.advanceTimersByTimeAsync(ACTIVE_INTERVAL_MS * 3);

    expect(client.calls).toBe(opened + 3);
    poller.stop();
  });

  it("returns to the idle interval once the panel is shut", async () => {
    const client = stubClient([USED_5_8_GB]);
    const poller = new UsagePoller({ client, config: CONFIG });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    poller.setActive(true);
    await vi.advanceTimersByTimeAsync(0);

    poller.setActive(false);
    const closed = client.calls;

    // The active-interval timer that was pending must not survive the close.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS - 1);
    expect(client.calls).toBe(closed);

    await vi.advanceTimersByTimeAsync(1);
    expect(client.calls).toBe(closed + 1);

    poller.stop();
  });

  it("polls immediately on opening rather than waiting out the pending timer", async () => {
    const client = stubClient([USED_5_8_GB]);
    const poller = new UsagePoller({ client, config: CONFIG });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(client.calls).toBe(1);

    // Halfway through a 30 second wait: without the immediate poll the panel
    // would open on figures up to fifteen seconds stale.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS / 2);
    expect(client.calls).toBe(1);

    poller.setActive(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.calls).toBe(2);
    poller.stop();
  });

  it("triggers one extra poll when opening is signalled twice", async () => {
    const client = stubClient([USED_5_8_GB]);
    const poller = new UsagePoller({ client, config: CONFIG });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    poller.setActive(true);
    poller.setActive(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(client.calls).toBe(2);
    poller.stop();
  });

  it("never stacks a second request while a slow reply is still in flight", async () => {
    let resolveFirst: (result: SnapshotResult) => void = () => undefined;
    const first = new Promise<SnapshotResult>((resolve) => {
      resolveFirst = resolve;
    });
    let calls = 0;

    const poller = new UsagePoller({
      client: {
        snapshot(): Promise<SnapshotResult> {
          calls += 1;

          return calls === 1 ? first : Promise.resolve(USED_5_8_GB);
        },
      },
      config: CONFIG,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    poller.setActive(true);
    await vi.advanceTimersByTimeAsync(0);

    // The router is still answering the first request — opening the panel must
    // not put a second one on the wire.
    expect(calls).toBe(1);

    resolveFirst(USED_5_8_GB);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    await vi.advanceTimersByTimeAsync(ACTIVE_INTERVAL_MS);
    expect(calls).toBe(2);

    poller.stop();
  });

  it("stays quiet when opening before the poller has started", async () => {
    const client = stubClient([USED_5_8_GB]);
    const poller = new UsagePoller({ client, config: CONFIG });

    poller.setActive(true);
    await vi.advanceTimersByTimeAsync(ACTIVE_INTERVAL_MS * 3);

    expect(client.calls).toBe(0);
    poller.stop();
  });
});

describe("UsagePoller — the usage state", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** Collects every state the poller publishes over `polls` polls. */
  async function statesOver(
    results: SnapshotResult[],
    polls: number,
  ): Promise<{ states: UsageState[]; poller: UsagePoller }> {
    const states: UsageState[] = [];
    const poller = new UsagePoller({
      client: stubClient(results),
      config: CONFIG,
      onState: (state) => states.push(state),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * (polls - 1));

    return { states, poller };
  }

  it("starts unknown, before any reading has arrived", () => {
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB]),
      config: CONFIG,
    });

    expect(poller.state).toBe("unknown");
    poller.stop();
  });

  it("publishes the state of the first reading", async () => {
    const { states, poller } = await statesOver([USED_5_8_GB], 1);

    expect(poller.state).toBe("ok");
    expect(states).toEqual(["ok"]);

    poller.stop();
  });

  it("fires once when usage crosses into warn, not on every poll", async () => {
    const { states, poller } = await statesOver(
      [USED_5_8_GB, USED_18_GB, USED_18_GB, USED_19_GB],
      4,
    );

    expect(poller.state).toBe("warn");
    expect(states).toEqual(["ok", "warn"]);

    poller.stop();
  });

  it("fires once when usage crosses into over, not on every poll", async () => {
    const { states, poller } = await statesOver(
      [USED_18_GB, USED_25_GB, USED_25_GB, USED_25_GB],
      4,
    );

    expect(poller.state).toBe("over");
    expect(states).toEqual(["warn", "over"]);

    poller.stop();
  });

  it("never fires while the state holds steady across many polls", async () => {
    const { states, poller } = await statesOver([USED_25_GB], 5);

    expect(states).toEqual(["over"]);

    poller.stop();
  });

  it("fires again when usage falls back after a billing reset", async () => {
    const { states, poller } = await statesOver(
      [USED_25_GB, USED_25_GB, USED_5_8_GB],
      3,
    );

    expect(poller.state).toBe("ok");
    expect(states).toEqual(["over", "ok"]);

    poller.stop();
  });

  it("holds the last known state while the router is unreachable", async () => {
    const { states, poller } = await statesOver(
      [USED_18_GB, OFFLINE, OFFLINE, OFFLINE],
      4,
    );

    expect(poller.title).toBe("offline");
    expect(poller.state).toBe("warn");
    expect(states).toEqual(["warn"]);

    poller.stop();
  });
});
