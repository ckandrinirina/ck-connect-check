import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { pngsMatch } from "./png-pixels";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function repoPath(relativePath: string): string {
  return join(repoRoot, relativePath);
}

function readRepoFile(relativePath: string): string {
  return readFileSync(repoPath(relativePath), "utf8");
}

/**
 * The ten entries `iconutil` expects in an `.iconset`. The names are the
 * convention it reads, not a choice: five point sizes, each at 1x and 2x, which
 * is why 32, 256 and 512 pixels each appear twice under different names.
 */
const ICONSET_ENTRIES = [
  { file: "icon_16x16.png", pixels: 16 },
  { file: "icon_16x16@2x.png", pixels: 32 },
  { file: "icon_32x32.png", pixels: 32 },
  { file: "icon_32x32@2x.png", pixels: 64 },
  { file: "icon_128x128.png", pixels: 128 },
  { file: "icon_128x128@2x.png", pixels: 256 },
  { file: "icon_256x256.png", pixels: 256 },
  { file: "icon_256x256@2x.png", pixels: 512 },
  { file: "icon_512x512.png", pixels: 512 },
  { file: "icon_512x512@2x.png", pixels: 1024 },
] as const;

/** The point sizes the built `.icns` has to carry. */
const ICNS_POINT_SIZES = [16, 32, 128, 256, 512];

/** The sizes Windows picks from for the taskbar, Explorer and Setup.exe. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** One artwork per filled bar count, from none to four. */
const TRAY_LEVELS = [0, 1, 2, 3, 4];

/**
 * The menu bar glyphs. `…Template.png` and `…Template@2x.png` are the names
 * `nativeImage` reads: the suffix is what makes macOS recolour the image for a
 * light, dark or selected menu bar, and the `@2x` beside it is picked up on a
 * Retina display without being asked for by name.
 */
const TRAY_ENTRIES = TRAY_LEVELS.flatMap((bars) => [
  { file: `bars-${String(bars)}Template.png`, pixels: 16 },
  { file: `bars-${String(bars)}Template@2x.png`, pixels: 32 },
]);

const GENERATED_FILES = [
  ...ICONSET_ENTRIES.map((entry) => `assets/icon.iconset/${entry.file}`),
  "assets/icon.icns",
  "assets/icon.ico",
  ...TRAY_ENTRIES.map((entry) => `assets/tray/${entry.file}`),
];

function pixelSize(path: string): { width: number; height: number } {
  const report = execFileSync(
    "sips",
    ["-g", "pixelWidth", "-g", "pixelHeight", path],
    { encoding: "utf8" },
  );
  return {
    width: Number(/pixelWidth:\s*(\d+)/.exec(report)?.[1]),
    height: Number(/pixelHeight:\s*(\d+)/.exec(report)?.[1]),
  };
}

describe("assets/icon.svg", () => {
  it("exists as the single source the raster sizes come from", () => {
    expect(existsSync(repoPath("assets/icon.svg"))).toBe(true);
  });

  it("is drawn on a square viewBox", () => {
    // A non-square viewBox would letterbox at every size `iconutil` demands,
    // and macOS crops rather than pads — the mark would lose its edges.
    const viewBox = /viewBox="([\d.\s-]+)"/.exec(
      readRepoFile("assets/icon.svg"),
    )?.[1];
    expect(viewBox).toBeTruthy();
    const [, , width, height] = viewBox!.trim().split(/\s+/).map(Number);
    expect(width).toBe(height);
  });

  it("carries no embedded raster", () => {
    // The whole point of an SVG source is that 1024px is drawn, not upscaled.
    // An `<image>` element would smuggle a fixed-resolution bitmap back in.
    expect(readRepoFile("assets/icon.svg")).not.toMatch(/<image[\s>]/);
  });
});

describe("assets/tray", () => {
  it.each(TRAY_LEVELS)("draws bars-%i.svg as its own source", (bars) => {
    expect(existsSync(repoPath(`assets/tray/bars-${String(bars)}.svg`))).toBe(
      true,
    );
  });

  it.each(TRAY_LEVELS)("draws bars-%i.svg on a square viewBox", (bars) => {
    // The menu bar gives a template image a square slot; a taller viewBox
    // would letterbox the glyph and shrink the bars inside it.
    const viewBox = /viewBox="([\d.\s-]+)"/.exec(
      readRepoFile(`assets/tray/bars-${String(bars)}.svg`),
    )?.[1];
    expect(viewBox).toBeTruthy();
    const [, , width, height] = viewBox!.trim().split(/\s+/).map(Number);
    expect(width).toBe(height);
  });

  it("fills one more bar at each level", () => {
    // Five artworks that looked alike would be the decoration T-30 took out of
    // the panel — the glyph has to say which level the router reported.
    const opaque = TRAY_LEVELS.map(
      (bars) =>
        readRepoFile(`assets/tray/bars-${String(bars)}.svg`).match(
          /<rect[^>]*class="filled"/g,
        )?.length ?? 0,
    );
    expect(opaque).toEqual(TRAY_LEVELS);
  });
});

describe("packaging wiring", () => {
  const packageJson = JSON.parse(readRepoFile("package.json")) as {
    scripts?: Record<string, string>;
    config?: {
      forge?: { packagerConfig?: { icon?: string; ignore?: string[] } };
    };
  };
  const packagerConfig = packageJson.config?.forge?.packagerConfig;

  it("exposes the rasterisation as `npm run icon`", () => {
    expect(packageJson.scripts?.icon).toBeTruthy();
  });

  it.each([".icns", ".ico"])(
    "points packagerConfig.icon at a %s file that is on disk",
    (extension) => {
      // Forge fails soft on a missing icon: it packages the default and says
      // nothing, so the only way to catch a wrong path is to resolve it here.
      // The path has no extension: the packager adds the platform's own.
      expect(packagerConfig?.icon).toBeTruthy();
      expect(
        existsSync(resolve(repoRoot, `${packagerConfig!.icon!}${extension}`)),
      ).toBe(true);
    },
  );

  it("keeps the artwork and its build scripts out of the asar", () => {
    // The `.icns` is read by the packager from the source tree; neither it nor
    // the rasteriser is of any use inside the bundle at runtime.
    expect(packagerConfig?.ignore).toContain("^/assets$");
    expect(packagerConfig?.ignore).toContain("^/scripts$");
  });
});

/** Per-channel slack between the committed PNGs and a fresh run. */
const PIXEL_TOLERANCE = 2;

const GENERATED_PNGS = GENERATED_FILES.filter((file) => file.endsWith(".png"));

/**
 * Runs the real rasteriser. Everything below asserts against files this run
 * produced, so a stale `assets/` left behind by an earlier run cannot satisfy
 * any of it — the same reason `project-setup.test.ts` runs a real build.
 *
 * It runs twice: the two runs must agree byte for byte, which is determinism
 * on this machine. The committed files are held against the fresh output by
 * pixels within a tolerance instead, because Chromium on another Mac — the
 * release runner — antialiases a few edge pixels differently, and a hash
 * comparison failed the release on artwork no one had changed.
 */
describe("npm run icon", () => {
  const committed = new Map<string, Buffer>();
  const hashesFirstRun: Record<string, string> = {};
  const hashesSecondRun: Record<string, string> = {};
  let extractedIconset = "";

  function runIcon(): void {
    execFileSync("npm", ["run", "icon"], { cwd: repoRoot, stdio: "pipe" });
  }

  function snapshotInto(target: Record<string, string>): void {
    for (const file of GENERATED_FILES) {
      const path = repoPath(file);
      target[file] = existsSync(path)
        ? createHash("sha256").update(readFileSync(path)).digest("hex")
        : "absent";
    }
  }

  beforeAll(() => {
    for (const file of GENERATED_FILES) {
      const path = repoPath(file);
      if (existsSync(path)) committed.set(file, readFileSync(path));
    }
    runIcon();
    snapshotInto(hashesFirstRun);
    runIcon();
    snapshotInto(hashesSecondRun);

    // `iconutil` has no listing mode — converting back out is the documented
    // way to see what point sizes an `.icns` actually contains.
    extractedIconset = join(
      mkdtempSync(join(tmpdir(), "icns-")),
      "icon.iconset",
    );
    execFileSync(
      "iconutil",
      [
        "--convert",
        "iconset",
        "--output",
        extractedIconset,
        repoPath("assets/icon.icns"),
      ],
      { stdio: "pipe" },
    );
  }, 600_000);

  afterAll(() => {
    // A run on another machine may differ by a few pixels; put the committed
    // artwork back so a test run never leaves a diff behind.
    for (const [file, bytes] of committed) {
      writeFileSync(repoPath(file), bytes);
    }
    if (extractedIconset) {
      rmSync(join(extractedIconset, ".."), { recursive: true, force: true });
    }
  });

  it.each(ICONSET_ENTRIES)("writes $file at $pixels pixels square", (entry) => {
    const path = repoPath(`assets/icon.iconset/${entry.file}`);
    expect(existsSync(path)).toBe(true);
    expect(pixelSize(path)).toEqual({
      width: entry.pixels,
      height: entry.pixels,
    });
  });

  it("writes those ten entries and nothing else", () => {
    const written = readdirSync(repoPath("assets/icon.iconset")).sort();
    expect(written).toEqual(ICONSET_ENTRIES.map((entry) => entry.file).sort());
  });

  it.each(TRAY_ENTRIES)(
    "writes tray $file at $pixels pixels square",
    (entry) => {
      const path = repoPath(`assets/tray/${entry.file}`);
      expect(existsSync(path)).toBe(true);
      expect(pixelSize(path)).toEqual({
        width: entry.pixels,
        height: entry.pixels,
      });
    },
  );

  it("writes a tray PNG for every level at both scales, and nothing else", () => {
    const written = readdirSync(repoPath("assets/tray"))
      .filter((name) => name.endsWith(".png"))
      .sort();
    expect(written).toEqual(TRAY_ENTRIES.map((entry) => entry.file).sort());
  });

  it("produces an .icns carrying every point size macOS asks for", () => {
    expect(existsSync(repoPath("assets/icon.icns"))).toBe(true);
    const points = readdirSync(extractedIconset)
      .map((name) => Number(/^icon_(\d+)x\d+/.exec(name)?.[1]))
      .filter((size) => Number.isFinite(size));
    for (const size of ICNS_POINT_SIZES) {
      expect(points).toContain(size);
    }
  });

  it("produces an .ico carrying every size Windows asks for, each a PNG of that size", () => {
    const ico = readFileSync(repoPath("assets/icon.ico"));
    // ICONDIR: reserved 0, type 1 (icon), then the entry count.
    expect(ico.readUInt16LE(0)).toBe(0);
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);

    const sizes = Array.from({ length: count }, (_, index) => {
      const entry = 6 + index * 16;
      // A width or height byte of 0 means 256.
      const width = ico.readUInt8(entry) || 256;
      const height = ico.readUInt8(entry + 1) || 256;
      const length = ico.readUInt32LE(entry + 8);
      const offset = ico.readUInt32LE(entry + 12);
      const image = ico.subarray(offset, offset + length);

      expect(image.subarray(1, 4).toString("latin1")).toBe("PNG");
      expect(image.readUInt32BE(16)).toBe(width);
      expect(image.readUInt32BE(20)).toBe(height);
      expect(width).toBe(height);
      return width;
    });

    expect(sizes.sort((a, b) => a - b)).toEqual(ICO_SIZES);
  });

  it("regenerates every file byte-identically on the same machine", () => {
    expect(hashesSecondRun).toEqual(hashesFirstRun);
  });

  it.each(GENERATED_PNGS)(
    "matches the committed %s pixel for pixel, within the tolerance",
    (file) => {
      const before = committed.get(file);
      expect(before).toBeDefined();
      expect(
        pngsMatch(
          before ?? Buffer.alloc(0),
          readFileSync(repoPath(file)),
          PIXEL_TOLERANCE,
        ),
      ).toBe(true);
    },
  );
});
