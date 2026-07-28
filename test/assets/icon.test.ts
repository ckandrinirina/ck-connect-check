import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

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

const GENERATED_FILES = [
  ...ICONSET_ENTRIES.map((entry) => `assets/icon.iconset/${entry.file}`),
  "assets/icon.icns",
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

  it("points packagerConfig.icon at a file that is on disk", () => {
    // Forge fails soft on a missing icon: it packages the default and says
    // nothing, so the only way to catch a wrong path is to resolve it here.
    expect(packagerConfig?.icon).toBeTruthy();
    expect(existsSync(resolve(repoRoot, packagerConfig!.icon!))).toBe(true);
  });

  it("keeps the artwork and its build scripts out of the asar", () => {
    // The `.icns` is read by the packager from the source tree; neither it nor
    // the rasteriser is of any use inside the bundle at runtime.
    expect(packagerConfig?.ignore).toContain("^/assets$");
    expect(packagerConfig?.ignore).toContain("^/scripts$");
  });
});

/**
 * Runs the real rasteriser. Everything below asserts against files this run
 * produced, so a stale `assets/` left behind by an earlier run cannot satisfy
 * any of it — the same reason `project-setup.test.ts` runs a real build.
 *
 * The hashes are taken *before* the run too, which makes one assertion do two
 * jobs: the output is deterministic, and the committed files already match it.
 */
describe("npm run icon", () => {
  const hashesBefore: Record<string, string> = {};
  const hashesAfter: Record<string, string> = {};
  let extractedIconset = "";

  function snapshotInto(target: Record<string, string>): void {
    for (const file of GENERATED_FILES) {
      const path = repoPath(file);
      target[file] = existsSync(path)
        ? createHash("sha256").update(readFileSync(path)).digest("hex")
        : "absent";
    }
  }

  beforeAll(() => {
    snapshotInto(hashesBefore);
    execFileSync("npm", ["run", "icon"], { cwd: repoRoot, stdio: "pipe" });
    snapshotInto(hashesAfter);

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

  it("produces an .icns carrying every point size macOS asks for", () => {
    expect(existsSync(repoPath("assets/icon.icns"))).toBe(true);
    const points = readdirSync(extractedIconset)
      .map((name) => Number(/^icon_(\d+)x\d+/.exec(name)?.[1]))
      .filter((size) => Number.isFinite(size));
    for (const size of ICNS_POINT_SIZES) {
      expect(points).toContain(size);
    }
  });

  it("regenerates every file byte-identically", () => {
    // Rasterisation that drifts between runs would make the committed artwork
    // and a fresh build disagree, and every packaging run a diff.
    expect(hashesAfter).toEqual(hashesBefore);
  });
});
