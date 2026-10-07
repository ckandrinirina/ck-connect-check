import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  TRAY_BADGE_SIZE,
  renderTrayBadge,
  type TrayBadgeBitmap,
} from "../../src/main/tray-badge.js";

/** One pixel of an RGBA bitmap, read back as its four channels. */
function pixel(bitmap: TrayBadgeBitmap, x: number, y: number) {
  const at = (y * bitmap.width + x) * 4;
  const [r, g, b, a] = bitmap.data.slice(at, at + 4);

  return { r, g, b, a };
}

/** Rec. 601 luma — how light a pixel reads, whatever its channel order. */
function luma({ r, g, b }: { r: number; g: number; b: number }): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Every opaque pixel bright enough to be part of a digit. */
function inkPixels(bitmap: TrayBadgeBitmap): { x: number; y: number }[] {
  const ink: { x: number; y: number }[] = [];

  for (let y = 0; y < bitmap.height; y += 1) {
    for (let x = 0; x < bitmap.width; x += 1) {
      const p = pixel(bitmap, x, y);

      if (p.a > 0 && luma(p) > 200) {
        ink.push({ x, y });
      }
    }
  }

  return ink;
}

describe("renderTrayBadge", () => {
  it("draws a 32×32 RGBA bitmap", () => {
    const badge = renderTrayBadge(42);

    expect(TRAY_BADGE_SIZE).toBe(32);
    expect(badge.width).toBe(32);
    expect(badge.height).toBe(32);
    expect(badge.data).toHaveLength(32 * 32 * 4);
  });

  it.each([7, 42, 100])("draws %i as something, not a blank square", (n) => {
    expect(inkPixels(renderTrayBadge(n)).length).toBeGreaterThan(0);
  });

  it("draws 7, 42 and 100 as three different images", () => {
    const [seven, fortyTwo, hundred] = [7, 42, 100].map((n) =>
      Buffer.from(renderTrayBadge(n).data).toString("hex"),
    );

    expect(new Set([seven, fortyTwo, hundred]).size).toBe(3);
  });

  it("keeps all three digits of 100 inside the frame", () => {
    // The widest figure there is: a digit cut off at the edge would read as 10.
    const ink = inkPixels(renderTrayBadge(100));
    const xs = ink.map(({ x }) => x);
    const ys = ink.map(({ y }) => y);

    expect(Math.min(...xs)).toBeGreaterThan(0);
    expect(Math.max(...xs)).toBeLessThan(TRAY_BADGE_SIZE - 1);
    expect(Math.min(...ys)).toBeGreaterThan(0);
    expect(Math.max(...ys)).toBeLessThan(TRAY_BADGE_SIZE - 1);
  });

  it("draws 100 as three separate digits", () => {
    // Columns with ink, grouped into runs: three digits are three runs.
    const ink = inkPixels(renderTrayBadge(100));
    const columns = [...new Set(ink.map(({ x }) => x))].sort((a, b) => a - b);
    const runs = columns.filter((x, i) => i === 0 || columns[i - 1] !== x - 1);

    expect(runs).toHaveLength(3);
  });

  it("draws the digits light on a dark background", () => {
    // Light on dark reads on a dark taskbar and a light one alike.
    const badge = renderTrayBadge(42);
    const centre = pixel(badge, 16, 2);

    expect(centre.a).toBe(255);
    expect(luma(centre)).toBeLessThan(96);
    for (const { x, y } of inkPixels(badge)) {
      expect(pixel(badge, x, y).a).toBe(255);
    }
  });

  it("rounds the background's corners", () => {
    const badge = renderTrayBadge(42);

    for (const [x, y] of [
      [0, 0],
      [31, 0],
      [0, 31],
      [31, 31],
    ]) {
      expect(pixel(badge, x, y).a).toBe(0);
    }
    // The middle of each edge is still background.
    expect(pixel(badge, 16, 0).a).toBe(255);
    expect(pixel(badge, 0, 16).a).toBe(255);
  });

  it("rounds a fractional share to the figure the title shows", () => {
    expect(renderTrayBadge(41.6).data).toEqual(renderTrayBadge(42).data);
  });

  it("draws no figure as a dash, unlike any number", () => {
    const dash = renderTrayBadge(null);
    const ink = inkPixels(dash);

    expect(ink.length).toBeGreaterThan(0);
    // A dash is one horizontal stroke: wider than it is tall.
    const width =
      Math.max(...ink.map(({ x }) => x)) - Math.min(...ink.map(({ x }) => x));
    const height =
      Math.max(...ink.map(({ y }) => y)) - Math.min(...ink.map(({ y }) => y));
    expect(width).toBeGreaterThan(height);
    for (const n of [0, 7, 42, 100]) {
      expect(dash.data).not.toEqual(renderTrayBadge(n).data);
    }
  });

  it("clamps a share outside 0–100 onto the nearest end", () => {
    expect(renderTrayBadge(130).data).toEqual(renderTrayBadge(100).data);
    expect(renderTrayBadge(-5).data).toEqual(renderTrayBadge(0).data);
  });

  it("does not import Electron", () => {
    // Pure image-building code, testable without a display.
    const source = readFileSync(
      fileURLToPath(new URL("../../src/main/tray-badge.ts", import.meta.url)),
      "utf8",
    );

    expect(source).not.toMatch(/from\s+["']electron["']/);
  });
});
