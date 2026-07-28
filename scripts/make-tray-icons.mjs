/**
 * Builds the menu bar glyphs from `assets/tray/bars-0.svg` … `bars-4.svg`.
 *
 * Run with `npm run icon`, which drives this after `make-icon.mjs`. Both the
 * sources and the PNGs are committed: `npm run build` copies the PNGs into
 * `dist/`, and must never depend on this script having been run first.
 *
 * The names are the macOS convention `nativeImage` reads, not a choice.
 * `…Template.png` is what makes the system recolour the glyph for a light,
 * dark or selected menu bar, and the `@2x` beside it is picked up on a Retina
 * display without being named — which is why only the 1x path is ever asked
 * for in `src/main/tray-icon.ts`.
 *
 * The window is Electron's, so this runs under Electron rather than node.
 */

import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { app } from "electron";

import {
  configureDeterministicRendering,
  renderSvgToPng,
} from "./render-svg.mjs";

/** One artwork per filled bar count, from none to four. */
const LEVELS = [0, 1, 2, 3, 4];

/** A menu bar glyph is 16 points; the Retina variant is the same drawing at 32. */
const SCALES = [
  { suffix: "", pixels: 16 },
  { suffix: "@2x", pixels: 32 },
];

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const trayDir = join(repoRoot, "assets/tray");

async function build() {
  // A build script has no business appearing in the Dock while it runs.
  app.dock?.hide();

  for (const bars of LEVELS) {
    for (const scale of SCALES) {
      const file = `bars-${bars}Template${scale.suffix}.png`;

      await renderSvgToPng({
        source: join(trayDir, `bars-${bars}.svg`),
        size: scale.pixels,
        destination: join(trayDir, file),
      });
      console.log(`  ${file} — ${scale.pixels}px`);
    }
  }
}

configureDeterministicRendering();

/*
 * `app.on("ready")` rather than `await app.whenReady()` at the top level —
 * Electron emits `ready` only once the main module has finished evaluating, so
 * the await would wait on an event that is waiting on it. See `make-icon.mjs`.
 */
app.on("ready", () => {
  build().then(
    () => app.exit(0),
    (error) => {
      console.error(error);
      // A silent failure would leave whatever the last good run wrote in place,
      // and `npm run icon` would look like it had succeeded.
      app.exit(1);
    },
  );
});
