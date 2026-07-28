import { describe, expect, it } from "vitest";

import type { AppConfig } from "../../src/config/defaults.js";
import type { SnapshotResult } from "../../src/hilink/client.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import {
  MAX_TRAY_TITLE_LENGTH,
  TRAY_WARN_MARKER,
  buildTrayTitle,
} from "../../src/main/tray.js";

const GB = 1_000_000_000;

/** The reading taken from the live device on 2026-07-27: 5.83 GB used. */
const DOWNLOAD = 4_427_475_340;
const UPLOAD = 1_403_243_047;

function config(
  planLimitBytes: number | null,
  warnThresholdPercent = 90,
): AppConfig {
  return {
    host: "192.168.8.1",
    pollIntervalSeconds: 30,
    activePollIntervalSeconds: 2,
    warnThresholdPercent,
    planLimitBytes,
  };
}

function snapshot(downloadBytes: number, uploadBytes: number): RouterSnapshot {
  return {
    month: {
      monthDownloadBytes: downloadBytes,
      monthUploadBytes: uploadBytes,
      monthDurationSeconds: 27_960,
      monthLastClearTime: "2026-7-27",
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
    },
    carrier: { carrier: "Yas" },
    billing: { startDay: 1, routerDataLimitBytes: 0, warnThresholdPercent: 90 },
  };
}

function online(downloadBytes: number, uploadBytes = 0): SnapshotResult {
  return { online: true, snapshot: snapshot(downloadBytes, uploadBytes) };
}

const OFFLINE: SnapshotResult = { online: false, reason: "unreachable" };

describe("buildTrayTitle", () => {
  it("renders used total and percentage for 5.83 GB of a 20 GB plan", () => {
    expect(buildTrayTitle(online(DOWNLOAD, UPLOAD), config(20 * GB))).toBe(
      "5.8Go · 29%",
    );
  });

  it("renders the used total alone when no plan limit is configured", () => {
    expect(buildTrayTitle(online(DOWNLOAD, UPLOAD), config(null))).toBe(
      "5.8Go",
    );
  });

  it('renders an offline snapshot as "offline"', () => {
    expect(buildTrayTitle(OFFLINE, config(20 * GB))).toBe("offline");
    expect(
      buildTrayTitle({ online: false, reason: "timeout" }, config(null)),
    ).toBe("offline");
  });

  it("adds download and upload rather than showing download alone", () => {
    // 12 GB down + 8 GB up is 20 GB used, the whole of a 20 GB plan.
    expect(buildTrayTitle(online(12 * GB, 8 * GB), config(20 * GB))).toBe(
      `20Go ${TRAY_WARN_MARKER} 100%`,
    );
  });

  it("shows a plan that has been overshot as more than 100%", () => {
    expect(buildTrayTitle(online(25 * GB), config(20 * GB))).toBe(
      `25Go ${TRAY_WARN_MARKER} 125%`,
    );
  });

  it("scales sub-gigaoctet usage down to mega-octets and octets", () => {
    expect(buildTrayTitle(online(0), config(null))).toBe("0o");
    expect(buildTrayTitle(online(512_000_000), config(null))).toBe("512Mo");
  });

  it("spells the tray suffix in octets, with and without a decimal", () => {
    expect(buildTrayTitle(online(5_830_718_387), config(null))).toBe("5.8Go");
    expect(buildTrayTitle(online(52 * GB), config(null))).toBe("52Go");
  });

  it("still fits 12 characters at its widest — 999Go ⚠ 999%", () => {
    const widest = buildTrayTitle(online(999 * GB), config(1 * GB));

    expect(widest).toBe(`999Go ${TRAY_WARN_MARKER} 999%`);
    expect(widest.length).toBe(MAX_TRAY_TITLE_LENGTH);
  });

  it("never exceeds 12 characters for any usage up to 999 GB", () => {
    const limits = [null, 1 * GB, 20 * GB, 100 * GB, 999 * GB];

    for (const limit of limits) {
      for (let usedGb = 0; usedGb <= 999; usedGb += 1) {
        const title = buildTrayTitle(online(usedGb * GB), config(limit));

        expect(
          title.length,
          `"${title}" for ${usedGb} GB used of ${String(limit)} bytes`,
        ).toBeLessThanOrEqual(MAX_TRAY_TITLE_LENGTH);
      }
    }

    expect(MAX_TRAY_TITLE_LENGTH).toBe(12);
  });

  it("stays inside the width limit for byte-level and fractional usage", () => {
    const usages = [
      1,
      999,
      1_500,
      999_999,
      5_830_718_387,
      123_456_789_012,
      999 * GB,
    ];

    for (const used of usages) {
      expect(
        buildTrayTitle(online(used), config(20 * GB)).length,
      ).toBeLessThanOrEqual(MAX_TRAY_TITLE_LENGTH);
      expect(
        buildTrayTitle(online(used), config(null)).length,
      ).toBeLessThanOrEqual(MAX_TRAY_TITLE_LENGTH);
    }
  });
});

describe("buildTrayTitle — the warning marker", () => {
  it("leaves a title below the warn threshold unmarked", () => {
    const title = buildTrayTitle(online(17.9 * GB), config(20 * GB));

    expect(title).toBe("18Go · 90%");
    expect(title).not.toContain(TRAY_WARN_MARKER);
  });

  it("marks a title that has reached the warn threshold exactly", () => {
    const title = buildTrayTitle(online(18 * GB), config(20 * GB));

    expect(title).toContain(TRAY_WARN_MARKER);
    expect(title).toBe(`18Go ${TRAY_WARN_MARKER} 90%`);
  });

  it("marks a title that has reached the plan limit exactly", () => {
    expect(buildTrayTitle(online(20 * GB), config(20 * GB))).toContain(
      TRAY_WARN_MARKER,
    );
  });

  it("marks a title that has passed the plan limit", () => {
    expect(buildTrayTitle(online(25 * GB), config(20 * GB))).toContain(
      TRAY_WARN_MARKER,
    );
  });

  it("takes the threshold from the config rather than always warning at 90", () => {
    expect(buildTrayTitle(online(15 * GB), config(20 * GB, 75))).toContain(
      TRAY_WARN_MARKER,
    );
    expect(buildTrayTitle(online(14 * GB), config(20 * GB, 75))).not.toContain(
      TRAY_WARN_MARKER,
    );
  });

  it("never marks a title with no plan limit to warn against", () => {
    expect(buildTrayTitle(online(500 * GB), config(null))).not.toContain(
      TRAY_WARN_MARKER,
    );
  });

  it("never marks the offline title", () => {
    expect(buildTrayTitle(OFFLINE, config(20 * GB))).not.toContain(
      TRAY_WARN_MARKER,
    );
  });

  it("is at most one character, so the width cap still holds", () => {
    expect(TRAY_WARN_MARKER.length).toBeLessThanOrEqual(1);

    for (let usedGb = 0; usedGb <= 999; usedGb += 1) {
      const title = buildTrayTitle(online(usedGb * GB), config(1 * GB));

      expect(
        title.length,
        `"${title}" for ${usedGb} GB used`,
      ).toBeLessThanOrEqual(MAX_TRAY_TITLE_LENGTH);
    }
  });
});
