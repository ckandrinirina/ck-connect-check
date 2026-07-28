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

import { beforeEach, describe, expect, it } from "vitest";

import { defaultConfig, type AppConfig } from "../../src/config/defaults.js";
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
const POPOVER_HEIGHT = 380;

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

/** A live model for `usedBytes` against a 20 GB plan, unless told otherwise. */
function modelUsing(
  usedBytes: number,
  limitBytes: number | null = 20 * GB,
): PopoverModel {
  return buildPopoverModel({
    result: { online: true, snapshot: snapshot(usedBytes) },
    lastReading: null,
    config: configWithLimit(limitBytes),
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

/** The arc's drawn length and the full sweep it is measured against. */
function sweep(): { drawn: number; whole: number } {
  const dashArray = arc().getAttribute("stroke-dasharray") ?? "";
  const [drawn, gap] = dashArray.split(/[\s,]+/).map(Number);

  if (drawn === undefined || gap === undefined || Number.isNaN(drawn)) {
    throw new Error(`the arc has no usable stroke-dasharray: "${dashArray}"`);
  }

  const radius = Number(arc().getAttribute("r"));

  return { drawn, whole: 2 * Math.PI * radius };
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

  it("stops at the whole ring past the plan rather than wrapping round again", () => {
    apply(modelUsing(24 * GB));

    expect(sweepFraction()).toBeCloseTo(1, 3);
    expect(sweep().drawn).toBeLessThanOrEqual(sweep().whole);
  });

  it("still reports the real share past the plan, however full the ring is", () => {
    apply(modelUsing(24 * GB));

    expect(textOf("percent")).toBe("120%");
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
    expect(label).toContain("10.00 GB");
  });

  it("names the usage and the missing limit when no plan is configured", () => {
    apply(modelUsing(5 * GB, null));

    const label = dial().getAttribute("aria-label") ?? "";

    expect(label).toContain("5.00 GB");
    expect(label).toMatch(/limit/i);
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

  it("keeps the dial small enough for the panel to fit its window", () => {
    // No layout engine, so this is a budget rather than a measurement: the
    // header, the stats grid and the body padding are unchanged by the dial,
    // and this is the room they already take. A dial that outgrows what is
    // left would push the panel past POPOVER_HEIGHT and raise a scrollbar.
    const CHROME_HEIGHT = 240;
    const size = /--dial-size:\s*(\d+)px/.exec(POPOVER_CSS)?.[1];

    expect(size).toBeDefined();
    expect(Number(size) + CHROME_HEIGHT).toBeLessThanOrEqual(POPOVER_HEIGHT);
  });

  it("still fills every plain text field from the model", () => {
    apply(modelUsing(10 * GB));

    expect(textOf("monthTotal")).toBe("10.00 GB");
    expect(textOf("carrier")).toBe("Yas");
    expect(textOf("signal")).toBe("4/5");
    expect(textOf("connectedDevices")).toBe("3");
    expect(textOf("downloadRate")).toBe("2.4 KB/s");
  });
});
