// @vitest-environment jsdom

/**
 * The popover's renderer, exercised against the real `index.html` and the real
 * `popover.css` under jsdom — the only renderer suite in the project, so it
 * carries its own environment docblock rather than switching the whole run.
 *
 * jsdom has no layout engine and no SVG rendering, so nothing here asserts on
 * pixels. What it can assert is everything the renderer actually decides: the
 * geometry it writes into the arc's `stroke-dasharray`, the state flags it puts
 * on the root element, the accessible label, and that a second model updates the
 * SVG instead of growing a new one. Whether two states *look* different is
 * checked against the stylesheet's declarations, which is the closest an
 * engine-less test can honestly get.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PlanLimitRefusal } from "../../src/config/config.js";
import { defaultConfig, type AppConfig } from "../../src/config/defaults.js";
import type { AllowanceAnchor } from "../../src/domain/allowance.js";
import type { SyncFailure, SyncState } from "../../src/main/sync.js";
import type { RateSample } from "../../src/domain/history.js";
import type { Clock } from "../../src/domain/quota.js";
import type { RouterSnapshot } from "../../src/hilink/types.js";
import {
  buildPopoverModel,
  type PopoverModel,
} from "../../src/main/view-model.js";

/**
 * The popover window's fixed height, repeated rather than imported: pulling it
 * from `src/main/popover.ts` would drag Electron into a jsdom run for one
 * number. `test/main/popover.test.ts` guards the window that uses it.
 */
const POPOVER_HEIGHT = 520;

/**
 * `import.meta.url` is turned into a path before anything is resolved against
 * it: under jsdom the global `URL` is jsdom's own, which `fileURLToPath` will
 * not accept, so the whole path is built with `node:path` instead.
 */
const RENDERER_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/renderer",
);

function readRendererFile(name: string): string {
  return readFileSync(resolve(RENDERER_DIR, name), "utf8");
}

const INDEX_HTML = readRendererFile("index.html");
const POPOVER_CSS = readRendererFile("popover.css");

/** The page's own markup, so the tests run against what actually ships. */
function loadPage(): void {
  const inner = /<html[^>]*>([\s\S]*)<\/html>/.exec(INDEX_HTML)?.[1];

  if (inner === undefined) {
    throw new Error("index.html has no <html> element");
  }

  document.documentElement.innerHTML = inner;

  for (const attribute of ["stale", "limit", "usage"]) {
    document.documentElement.removeAttribute(`data-${attribute}`);
  }
}

const GB = 1_000_000_000;
const NOW = new Date(2026, 6, 27, 17, 46, 0);
const clock: Clock = { now: () => NOW };

function snapshot(usedBytes: number): RouterSnapshot {
  return {
    month: {
      monthDownloadBytes: usedBytes,
      monthUploadBytes: 0,
      monthDurationSeconds: 27_960,
      monthLastClearTime: "2026-7-27",
    },
    traffic: {
      downloadRateBps: 2_355,
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

function configWithLimit(limitBytes: number | null): AppConfig {
  return { ...defaultConfig(), planLimitBytes: limitBytes };
}

/**
 * A live model for `usedBytes` against a 20 GB plan, unless told otherwise.
 *
 * The dial is measured from the carrier's own remaining volume, so consumption
 * is expressed here the way the carrier states it — an anchor holding what is
 * left, pinned to the same counter the snapshot reports so no delta applies.
 */
function modelUsing(
  usedBytes: number,
  limitBytes: number | null = 20 * GB,
): PopoverModel {
  return buildPopoverModel({
    result: { online: true, snapshot: snapshot(usedBytes) },
    lastReading: null,
    config: {
      ...configWithLimit(limitBytes),
      allowanceAnchor: {
        planLabel: "NET MONTH 200 000",
        remainingBytes: Math.max(0, (limitBytes ?? 20 * GB) - usedBytes),
        expiresAt: new Date(2026, 7, 12),
        routerMonthBytes: usedBytes,
        routerClearTime: "2026-7-27",
        syncedAt: NOW,
      },
    },
    clock,
  });
}

/** A live model whose last plan-limit entry was refused for `reason`. */
function modelRefusing(reason: PlanLimitRefusal): PopoverModel {
  return buildPopoverModel({
    result: { online: true, snapshot: snapshot(10 * GB) },
    lastReading: null,
    config: configWithLimit(null),
    planLimitProblem: reason,
    clock,
  });
}

function apply(model: PopoverModel): void {
  window.applyPopoverModel(model);
}

function dial(): HTMLElement {
  const host = document.querySelector<HTMLElement>("[data-dial]");

  if (host === null) {
    throw new Error("the page has no dial");
  }

  return host;
}

function arc(): SVGCircleElement {
  const element = dial().querySelector<SVGCircleElement>("[data-arc]");

  if (element === null) {
    throw new Error("the dial has no arc");
  }

  return element;
}

/**
 * The arc's drawn length and the full sweep it is measured against — the dash
 * and the gap the renderer wrote, both rounded the same way, so the two are
 * comparable without a rounding allowance. That the gap really is the ring's
 * circumference is asserted separately.
 */
function sweep(): { drawn: number; whole: number } {
  const dashArray = arc().getAttribute("stroke-dasharray") ?? "";
  const [drawn, whole] = dashArray.split(/[\s,]+/).map(Number);

  if (
    drawn === undefined ||
    whole === undefined ||
    Number.isNaN(drawn) ||
    Number.isNaN(whole)
  ) {
    throw new Error(`the arc has no usable stroke-dasharray: "${dashArray}"`);
  }

  return { drawn, whole };
}

/** The circumference of the circle the arc is stroked around. */
function circumference(): number {
  return 2 * Math.PI * Number(arc().getAttribute("r"));
}

/** The share of the ring the arc covers, 0 to 1. */
function sweepFraction(): number {
  const { drawn, whole } = sweep();

  return drawn / whole;
}

function textOf(field: string): string {
  return (
    document.querySelector<HTMLElement>(`[data-field="${field}"]`)
      ?.textContent ?? ""
  );
}

/** One of the two throughput series the popover charts. */
type Series = "download" | "upload";

const POLL_INTERVAL_MS = 2_000;

/**
 * A recorded history from two parallel series of bytes-per-second readings.
 * Offline polls record nothing, so every sample here is a poll that answered.
 */
function samplesOf(download: number[], upload: number[]): RateSample[] {
  return download.map((value, index) => ({
    downloadBytesPerSecond: value,
    uploadBytesPerSecond: upload[index] ?? 0,
    at: new Date(NOW.getTime() - (download.length - index) * POLL_INTERVAL_MS),
  }));
}

/** A live model carrying `download`/`upload` as its recent throughput. */
function modelCharting(download: number[], upload: number[]): PopoverModel {
  return buildPopoverModel({
    result: { online: true, snapshot: snapshot(10 * GB) },
    lastReading: null,
    config: configWithLimit(20 * GB),
    history: samplesOf(download, upload),
    clock,
  });
}

/** The same history, but the router has stopped answering. */
function offlineModelCharting(
  download: number[],
  upload: number[],
): PopoverModel {
  return buildPopoverModel({
    result: { online: false, reason: "unreachable" },
    lastReading: {
      snapshot: snapshot(10 * GB),
      at: new Date(NOW.getTime() - 60_000),
    },
    config: configWithLimit(20 * GB),
    history: samplesOf(download, upload),
    clock,
  });
}

function spark(series: Series): HTMLElement {
  const host = document.querySelector<HTMLElement>(`[data-spark="${series}"]`);

  if (host === null) {
    throw new Error(`the page has no ${series} sparkline`);
  }

  return host;
}

function sparkLine(series: Series): SVGPolylineElement {
  const line = spark(series).querySelector<SVGPolylineElement>("polyline");

  if (line === null) {
    throw new Error(`the ${series} sparkline has no polyline`);
  }

  return line;
}

/** The plotted points, parsed back out of the `points` attribute. */
function pointsOf(series: Series): Array<{ x: number; y: number }> {
  const raw = sparkLine(series).getAttribute("points") ?? "";

  return raw
    .trim()
    .split(/\s+/)
    .filter((pair) => pair !== "")
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);

      if (x === undefined || y === undefined) {
        throw new Error(
          `the ${series} sparkline has a broken point: "${pair}"`,
        );
      }

      return { x, y };
    });
}

function heightsOf(series: Series): number[] {
  return pointsOf(series).map((point) => point.y);
}

beforeEach(async () => {
  loadPage();
  await import("../../src/renderer/popover.js");
});

describe("the usage dial — the sweep", () => {
  it("draws nothing at 0% of the plan", () => {
    apply(modelUsing(0));

    expect(sweep().drawn).toBe(0);
  });

  it("draws half the ring at 50% of the plan", () => {
    apply(modelUsing(10 * GB));

    expect(sweepFraction()).toBeCloseTo(0.5, 3);
  });

  it("draws the whole ring at 100% of the plan", () => {
    apply(modelUsing(20 * GB));

    expect(sweepFraction()).toBeCloseTo(1, 3);
  });

  it("measures the sweep against the ring's own circumference", () => {
    apply(modelUsing(20 * GB));

    expect(sweep().whole).toBeCloseTo(circumference(), 2);
  });

  it("stops at the whole ring once the plan is spent rather than wrapping round", () => {
    // The carrier's remaining never goes below zero, so 100% is the ceiling —
    // there is no overrun the dial could be asked to draw.
    apply(modelUsing(24 * GB));

    expect(sweepFraction()).toBeCloseTo(1, 3);
    expect(sweep().drawn).toBeLessThanOrEqual(sweep().whole);
  });

  it("reads 100% once the plan is spent", () => {
    apply(modelUsing(24 * GB));

    expect(textOf("percent")).toBe("100%");
  });

  it("shrinks the ring back when usage is read against a larger plan", () => {
    apply(modelUsing(20 * GB));
    apply(modelUsing(5 * GB));

    expect(sweepFraction()).toBeCloseTo(0.25, 3);
  });
});

describe("the usage dial — no plan limit configured", () => {
  beforeEach(() => {
    apply(modelUsing(5 * GB, null));
  });

  it("flags the dial unset for the stylesheet", () => {
    expect(document.documentElement.dataset["limit"]).toBe("unset");
  });

  it("shows no percentage", () => {
    expect(textOf("percent")).not.toMatch(/\d/);
  });

  it("draws no arc", () => {
    expect(sweep().drawn).toBe(0);
  });

  it("still asks the user to set a limit", () => {
    expect(textOf("prompt")).toMatch(/limit/i);
  });
});

describe("the usage dial — the usage state", () => {
  it("puts the state from the model on the root element", () => {
    apply(modelUsing(5 * GB));
    expect(document.documentElement.dataset["usage"]).toBe("ok");

    apply(modelUsing(19 * GB));
    expect(document.documentElement.dataset["usage"]).toBe("warn");

    apply(modelUsing(24 * GB));
    expect(document.documentElement.dataset["usage"]).toBe("over");

    apply(modelUsing(5 * GB, null));
    expect(document.documentElement.dataset["usage"]).toBe("unknown");
  });

  it("colours the dial differently in each of the four states", () => {
    // jsdom has no cascade for SVG paint, so distinctness is read off the
    // stylesheet: one custom property, set to a different colour per state.
    const colours = [
      /:root\s*\{[^}]*--dial:\s*([^;]+);/,
      /:root\[data-usage="warn"\][^{]*\{[^}]*--dial:\s*([^;]+);/,
      /:root\[data-usage="over"\][^{]*\{[^}]*--dial:\s*([^;]+);/,
      /:root\[data-limit="unset"\][^{]*\{[^}]*--dial:\s*([^;]+);/,
    ].map((pattern) => pattern.exec(POPOVER_CSS)?.[1]?.trim());

    expect(colours.every((colour) => colour !== undefined)).toBe(true);
    expect(new Set(colours).size).toBe(4);
  });

  it("paints the arc with that custom property rather than a fixed colour", () => {
    expect(POPOVER_CSS).toMatch(/\.dial-arc\s*\{[^}]*stroke:\s*var\(--dial\)/);
  });
});

describe("the usage dial — the accessible label", () => {
  it("states the share of the plan and the absolute usage", () => {
    apply(modelUsing(10 * GB));

    const label = dial().getAttribute("aria-label") ?? "";

    expect(label).toContain("50%");
    expect(label).toContain("10.00 Go");
  });

  it("names the usage and the missing limit when no plan is configured", () => {
    apply(modelUsing(5 * GB, null));

    const label = dial().getAttribute("aria-label") ?? "";

    // Without a cap there is no consumed figure to name — the share of a plan
    // nobody has stated is the thing that is missing, and the thing to say.
    expect(label).toMatch(/limit/i);
    expect(label).not.toMatch(/\d+(\.\d+)?\s*[GMK]?o\b/);
  });

  it("is announced as one image rather than as loose shapes", () => {
    apply(modelUsing(10 * GB));

    expect(dial().getAttribute("role")).toBe("img");
    expect(arc().closest("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("re-labels itself when a new model arrives", () => {
    apply(modelUsing(10 * GB));
    apply(modelUsing(2 * GB));

    expect(dial().getAttribute("aria-label")).toContain("10%");
  });
});

describe("the usage dial — repeated updates", () => {
  it("updates the SVG in place instead of appending another one", () => {
    apply(modelUsing(5 * GB));
    apply(modelUsing(10 * GB));
    apply(modelUsing(15 * GB));

    expect(dial().querySelectorAll("svg")).toHaveLength(1);
    expect(dial().querySelectorAll("[data-arc]")).toHaveLength(1);
  });
});

describe("the popover page", () => {
  it("no longer draws the month as a flat bar", () => {
    expect(INDEX_HTML).not.toContain("data-fill");
    expect(POPOVER_CSS).not.toMatch(/\.bar(-fill)?\s*[,{]/);
  });

  it("keeps the dial and the sparklines small enough for the panel to fit its window", () => {
    // No layout engine, so this is a budget rather than a measurement: the
    // room everything other than the dial and the two sparklines takes, which
    // is 30px of body padding, ~29px of header and its rule, 22px of padding
    // around the dial, ~56px for the allowance strip and its rule, 23px of rule
    // and spacing above the sparklines, ~160px for the three-row stats grid
    // with its own rule and ~46px for the sync row — call it 330px, rounded up
    // to 350 so a stray line of text does not silently overrun. Anything that
    // outgrows what is left pushes the panel past POPOVER_HEIGHT and raises a
    // scrollbar, which a popover has no room for. The password prompt is
    // `hidden` until it is needed, so it costs nothing here.
    //
    // The plan-size field and its refusal line sit in the column beside the
    // dial, not under it, so they are free until that column outgrows the
    // dial's own height — which is what the extra 10px covers.
    const CHROME_HEIGHT = 350;
    const dialSize = /--dial-size:\s*(\d+)px/.exec(POPOVER_CSS)?.[1];
    const sparkSize = /--spark-height:\s*(\d+)px/.exec(POPOVER_CSS)?.[1];
    const SPARK_ROWS = 2;
    const SPARK_GAP = 6;

    expect(dialSize).toBeDefined();
    expect(sparkSize).toBeDefined();
    expect(
      Number(dialSize) +
        Number(sparkSize) * SPARK_ROWS +
        SPARK_GAP +
        CHROME_HEIGHT,
    ).toBeLessThanOrEqual(POPOVER_HEIGHT);
  });

  it("still fills every plain text field from the model", () => {
    apply(modelUsing(10 * GB));

    expect(textOf("monthTotal")).toBe("10.00 Go");
    expect(textOf("carrier")).toBe("Yas");
    expect(textOf("signal")).toBe("4/5");
    expect(textOf("connectedDevices")).toBe("3");
    expect(textOf("downloadRate")).toBe("2.4 Ko/s");
  });
});

describe("the stat tiles", () => {
  /** Every tile's term, in the order the panel lays them out. */
  function tileTerms(): string[] {
    return [...document.querySelectorAll(".stat dt")].map(
      (term) => term.textContent?.trim() ?? "",
    );
  }

  it("no longer offers a billing-cycle countdown", () => {
    // It came from the router's `StartDay`, which the carrier never confirmed
    // and which disagreed with the expiry date sitting two tiles away.
    apply(modelUsing(10 * GB));

    expect(tileTerms()).not.toContain("Resets in");
    expect(document.body.textContent).not.toContain("Resets in");
    expect(document.querySelector('[data-field="daysUntilReset"]')).toBeNull();
  });

  it("keeps the carrier's own expiry, which is the figure that governs", () => {
    apply(modelUsing(10 * GB));

    expect(tileTerms()).toContain("Valid for");
    expect(textOf("allowanceDaysLeft")).not.toBe("");
  });

  it("lays out an odd number of tiles without leaving an empty one", () => {
    apply(modelUsing(10 * GB));

    const tiles = [...document.querySelectorAll(".stat")];

    expect(tiles).toHaveLength(5);

    // Every tile still carries both halves — a term and a value bound to the
    // model. A cell left behind by the removal would show up as a missing one.
    for (const tile of tiles) {
      expect(tile.querySelector("dt")?.textContent?.trim()).toBeTruthy();
      expect(tile.querySelector("dd[data-field]")).not.toBeNull();
    }
  });
});

describe("the rate sparklines — the plotted points", () => {
  it("draws one point per sample in each series", () => {
    apply(modelCharting([0, 400, 800, 1_200, 600], [0, 100, 50, 300, 200]));

    expect(pointsOf("download")).toHaveLength(5);
    expect(pointsOf("upload")).toHaveLength(5);
  });

  it("draws each series as a single polyline", () => {
    apply(modelCharting([0, 400, 800], [0, 100, 50]));

    expect(spark("download").querySelectorAll("polyline")).toHaveLength(1);
    expect(spark("upload").querySelectorAll("polyline")).toHaveLength(1);
  });

  it("plots the samples left to right, oldest first", () => {
    apply(modelCharting([0, 400, 800, 1_200], [0, 0, 0, 0]));

    const xs = pointsOf("download").map((point) => point.x);

    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    expect(new Set(xs).size).toBe(xs.length);
  });

  it("writes only finite coordinates", () => {
    apply(modelCharting([0, 400, 800], [0, 100, 50]));

    for (const series of ["download", "upload"] as const) {
      for (const { x, y } of pointsOf(series)) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });
});

describe("the rate sparklines — the shared vertical scale", () => {
  it("measures both series against the same peak", () => {
    // Download tops out at 1 000 B/s, upload at half of that. On one shared
    // scale the upload crest lands halfway between the baseline and the
    // download crest; scaled per series it would reach the same height.
    apply(modelCharting([0, 1_000], [0, 500]));

    const [downBase, downCrest] = heightsOf("download");
    const [upBase, upCrest] = heightsOf("upload");

    expect(upBase).toBe(downBase);
    expect(upCrest).toBeCloseTo((downBase + downCrest) / 2, 3);
    // Lower on the page is a larger y, so half the height is a larger number.
    expect(upCrest).toBeGreaterThan(downCrest);
  });

  it("puts equal rates in the two series at the same height", () => {
    apply(modelCharting([0, 700, 1_000], [0, 700, 250]));

    expect(heightsOf("upload")[1]).toBeCloseTo(heightsOf("download")[1], 6);
  });

  it("takes the scale from a peak the upload series alone sets", () => {
    // The peak is the largest rate across *both* series: a download that never
    // exceeds a quarter of the upload crest must be drawn near the baseline.
    apply(modelCharting([0, 250], [0, 1_000]));

    const [base, crest] = heightsOf("download");
    const [, upCrest] = heightsOf("upload");

    expect(crest).toBeCloseTo(base - (base - upCrest) / 4, 3);
  });
});

describe("the rate sparklines — an idle connection", () => {
  it("draws an all-zero history as a flat line on the baseline", () => {
    apply(modelCharting([0, 800, 400], [0, 0, 0]));

    // The baseline is where a zero sample sits when there *is* a peak.
    const [baseline] = heightsOf("download");

    apply(modelCharting([0, 0, 0, 0], [0, 0, 0, 0]));

    const flat = heightsOf("download");

    expect(flat).toHaveLength(4);
    expect(flat.every((y) => Number.isFinite(y))).toBe(true);
    expect(new Set(flat).size).toBe(1);
    expect(flat[0]).toBeCloseTo(baseline, 6);
    expect(heightsOf("upload")).toEqual(flat);
  });

  it("still renders both polylines when nothing is moving", () => {
    apply(modelCharting([0, 0, 0], [0, 0, 0]));

    expect(spark("download").getAttribute("data-empty")).toBe("false");
    expect(sparkLine("download").getAttribute("points")).not.toBe("");
  });
});

describe("the rate sparklines — too little history to draw", () => {
  it("renders the empty state with no samples at all", () => {
    apply(modelCharting([], []));

    expect(spark("download").getAttribute("data-empty")).toBe("true");
    expect(spark("upload").getAttribute("data-empty")).toBe("true");
    expect(pointsOf("download")).toHaveLength(0);
    expect(pointsOf("upload")).toHaveLength(0);
  });

  it("renders the empty state with a single sample rather than a stub path", () => {
    apply(modelCharting([500], [200]));

    expect(spark("download").getAttribute("data-empty")).toBe("true");
    expect(pointsOf("download")).toHaveLength(0);
  });

  it("starts drawing as soon as there are two samples", () => {
    apply(modelCharting([500, 700], [200, 100]));

    expect(spark("download").getAttribute("data-empty")).toBe("false");
    expect(pointsOf("download")).toHaveLength(2);
  });

  it("hides the line and shows the empty state through the stylesheet", () => {
    expect(POPOVER_CSS).toMatch(/\.spark\[data-empty="true"\][^{]*\{[^}]*\}/);
  });
});

describe("the rate sparklines — the current rate beside each line", () => {
  beforeEach(() => {
    apply(modelCharting([0, 400, 2_355], [0, 100, 0]));
  });

  it("labels the download line with the model's formatted rate", () => {
    expect(textOf("downloadRate")).toBe("2.4 Ko/s");
    expect(textOf("uploadRate")).toBe("0 o/s");
  });

  it("puts each rate in the same row as its own sparkline", () => {
    for (const series of ["download", "upload"] as const) {
      const row = spark(series).closest(".rate");

      expect(row).not.toBeNull();
      expect(row?.querySelector(`[data-field="${series}Rate"]`)).not.toBeNull();
    }
  });

  it("no longer lists the live rates as plain stats", () => {
    expect(INDEX_HTML).not.toContain("Down now");
    expect(INDEX_HTML).not.toContain("Up now");
  });
});

describe("the rate sparklines — repeated updates", () => {
  it("replaces the points rather than accumulating them", () => {
    apply(modelCharting([0, 100, 200, 300, 400], [0, 10, 20, 30, 40]));
    apply(modelCharting([0, 100, 200], [0, 10, 20]));

    expect(pointsOf("download")).toHaveLength(3);
    expect(pointsOf("upload")).toHaveLength(3);
  });

  it("updates the SVG in place instead of appending another one", () => {
    apply(modelCharting([0, 100, 200], [0, 10, 20]));
    apply(modelCharting([0, 100, 200], [0, 10, 20]));
    apply(modelCharting([0, 100, 200], [0, 10, 20]));

    expect(spark("download").querySelectorAll("svg")).toHaveLength(1);
    expect(spark("upload").querySelectorAll("svg")).toHaveLength(1);
  });

  it("redraws the shape rather than leaving the previous one in place", () => {
    apply(modelCharting([0, 1_000, 1_000], [0, 0, 0]));
    const rising = heightsOf("download");

    apply(modelCharting([0, 1_000, 0], [0, 0, 0]));
    const falling = heightsOf("download");

    expect(falling).toHaveLength(3);
    expect(falling[2]).not.toBeCloseTo(rising[2], 3);
    expect(falling[2]).toBeCloseTo(falling[0], 6);
  });
});

describe("the rate sparklines — an unreachable router", () => {
  const DOWNLOAD = [0, 400, 800, 1_200];
  const UPLOAD = [0, 100, 50, 300];

  it("keeps the last known shape rather than blanking it", () => {
    apply(modelCharting(DOWNLOAD, UPLOAD));

    const before = pointsOf("download");

    apply(offlineModelCharting(DOWNLOAD, UPLOAD));

    expect(pointsOf("download")).toEqual(before);
    expect(spark("download").getAttribute("data-empty")).toBe("false");
  });

  it("flags the page stale so the lines are drawn in the stale style", () => {
    apply(offlineModelCharting(DOWNLOAD, UPLOAD));

    expect(document.documentElement.dataset["stale"]).toBe("true");
  });

  it("styles a stale line differently from a live one", () => {
    expect(POPOVER_CSS).toMatch(
      /:root\[data-stale="true"\]\s+\.spark-line\s*\{[^}]*\}/,
    );
  });
});

/** The anchor a successful sync leaves behind: 100 Go left, expiring 12 August. */
const ANCHOR: AllowanceAnchor = {
  planLabel: "NET MONTH 200 000",
  remainingBytes: 100_000_000_000,
  expiresAt: new Date(2026, 7, 12),
  routerMonthBytes: 1_000_000_000,
  routerClearTime: "2026-7-27",
  syncedAt: new Date(NOW.getTime() - 5 * 60_000),
};

/**
 * A live model with a sync state, and optionally an anchor. `clearTime` is what
 * makes an anchor stale: a counter that restarted under it.
 */
function modelSyncing(
  sync: SyncState,
  anchor?: AllowanceAnchor,
  clearTime = "2026-7-27",
): PopoverModel {
  const taken = snapshot(11_000_000_000);

  return buildPopoverModel({
    result: {
      online: true,
      snapshot: {
        ...taken,
        month: { ...taken.month, monthLastClearTime: clearTime },
      },
    },
    lastReading: null,
    config: {
      ...configWithLimit(20 * GB),
      ...(anchor === undefined ? {} : { allowanceAnchor: anchor }),
      planTotalBytes: 200_000_000_000,
    },
    sync,
    clock,
  });
}

interface FakeBridge {
  sync: ReturnType<typeof vi.fn>;
  savePassword: ReturnType<typeof vi.fn>;
  setPlanLimit: ReturnType<typeof vi.fn>;
}

/** The preload bridge, replaced by a recorder — no Electron, no IPC. */
function stubBridge(): FakeBridge {
  const bridge: FakeBridge = {
    sync: vi.fn(),
    savePassword: vi.fn(),
    setPlanLimit: vi.fn(),
  };

  window.popoverBridge = bridge;

  return bridge;
}

function syncButton(): HTMLButtonElement {
  const button = document.querySelector<HTMLButtonElement>("[data-sync]");

  if (button === null) {
    throw new Error("the panel has no Sync button");
  }

  return button;
}

function passwordPrompt(): HTMLElement {
  const prompt = document.querySelector<HTMLElement>("[data-password-prompt]");

  if (prompt === null) {
    throw new Error("the panel has no password prompt");
  }

  return prompt;
}

describe("the Sync button — pressing it", () => {
  let bridge: FakeBridge;

  beforeEach(() => {
    bridge = stubBridge();
    apply(modelSyncing({ phase: "idle" }, ANCHOR));
  });

  it("is a real button rather than a decorated span", () => {
    expect(syncButton().tagName).toBe("BUTTON");
    expect(syncButton().getAttribute("type")).toBe("button");
  });

  it("sends exactly one sync request when pressed", () => {
    syncButton().click();

    expect(bridge.sync).toHaveBeenCalledTimes(1);
  });

  it("sends one request per press, not one per model pushed since", () => {
    apply(modelSyncing({ phase: "idle" }, ANCHOR));
    apply(modelSyncing({ phase: "idle" }, ANCHOR));
    syncButton().click();

    expect(bridge.sync).toHaveBeenCalledTimes(1);
  });
});

describe("the Sync button — while a sync is in flight", () => {
  let bridge: FakeBridge;

  beforeEach(() => {
    bridge = stubBridge();
    apply(modelSyncing({ phase: "running", step: "signing-in" }));
  });

  it("is disabled", () => {
    expect(syncButton().disabled).toBe(true);
  });

  it("sends nothing on a second press", () => {
    syncButton().click();

    expect(bridge.sync).not.toHaveBeenCalled();
  });

  it("names the step it is on rather than freezing the panel", () => {
    expect(textOf("syncStatus")).toMatch(/sign/i);

    apply(modelSyncing({ phase: "running", step: "asking-carrier" }));

    expect(textOf("syncStatus")).toMatch(/carrier/i);
  });

  it("becomes pressable again once the sync settles", () => {
    apply(modelSyncing({ phase: "idle" }, ANCHOR));

    expect(syncButton().disabled).toBe(false);

    syncButton().click();

    expect(bridge.sync).toHaveBeenCalledTimes(1);
  });
});

describe("the allowance — a successful sync", () => {
  beforeEach(() => {
    stubBridge();
    apply(modelSyncing({ phase: "idle" }, ANCHOR));
  });

  it("renders the exact remaining volume in octets", () => {
    expect(textOf("allowanceRemaining")).toBe("90.00 Go");
  });

  it("renders the expiry as a date and the days left", () => {
    expect(textOf("allowanceExpires")).toBe("12/08/2026");
    expect(textOf("allowanceDaysLeft")).toBe("16 days");
  });

  it("names the carrier's own offer", () => {
    expect(textOf("allowancePlan")).toBe("NET MONTH 200 000");
  });

  it("says how long ago the sync happened", () => {
    expect(textOf("allowanceSynced")).toBe("Synced 5m ago");
  });

  it("refreshes that age from the next poll push", () => {
    const later = buildPopoverModel({
      result: { online: true, snapshot: snapshot(11_000_000_000) },
      lastReading: null,
      config: {
        ...configWithLimit(20 * GB),
        allowanceAnchor: ANCHOR,
        planTotalBytes: 200_000_000_000,
      },
      clock: { now: () => new Date(NOW.getTime() + 60 * 60_000) },
    });

    apply(later);

    expect(textOf("allowanceSynced")).toBe("Synced 1h 5m ago");
  });

  it("carries no re-sync marker while the anchor holds", () => {
    expect(textOf("allowanceNote")).toBe("");
    expect(syncButton().dataset["attention"]).toBe("false");
  });
});

describe("the allowance — a stale anchor", () => {
  beforeEach(() => {
    stubBridge();
    // The router's counter restarted under the anchor: the figure is the last
    // one that could honestly be computed, and it has to be marked as such.
    apply(modelSyncing({ phase: "idle" }, ANCHOR, "2026-8-1"));
  });

  it("still renders the last computed figure", () => {
    expect(textOf("allowanceRemaining")).toBe("100.00 Go");
  });

  it("never puts the config-limit estimate in its place", () => {
    // 11 Go of a 20 Go configured limit is what the dial falls back to; the
    // allowance figure must stay the carrier's, not that.
    expect(textOf("allowanceRemaining")).not.toBe("11.00 Go");
    expect(textOf("allowanceRemaining")).not.toBe("9.00 Go");
    expect(textOf("allowanceRemaining")).toBe("100.00 Go");
  });

  it("marks it with words, not with colour alone", () => {
    expect(textOf("allowanceNote")).toMatch(/sync/i);
    expect(document.documentElement.dataset["allowance"]).toBe("stale");
  });

  it("puts the Sync button into an attention state", () => {
    expect(syncButton().dataset["attention"]).toBe("true");
  });

  it("styles the attention state as well as naming it", () => {
    expect(POPOVER_CSS).toMatch(
      /\.sync-button\[data-attention="true"\]\s*\{[^}]*\}/,
    );
  });
});

describe("the Sync button — a sync that failed", () => {
  const REASONS: readonly [SyncFailure, RegExp][] = [
    ["busy", /busy/i],
    ["timeout", /time/i],
    ["wrong-credential", /password/i],
    ["account-locked", /lock/i],
    ["no-password", /password/i],
    ["unreachable", /router/i],
  ];

  beforeEach(() => {
    stubBridge();
  });

  for (const [reason, wording] of REASONS) {
    it(`renders "${reason}" as panel text the user can read`, () => {
      apply(modelSyncing({ phase: "failed", reason }));

      expect(textOf("syncStatus")).toMatch(wording);
    });
  }

  it("gives each reason its own line rather than one catch-all", () => {
    const rendered = REASONS.map(([reason]) => {
      apply(modelSyncing({ phase: "failed", reason }));

      return textOf("syncStatus");
    });

    expect(new Set(rendered).size).toBe(REASONS.length);
  });

  it("clears the message once a later sync succeeds", () => {
    apply(modelSyncing({ phase: "failed", reason: "timeout" }));
    apply(modelSyncing({ phase: "idle" }, ANCHOR));

    expect(textOf("syncStatus")).toBe("");
  });
});

describe("the password prompt", () => {
  let bridge: FakeBridge;

  beforeEach(() => {
    bridge = stubBridge();
  });

  it("stays out of the way while a password is stored", () => {
    apply(modelSyncing({ phase: "idle" }, ANCHOR));

    expect(passwordPrompt().hidden).toBe(true);
  });

  it("appears when the panel reports there is no password", () => {
    apply(modelSyncing({ phase: "needs-password" }));

    expect(passwordPrompt().hidden).toBe(false);
    expect(textOf("syncStatus")).toMatch(/password/i);
  });

  it("saves what was entered rather than starting a dialogue itself", () => {
    apply(modelSyncing({ phase: "needs-password" }));

    const username = document.querySelector<HTMLInputElement>(
      "[data-password-username]",
    );
    const password = document.querySelector<HTMLInputElement>(
      "[data-password-password]",
    );

    expect(username).not.toBeNull();
    expect(password?.type).toBe("password");

    if (username === null || password === null) return;

    username.value = "admin";
    password.value = "hunter2";
    passwordPrompt().dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );

    expect(bridge.savePassword).toHaveBeenCalledWith({
      username: "admin",
      password: "hunter2",
    });
    expect(bridge.sync).not.toHaveBeenCalled();
  });

  it("does not leave the typed password sitting in the field", () => {
    apply(modelSyncing({ phase: "needs-password" }));

    const password = document.querySelector<HTMLInputElement>(
      "[data-password-password]",
    );

    if (password === null) throw new Error("no password field");

    password.value = "hunter2";
    passwordPrompt().dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );

    expect(password.value).toBe("");
  });
});

describe("the plan limit field", () => {
  let bridge: FakeBridge;

  function form(): HTMLFormElement {
    const element =
      document.querySelector<HTMLFormElement>("[data-plan-limit]");

    if (element === null) {
      throw new Error("the panel has no plan limit field");
    }

    return element;
  }

  function input(): HTMLInputElement {
    const element = document.querySelector<HTMLInputElement>(
      "[data-plan-limit-input]",
    );

    if (element === null) {
      throw new Error("the plan limit field has no input");
    }

    return element;
  }

  function submit(typed: string): void {
    input().value = typed;
    form().dispatchEvent(
      new window.Event("submit", { bubbles: true, cancelable: true }),
    );
  }

  beforeEach(() => {
    bridge = stubBridge();
    apply(modelUsing(10 * GB));
  });

  it("sends what was typed, without working out what it means", () => {
    // The renderer converts nothing: `150` goes over as `150`, and the main
    // process is the one place that knows a Go is 1000³ bytes.
    submit("150");

    expect(bridge.setPlanLimit).toHaveBeenCalledWith("150");
  });

  it("sends a refusable entry too, rather than judging it itself", () => {
    // The sentence the user reads is decided in the main process, like every
    // other string on this panel — so even nonsense makes the trip.
    for (const typed of ["", "abc", "0", "-5"]) {
      bridge.setPlanLimit.mockClear();
      submit(typed);

      expect(bridge.setPlanLimit, typed).toHaveBeenCalledWith(typed);
    }
  });

  it("never navigates on submit — the page is the app", () => {
    const event = new window.Event("submit", {
      bubbles: true,
      cancelable: true,
    });

    form().dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("shows the stored cap so it can be corrected rather than retyped", () => {
    apply(modelUsing(10 * GB, 150 * GB));

    expect(input().value).toBe("150");
  });

  it("leaves the field empty while no cap is stored", () => {
    apply(modelUsing(10 * GB, null));

    expect(input().value).toBe("");
  });

  it("does not overwrite what is being typed when a poll lands", () => {
    // A poll pushes a fresh model every couple of seconds while the panel is
    // open. Writing the stored value back over a half-typed one would make the
    // field unusable.
    input().focus();
    input().value = "15";

    apply(modelUsing(10 * GB, 150 * GB));

    expect(input().value).toBe("15");
  });

  it("shows the reason an entry was refused", () => {
    apply(modelRefusing("not-a-number"));

    expect(textOf("planLimitError")).not.toBe("");
  });

  it("says nothing when there is nothing to complain about", () => {
    expect(textOf("planLimitError")).toBe("");
  });

  it("is reachable without a mouse and says what it is for", () => {
    expect(input().tabIndex).toBeGreaterThanOrEqual(0);

    const name =
      input().getAttribute("aria-label") ??
      document.querySelector(`label[for="${input().id}"]`)?.textContent ??
      "";

    expect(name.trim()).not.toBe("");
  });
});

describe("the Sync control — reaching it without a mouse", () => {
  beforeEach(() => {
    stubBridge();
    apply(modelSyncing({ phase: "idle" }, ANCHOR));
  });

  it("is in the tab order", () => {
    expect(syncButton().tabIndex).toBeGreaterThanOrEqual(0);
    expect(syncButton().getAttribute("tabindex")).not.toBe("-1");
  });

  it("carries an accessible name that says what it does", () => {
    const name =
      syncButton().getAttribute("aria-label") ?? syncButton().textContent ?? "";

    expect(name.trim()).not.toBe("");
    expect(name).toMatch(/sync/i);
  });

  it("announces the progress line as it changes", () => {
    const status = document.querySelector<HTMLElement>(
      '[data-field="syncStatus"]',
    );

    expect(status?.getAttribute("role")).toBe("status");
  });

  it("announces the stale marker as text rather than as a colour", () => {
    apply(modelSyncing({ phase: "idle" }, ANCHOR, "2026-8-1"));

    const note = document.querySelector<HTMLElement>(
      '[data-field="allowanceNote"]',
    );

    expect(note?.textContent?.trim()).not.toBe("");
    expect(note?.getAttribute("aria-hidden")).not.toBe("true");
  });
});
