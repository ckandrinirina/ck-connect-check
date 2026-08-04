import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../../src/config/defaults.js";
import type { SnapshotResult } from "../../src/hilink/client.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import type { AllowanceAnchor } from "../../src/domain/allowance.js";
import type { UsageState } from "../../src/domain/quota.js";
import type { OrangePortalResult } from "../../src/orange/portal.js";
import type { OrangeInfoConso } from "../../src/orange/types.js";
import { STARTUP_TRAY_TITLE, UsagePoller } from "../../src/main/poller.js";

const GB = 1_000_000_000;
const POLL_INTERVAL_SECONDS = 30;
const POLL_INTERVAL_MS = POLL_INTERVAL_SECONDS * 1_000;

/** The faster cadence used while the panel is on screen. */
const ACTIVE_INTERVAL_SECONDS = 2;
const ACTIVE_INTERVAL_MS = ACTIVE_INTERVAL_SECONDS * 1_000;

/**
 * A full 20 GB plan anchored against a zero counter, so the router's delta *is*
 * the consumption: a snapshot counting 5.83 GB leaves 14.17 GB of the plan. The
 * title and the usage state are read from this, never from the counter itself.
 */
const FULL_PLAN_ANCHOR: AllowanceAnchor = {
  planLabel: "NET MONTH 200 000",
  remainingBytes: 20 * GB,
  expiresAt: null,
  routerMonthBytes: 0,
  routerClearTime: "2026-7-27",
  syncedAt: new Date(2026, 6, 27, 10, 0, 0),
};

const CONFIG: AppConfig = {
  host: "192.168.8.1",
  pollIntervalSeconds: POLL_INTERVAL_SECONDS,
  activePollIntervalSeconds: ACTIVE_INTERVAL_SECONDS,
  warnThresholdPercent: 90,
  planLimitBytes: 20 * GB,
  allowanceAnchor: FULL_PLAN_ANCHOR,
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
      networkTypeCode: 101,
    },
    carrier: { carrier: "Yas", id: "yas" },
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

/** The same router, with the SIM the app found on it on 2026-08-04. */
const ORANGE: SnapshotResult = {
  online: true,
  snapshot: {
    ...snapshot(5_830_718_387),
    carrier: { carrier: "ORANGE MG", id: "orange" },
  },
};

/** A network no table covers — the app knows the router and nothing else. */
const UNKNOWN_CARRIER: SnapshotResult = {
  online: true,
  snapshot: {
    ...snapshot(5_830_718_387),
    carrier: { carrier: "Airtel", id: "unknown" },
  },
};

/** The live capture's Wifiber plan: 7.37 Go consumed, no cap stated anywhere. */
const WIFIBER = {
  label: "Wifiber Go+ SSE",
  nature: "Internet",
  bundleType: "data",
  consumedBytes: 7_370_000_000,
};

/** A top-up beside it, so a remembered choice has something to choose between. */
const TOP_UP = {
  label: "Pass Internet 5 Go",
  nature: "Internet",
  bundleType: "data",
  consumedBytes: 1_000_000_000,
};

function page(...forfaits: OrangeInfoConso["forfaits"]): OrangeInfoConso {
  return { account: { offer: "WiFiber", balanceAr: 0 }, forfaits };
}

const PORTAL_READ: OrangePortalResult = {
  state: "read",
  page: page(WIFIBER),
};

/** The off-network state: a laptop on some other Wi-Fi, which is ordinary. */
const PORTAL_OFFLINE: OrangePortalResult = {
  state: "unreachable",
  reason: "offline",
};

/** Answers with `results[n]` for fetch `n`, repeating the last one thereafter. */
function stubPortal(results: OrangePortalResult[]) {
  let calls = 0;

  return {
    get calls(): number {
      return calls;
    },
    read(): Promise<OrangePortalResult> {
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

  it("warns on the plan consumed, not on the router's own counter", async () => {
    // The counter has run up 19 GB since the device last cleared itself, but the
    // carrier anchored 18 GB still left of a 20 GB plan a moment ago — 10% used.
    // Warning here would be warning about the wrong month.
    const states: UsageState[] = [];
    const poller = new UsagePoller({
      client: stubClient([USED_19_GB]),
      config: {
        ...CONFIG,
        allowanceAnchor: {
          ...FULL_PLAN_ANCHOR,
          remainingBytes: 18 * GB,
          routerMonthBytes: 19 * GB,
        },
      },
      onState: (state) => states.push(state),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.state).toBe("ok");
    expect(states).toEqual(["ok"]);

    poller.stop();
  });

  it("stays unknown while nothing has been synced, however high the counter", async () => {
    const states: UsageState[] = [];
    const poller = new UsagePoller({
      client: stubClient([USED_25_GB]),
      config: { ...CONFIG, allowanceAnchor: undefined },
      onState: (state) => states.push(state),
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.state).toBe("unknown");
    expect(states).toEqual([]);

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

describe("UsagePoller — the allowance source the carrier decides", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads the Orange portal once the router reports ORANGE MG", async () => {
    const portal = stubPortal([PORTAL_READ]);
    const poller = new UsagePoller({
      client: stubClient([ORANGE]),
      config: CONFIG,
      portal,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(portal.calls).toBe(1);
    expect(poller.portal.live).toBe(true);
    expect(poller.portal.reading?.forfait?.consumedBytes).toBe(7_370_000_000);

    poller.stop();
  });

  it("never reaches for the portal on Yas", async () => {
    const portal = stubPortal([PORTAL_READ]);
    const poller = new UsagePoller({
      client: stubClient([USED_5_8_GB]),
      config: CONFIG,
      portal,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(portal.calls).toBe(0);
    expect(poller.portal.reading).toBeNull();
    // The router's own figures are untouched by any of this.
    expect(poller.title).toBe("5.8Go · 29%");

    poller.stop();
  });

  it("contacts no allowance source at all on a carrier it cannot place", async () => {
    const portal = stubPortal([PORTAL_READ]);
    const poller = new UsagePoller({
      client: stubClient([UNKNOWN_CARRIER]),
      config: CONFIG,
      portal,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(portal.calls).toBe(0);
    // Router figures are still produced: only the allowance has no source.
    expect(poller.title).toBe("5.8Go · 29%");
    expect(poller.state).toBe("ok");

    poller.stop();
  });

  it("stops reading the portal when the SIM moves back to Yas", async () => {
    const portal = stubPortal([PORTAL_READ]);
    const poller = new UsagePoller({
      client: stubClient([ORANGE, USED_5_8_GB]),
      config: CONFIG,
      portal,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(portal.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(portal.calls).toBe(1);

    poller.stop();
  });

  it("fetches the portal on the slow interval however fast the panel polls", async () => {
    const portal = stubPortal([PORTAL_READ]);
    const client = stubClient([ORANGE]);
    const poller = new UsagePoller({ client, config: CONFIG, portal });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(portal.calls).toBe(1);

    // Opening the panel is a reason to ask the router more often. It is not a
    // reason to ask for a 38 KB page again.
    poller.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(portal.calls).toBe(1);

    await vi.advanceTimersByTimeAsync(ACTIVE_INTERVAL_MS * 3);
    expect(client.calls).toBeGreaterThan(3);
    expect(portal.calls).toBe(1);

    // Only the slow interval coming round moves it.
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(portal.calls).toBe(2);

    poller.stop();
  });

  it("reuses the last reading rather than losing the allowance between fetches", async () => {
    const portal = stubPortal([PORTAL_READ, PORTAL_OFFLINE]);
    const poller = new UsagePoller({
      client: stubClient([ORANGE]),
      config: CONFIG,
      portal,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(portal.calls).toBe(2);
    expect(poller.portal.live).toBe(false);
    expect(poller.portal.reading?.forfait?.consumedBytes).toBe(7_370_000_000);

    poller.stop();
  });

  it("keeps reading the portal while the router is unreachable", async () => {
    const portal = stubPortal([PORTAL_READ]);
    const poller = new UsagePoller({
      client: stubClient([ORANGE, OFFLINE]),
      config: CONFIG,
      portal,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 2);

    // The two outages are independent: a router that stopped answering says
    // nothing about a portal that is still answering.
    expect(poller.title).toBe("offline");
    expect(portal.calls).toBe(3);
    expect(poller.portal.live).toBe(true);

    poller.stop();
  });

  it("keeps the router's figures while the portal is unreachable", async () => {
    const portal = stubPortal([PORTAL_OFFLINE]);
    const poller = new UsagePoller({
      client: stubClient([ORANGE]),
      config: CONFIG,
      portal,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(poller.title).not.toBe("offline");
    expect(poller.portal.live).toBe(false);
    expect(poller.portal.reading).toBeNull();

    poller.stop();
  });

  it("measures the forfait the user chose rather than the page's first", async () => {
    const portal = stubPortal([{ state: "read", page: page(WIFIBER, TOP_UP) }]);
    const poller = new UsagePoller({
      client: stubClient([ORANGE]),
      config: { ...CONFIG, orangeForfaitLabel: "Pass Internet 5 Go" },
      portal,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(poller.portal.reading?.forfait?.label).toBe("Pass Internet 5 Go");
    expect(poller.portal.reading?.remembered).toBe(true);

    poller.stop();
  });

  it("stops fetching the portal once the poller is stopped", async () => {
    const portal = stubPortal([PORTAL_READ]);
    const poller = new UsagePoller({
      client: stubClient([ORANGE]),
      config: CONFIG,
      portal,
    });

    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    poller.stop();

    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);

    expect(portal.calls).toBe(1);
  });
});
