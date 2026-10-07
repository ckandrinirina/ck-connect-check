import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { loadConfig, saveConfig } from "../../src/config/config.js";
import { defaultConfig, type AppConfig } from "../../src/config/defaults.js";
import type { AllowanceAnchor } from "../../src/domain/allowance.js";
import { formatBytes } from "../../src/domain/format.js";
import type { Clock } from "../../src/domain/quota.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import {
  alertSituation,
  createNotifier,
  type AlertSituation,
  type NotificationContent,
  type NotificationFactory,
  type Notifier,
} from "../../src/main/notifier.js";
import type { PortalStatus } from "../../src/main/poller.js";
import type { PopoverTab } from "../../src/main/popover.js";

const GB = 1_000_000_000;
const CAP = 100 * GB;

/** Midnight opening 20 October 2026 — "valid until the 19th". */
const END = new Date(2026, 9, 20);

/** Ten days out at noon: no reminder is due, so only the low rule speaks. */
const FAR_FROM_END = new Date(2026, 9, 10, 12);

function at(instant: Date): Clock {
  return { now: () => instant };
}

/** One notification the fake factory was asked for, and what it can do. */
interface FakeNotification extends NotificationContent {
  shown: number;
  click(): void;
}

/** Stands in for Electron's `Notification`: nothing ever reaches the screen. */
function fakeFactory(): {
  created: FakeNotification[];
  factory: NotificationFactory;
} {
  const created: FakeNotification[] = [];

  const factory: NotificationFactory = (content) => {
    const listeners: Record<string, (() => void)[]> = {};
    const fake: FakeNotification = {
      ...content,
      shown: 0,
      click: () => {
        for (const listener of listeners.click ?? []) listener();
      },
    };

    created.push(fake);

    return {
      on(event, listener) {
        (listeners[event] ??= []).push(listener);
      },
      show() {
        fake.shown += 1;
      },
    };
  };

  return { created, factory };
}

function fakePanel(): {
  calls: string[];
  panel: { showTab(tab: PopoverTab): void; show(): void };
} {
  const calls: string[] = [];

  return {
    calls,
    panel: {
      showTab: (tab) => calls.push(`tab:${tab}`),
      show: () => calls.push("show"),
    },
  };
}

let dir: string;
let configPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "ck-connect-check-notifier-"));
  configPath = join(dir, "config.json");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

interface Setup {
  config?: AppConfig;
  factory?: NotificationFactory;
  now?: Date;
  warn?: (message: string) => void;
}

function notifierFor(setup: Setup = {}): {
  notifier: Notifier;
  created: FakeNotification[];
  calls: string[];
  config: AppConfig;
} {
  const fake = fakeFactory();
  const { calls, panel } = fakePanel();
  const config = setup.config ?? defaultConfig();
  const notifier = createNotifier({
    config,
    configPath,
    createNotification: setup.factory ?? fake.factory,
    panel,
    clock: at(setup.now ?? FAR_FROM_END),
    warn: setup.warn ?? vi.fn(),
  });

  return { notifier, created: fake.created, calls, config };
}

const LOW: AlertSituation = {
  reading: { remainingBytes: 24 * GB, planLimitBytes: CAP },
  periodEnd: END,
};

const PLENTY: AlertSituation = {
  reading: { remainingBytes: 80 * GB, planLimitBytes: CAP },
  periodEnd: END,
};

describe("the low notice", () => {
  it("shows one notification stating the remaining volume and share", () => {
    const { notifier, created } = notifierFor();

    notifier.check(LOW);

    expect(created).toHaveLength(1);
    expect(created[0]?.shown).toBe(1);
    expect(created[0]?.body).toContain(formatBytes(24 * GB));
    expect(created[0]?.body).toContain("24%");
  });

  it("is not shown again on the next poll", () => {
    const { notifier, created } = notifierFor();

    notifier.check(LOW);
    notifier.check(LOW);

    expect(created).toHaveLength(1);
  });

  it("shows nothing while the forfait is not low", () => {
    const { notifier, created } = notifierFor();

    notifier.check(PLENTY);

    expect(created).toHaveLength(0);
  });
});

describe("the end reminders", () => {
  it("states the days left", () => {
    const { notifier, created } = notifierFor({
      now: new Date(2026, 9, 17, 12),
    });

    notifier.check(PLENTY);

    expect(created).toHaveLength(1);
    expect(created[0]?.shown).toBe(1);
    expect(created[0]?.body).toContain("3 days");
  });

  it("states the hours left on the last day", () => {
    const { notifier, created } = notifierFor({
      now: new Date(2026, 9, 19, 19, 5),
    });

    notifier.check(PLENTY);

    expect(created).toHaveLength(1);
    expect(created[0]?.body).toContain("5 hours");
  });

  it("sends the low notice and a reminder together when both are due", () => {
    const { notifier, created } = notifierFor({
      now: new Date(2026, 9, 17, 12),
    });

    notifier.check(LOW);

    expect(created).toHaveLength(2);
  });
});

describe("what has been announced", () => {
  it("is recorded in config.json against the period end", () => {
    const { notifier } = notifierFor();

    notifier.check(LOW);

    expect(loadConfig(configPath).config.announcedAlerts).toEqual({
      periodEnd: END.toISOString(),
      ids: ["low"],
    });
  });

  it("is not re-sent after a restart", () => {
    notifierFor().notifier.check(LOW);

    const restarted = notifierFor({ config: loadConfig(configPath).config });

    restarted.notifier.check(LOW);

    expect(restarted.created).toHaveLength(0);
  });

  it("keeps every other setting in the file", () => {
    const config = { ...defaultConfig(), host: "10.0.0.9", planDays: 30 };

    saveConfig(configPath, config);
    notifierFor({ config }).notifier.check(LOW);

    const stored = loadConfig(configPath).config;

    expect(stored.host).toBe("10.0.0.9");
    expect(stored.planDays).toBe(30);
  });

  it("writes nothing when nothing was announced", () => {
    notifierFor().notifier.check(PLENTY);

    expect(loadConfig(configPath).config).not.toHaveProperty("announcedAlerts");
  });
});

describe("a notification that fails to show", () => {
  it("is logged when the notification cannot be created", () => {
    const warn = vi.fn();
    const { notifier } = notifierFor({
      warn,
      factory: () => {
        throw new Error("no notification centre");
      },
    });

    expect(() => notifier.check(LOW)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("no notification centre"),
    );
  });

  it("is logged when showing it throws", () => {
    const warn = vi.fn();
    const { notifier } = notifierFor({
      warn,
      factory: () => ({
        on: () => undefined,
        show: () => {
          throw new Error("denied");
        },
      }),
    });

    expect(() => notifier.check(LOW)).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("denied"));
  });

  it("does not stop the next one from showing", () => {
    let attempts = 0;
    const fake = fakeFactory();
    const { notifier } = notifierFor({
      now: new Date(2026, 9, 17, 12),
      factory: (content) => {
        attempts += 1;

        if (attempts === 1) throw new Error("first one failed");

        return fake.factory(content);
      },
    });

    notifier.check(LOW);

    expect(fake.created).toHaveLength(1);
    expect(fake.created[0]?.shown).toBe(1);
  });
});

describe("clicking a notification", () => {
  it("opens the panel on the Usage tab", () => {
    const { notifier, created, calls } = notifierFor();

    notifier.check(LOW);
    created[0]?.click();

    expect(calls).toEqual(["tab:usage", "show"]);
  });
});

describe("the situation read off the app's state", () => {
  const COUNTER = 4 * GB;

  function snapshot(carrier: RouterSnapshot["carrier"]): RouterSnapshot {
    return {
      month: {
        monthDownloadBytes: COUNTER,
        monthUploadBytes: 0,
        monthDurationSeconds: 0,
        monthLastClearTime: "2026-10-1",
      },
      traffic: { downloadRateBps: 0, uploadRateBps: 0, connectTimeSeconds: 0 },
      status: {
        connected: true,
        signalBars: 4,
        maxSignalBars: 5,
        connectedDevices: 1,
        networkTypeCode: 101,
      },
      carrier,
      billing: {
        startDay: 1,
        routerDataLimitBytes: 0,
        warnThresholdPercent: 90,
      },
    };
  }

  const ANCHOR: AllowanceAnchor = {
    planLabel: "NET MONTH 200 000",
    remainingBytes: 30 * GB,
    expiresAt: END,
    routerMonthBytes: COUNTER - 2 * GB,
    routerClearTime: "2026-10-1",
    syncedAt: new Date(2026, 9, 10, 8),
  };

  const NO_PORTAL: PortalStatus = { reading: null, live: false };

  it("reads YAS from the anchor carried forward, ending at its expiry", () => {
    const situation = alertSituation({
      config: {
        ...defaultConfig(),
        planLimitBytes: CAP,
        allowanceAnchor: ANCHOR,
      },
      snapshot: snapshot({ carrier: "Yas", id: "yas" }),
      portal: NO_PORTAL,
      clock: at(FAR_FROM_END),
    });

    expect(situation).toEqual({
      reading: { remainingBytes: 28 * GB, planLimitBytes: CAP },
      periodEnd: END,
    });
  });

  it("reads Orange from the portal, ending with the calendar month", () => {
    const situation = alertSituation({
      config: { ...defaultConfig(), planLimitBytes: CAP },
      snapshot: snapshot({ carrier: "Orange MG", id: "orange" }),
      portal: {
        live: true,
        reading: {
          forfait: { label: "Wifiber Go+ SSE", consumedBytes: 75 * GB },
          candidates: [],
          remembered: false,
          at: FAR_FROM_END,
        },
      },
      clock: at(FAR_FROM_END),
    });

    expect(situation).toEqual({
      reading: { remainingBytes: 25 * GB, planLimitBytes: CAP },
      periodEnd: new Date(2026, 10, 1),
    });
  });

  it("measures against no cap while the stored one is unconfirmed", () => {
    const situation = alertSituation({
      config: {
        ...defaultConfig(),
        planLimitBytes: CAP,
        planCapConfirmed: false,
        allowanceAnchor: ANCHOR,
      },
      snapshot: snapshot({ carrier: "Yas", id: "yas" }),
      portal: NO_PORTAL,
      clock: at(FAR_FROM_END),
    });

    expect(situation.reading.planLimitBytes).toBeNull();
  });

  it("knows nothing before the router has answered", () => {
    const situation = alertSituation({
      config: {
        ...defaultConfig(),
        planLimitBytes: CAP,
        allowanceAnchor: ANCHOR,
      },
      snapshot: undefined,
      portal: NO_PORTAL,
      clock: at(FAR_FROM_END),
    });

    expect(situation).toEqual({
      reading: { remainingBytes: null, planLimitBytes: CAP },
      periodEnd: null,
    });
  });
});
