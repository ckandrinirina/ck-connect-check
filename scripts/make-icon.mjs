/**
 * Builds `assets/icon.icns` from `assets/icon.svg`.
 *
 * Run with `npm run icon`. Both the `.iconset` PNGs and the `.icns` are
 * committed: packaging reads the `.icns` off disk, and must never depend on
 * this script having been run first.
 *
 * The window is Electron's, so this runs under Electron rather than node.
 */

import { execFileSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { app } from "electron";

import {
  configureDeterministicRendering,
  renderSvgToPng,
} from "./render-svg.mjs";

/**
 * The ten entries `iconutil` reads. The names are its convention, not a
 * choice: five point sizes at 1x and 2x, which is why 32, 256 and 512 pixels
 * each appear twice under different names.
 */
const ENTRIES = [
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
];

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const source = join(repoRoot, "assets/icon.svg");
const iconset = join(repoRoot, "assets/icon.iconset");
const icns = join(repoRoot, "assets/icon.icns");

async function build() {
  // A build script has no business appearing in the Dock while it runs.
  app.dock?.hide();

  // Rebuilt from empty, so a size dropped from `ENTRIES` cannot linger in the
  // directory and end up in the `.icns` anyway.
  await rm(iconset, { recursive: true, force: true });
  await mkdir(iconset, { recursive: true });

  for (const entry of ENTRIES) {
    await renderSvgToPng({
      source,
      size: entry.pixels,
      destination: join(iconset, entry.file),
    });
    console.log(`  ${entry.file} — ${entry.pixels}px`);
  }

  execFileSync("iconutil", ["--convert", "icns", "--output", icns, iconset], {
    stdio: "inherit",
  });
  console.log(`  icon.icns — ${ENTRIES.length} entries`);
}

configureDeterministicRendering();

/*
 * `app.on("ready")` rather than `await app.whenReady()` at the top level.
 * Electron emits `ready` only once the main module has finished evaluating, so
 * a top-level await on that promise waits for an event that is itself waiting
 * for the await to finish — the script hangs before drawing anything.
 */
app.on("ready", () => {
  build().then(
    () => app.exit(0),
    (error) => {
      console.error(error);
      // A silent failure here would leave whatever the last good run wrote in
      // place, and `npm run icon` would look like it had succeeded.
      app.exit(1);
    },
  );
});
