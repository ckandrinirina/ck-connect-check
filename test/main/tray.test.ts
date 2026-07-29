import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../src/config/defaults.js";
import type { AllowanceAnchor } from "../../src/domain/allowance.js";
import type { Clock } from "../../src/domain/quota.js";
import type { SnapshotResult } from "../../src/hilink/client.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import {
  MAX_TRAY_TITLE_LENGTH,
  NO_TRAY_VALUE,
  TRAY_WARN_MARKER,
  buildTrayTitle,
} from "../../src/main/tray.js";
import { buildPopoverModel } from "../../src/main/view-model.js";

const GB = 1_000_000_000;

/** The reading taken from the live device on 2026-07-27: 5.83 GB counted. */
const DOWNLOAD = 4_427_475_340;
const UPLOAD = 1_403_243_047;
const ROUTER_COUNTER = DOWNLOAD + UPLOAD;

const CLEAR_TIME = "2026-7-27";
const NOW = new Date(2026, 6, 27, 17, 46, 0);
const clock: Clock = { now: () => NOW };

function snapshot(
  downloadBytes = DOWNLOAD,
  uploadBytes = UPLOAD,
  clearTime = CLEAR_TIME,
): RouterSnapshot {
  return {
    month: {
      monthDownloadBytes: downloadBytes,
      monthUploadBytes: uploadBytes,
      monthDurationSeconds: 27_960,
      monthLastClearTime: clearTime,
    },
    traffic: {
      downloadRateBps: 2_345,
      uploadRateBps: 512,
      connectTimeSeconds: 27_960,
    },
    status: {
      connected: true,
      signalBars: 4,
      maxSignalBars: 5,
      connectedDevices: 3,
      networkTypeCode: 101,
    },
    carrier: { carrier: "Yas" },
    billing: { startDay: 1, routerDataLimitBytes: 0, warnThresholdPercent: 90 },
  };
}

const ONLINE: SnapshotResult = { online: true, snapshot: snapshot() };
const OFFLINE: SnapshotResult = { online: false, reason: "unreachable" };

/**
 * An anchor pinned to the snapshot's own counter, so the router delta is zero
 * and the carrier's remaining reads back exactly as given.
 */
function anchorOf(remainingBytes: number): AllowanceAnchor {
  return {
    planLabel: "NET MONTH 200 000",
    remainingBytes,
    expiresAt: new Date(2026, 7, 12),
    routerMonthBytes: ROUTER_COUNTER,
    routerClearTime: CLEAR_TIME,
    syncedAt: new Date(2026, 6, 27, 10, 0, 0),
  };
}

interface Case {
  /** How much of the plan the carrier says is gone. */
  usedBytes?: number;
  /** The plan the user typed in. Null when they have not. */
  cap?: number | null;
  /** False for the case where nothing has ever been synced. */
  anchored?: boolean;
  warnThresholdPercent?: number;
  /** False once a sync has brought back a plan the stored cap cannot describe. */
  planCapConfirmed?: boolean;
}

function configFor({
  usedBytes = 0,
  cap = 20 * GB,
  anchored = true,
  warnThresholdPercent = 90,
  planCapConfirmed = true,
}: Case): AppConfig {
  return {
    host: "192.168.8.1",
    pollIntervalSeconds: 30,
    activePollIntervalSeconds: 2,
    warnThresholdPercent,
    planLimitBytes: cap,
    planCapConfirmed,
    ...(anchored
      ? { allowanceAnchor: anchorOf(Math.max(0, (cap ?? 20 * GB) - usedBytes)) }
      : {}),
  };
}

/** The menu bar title for one plan situation. */
function titleFor(situation: Case): string {
  return buildTrayTitle(ONLINE, configFor(situation), clock);
}

describe("buildTrayTitle", () => {
  it("renders the plan consumed and its share for 5.83 Go of a 20 Go plan", () => {
    expect(titleFor({ usedBytes: ROUTER_COUNTER })).toBe("5.8Go · 29%");
  });

  it('renders an offline snapshot as "offline"', () => {
    expect(buildTrayTitle(OFFLINE, configFor({}), clock)).toBe("offline");
    expect(
      buildTrayTitle(
        { online: false, reason: "timeout" },
        configFor({ cap: null }),
        clock,
      ),
    ).toBe("offline");
  });

  it("shows a dash when no plan limit is configured, never the router's counter", () => {
    const title = titleFor({ usedBytes: ROUTER_COUNTER, cap: null });

    expect(title).toBe(NO_TRAY_VALUE);
    expect(title).not.toContain("5.8");
  });

  it("shows a dash before anything has been synced", () => {
    const title = titleFor({ anchored: false });

    expect(title).toBe(NO_TRAY_VALUE);
    expect(title).not.toContain("5.8");
  });

  it("shows a dash once the anchor behind the figure has gone stale", () => {
    // The router's counter restarted, so the delta means nothing any more.
    const title = buildTrayTitle(
      { online: true, snapshot: snapshot(400_000_000, 0, "2026-8-1") },
      configFor({ usedBytes: 8 * GB }),
      clock,
    );

    expect(title).toBe(NO_TRAY_VALUE);
  });

  it("scales sub-gigaoctet consumption down to mega-octets and octets", () => {
    expect(titleFor({ usedBytes: 0 })).toBe("0o · 0%");
    expect(titleFor({ usedBytes: 512_000_000 })).toBe("512Mo · 3%");
  });

  it("spells the tray suffix in octets, with and without a decimal", () => {
    expect(titleFor({ usedBytes: 5_830_718_387, cap: 100 * GB })).toBe(
      "5.8Go · 6%",
    );
    expect(titleFor({ usedBytes: 52 * GB, cap: 100 * GB })).toBe("52Go · 52%");
  });

  it("still fits 12 characters at its widest — 999Go ⚠ 100%", () => {
    const widest = titleFor({ usedBytes: 999 * GB, cap: 999 * GB });

    expect(widest).toBe(`999Go ${TRAY_WARN_MARKER} 100%`);
    expect(widest.length).toBe(MAX_TRAY_TITLE_LENGTH);
  });

  it("never exceeds 12 characters for any consumption up to 999 Go", () => {
    const caps = [1 * GB, 20 * GB, 100 * GB, 999 * GB];

    for (const cap of caps) {
      for (let usedGb = 0; usedGb * GB <= cap; usedGb += 1) {
        const title = titleFor({ usedBytes: usedGb * GB, cap });

        expect(
          title.length,
          `"${title}" for ${String(usedGb)} Go used of ${String(cap)} bytes`,
        ).toBeLessThanOrEqual(MAX_TRAY_TITLE_LENGTH);
      }
    }

    expect(MAX_TRAY_TITLE_LENGTH).toBe(12);
  });

  it("stays inside the width limit for byte-level and fractional consumption", () => {
    const usages = [1, 999, 1_500, 999_999, 5_830_718_387, 123_456_789_012];

    for (const usedBytes of usages) {
      expect(titleFor({ usedBytes, cap: 999 * GB }).length).toBeLessThanOrEqual(
        MAX_TRAY_TITLE_LENGTH,
      );
    }
  });
});

describe("buildTrayTitle — agreeing with the panel", () => {
  /**
   * The whole point of the task: one definition of "share of the plan used",
   * so the menu bar and the panel can never tell the user different things.
   */
  function bothFor(situation: Case): { tray: string; panel: string } {
    const config = configFor(situation);

    return {
      tray: buildTrayTitle(ONLINE, config, clock),
      panel: buildPopoverModel({
        result: ONLINE,
        lastReading: null,
        config,
        clock,
      }).progress.label,
    };
  }

  it("shows the same percentage as the panel's dial", () => {
    const { tray, panel } = bothFor({ usedBytes: 8 * GB });

    expect(panel).toBe("40%");
    expect(tray).toContain(panel);
  });

  it("agrees with the panel across the whole range", () => {
    for (let usedGb = 0; usedGb <= 20; usedGb += 1) {
      const { tray, panel } = bothFor({ usedBytes: usedGb * GB });

      expect(tray, `at ${String(usedGb)} Go used`).toContain(panel);
    }
  });

  it("goes blank in exactly the cases the panel withdraws the dial", () => {
    for (const situation of [
      { cap: null },
      { anchored: false },
      { cap: null, anchored: false },
    ]) {
      const config = configFor(situation);
      const model = buildPopoverModel({
        result: ONLINE,
        lastReading: null,
        config,
        clock,
      });

      expect(model.progress.available).toBe(false);
      expect(buildTrayTitle(ONLINE, config, clock)).toBe(NO_TRAY_VALUE);
    }
  });
});

describe("one definition of the share used", () => {
  /**
   * The bug this task fixes was two files quietly growing their own arithmetic.
   * Importing the raw percentage helper into the main process is how that
   * happens again — the share belongs to the reading, and to nothing else.
   */
  it.each(["tray.ts", "poller.ts", "view-model.ts"])(
    "keeps %s off the raw percentage and counter helpers",
    (file) => {
      const source = readFileSync(
        fileURLToPath(new URL(`../../src/main/${file}`, import.meta.url)),
        "utf8",
      );
      const imports = source.slice(0, source.indexOf("\nexport"));

      expect(imports).not.toMatch(/\bpercentUsed\b/);
      expect(imports).not.toMatch(/\btotalUsedBytes\b/);
    },
  );
});

describe("buildTrayTitle — the warning marker", () => {
  it("leaves a title below the warn threshold unmarked", () => {
    const title = titleFor({ usedBytes: 17.9 * GB });

    expect(title).toBe("18Go · 90%");
    expect(title).not.toContain(TRAY_WARN_MARKER);
  });

  it("marks a title that has reached the warn threshold exactly", () => {
    const title = titleFor({ usedBytes: 18 * GB });

    expect(title).toContain(TRAY_WARN_MARKER);
    expect(title).toBe(`18Go ${TRAY_WARN_MARKER} 90%`);
  });

  it("marks a title that has consumed the whole plan", () => {
    expect(titleFor({ usedBytes: 20 * GB })).toContain(TRAY_WARN_MARKER);
  });

  it("takes the threshold from the config rather than always warning at 90", () => {
    expect(
      titleFor({ usedBytes: 15 * GB, warnThresholdPercent: 75 }),
    ).toContain(TRAY_WARN_MARKER);
    expect(
      titleFor({ usedBytes: 14 * GB, warnThresholdPercent: 75 }),
    ).not.toContain(TRAY_WARN_MARKER);
  });

  it("never marks a title that has no share to warn against", () => {
    expect(titleFor({ usedBytes: 19 * GB, cap: null })).not.toContain(
      TRAY_WARN_MARKER,
    );
    expect(titleFor({ anchored: false })).not.toContain(TRAY_WARN_MARKER);
  });
});

describe("buildTrayTitle — an unconfirmed plan cap", () => {
  it("shows a dash rather than a share computed from a contradicted cap", () => {
    // The same rule the dial follows: a menu bar quoting a figure the panel has
    // withdrawn is worse than one saying nothing.
    expect(
      titleFor({ usedBytes: ROUTER_COUNTER, planCapConfirmed: false }),
    ).toBe(NO_TRAY_VALUE);
  });

  it("never marks such a title either", () => {
    expect(
      titleFor({ usedBytes: 19 * GB, planCapConfirmed: false }),
    ).not.toContain(TRAY_WARN_MARKER);
  });

  it("quotes the share again once the cap is confirmed", () => {
    expect(
      titleFor({ usedBytes: ROUTER_COUNTER, planCapConfirmed: true }),
    ).toBe("5.8Go · 29%");
  });
});
