/**
 * Rasterises an SVG to a PNG at an exact pixel size, using an offscreen
 * Electron window as the renderer. Electron is already a dependency and its
 * Chromium draws the same SVG the panel's own dial is drawn with, so the mark
 * and the UI cannot drift apart the way a second rasteriser would let them.
 *
 * It knows nothing about which artwork it is drawing: source in, size in,
 * destination out. `make-icon.mjs` drives it across the ten sizes an `.iconset`
 * needs, and the tray glyphs are drawn through the same call.
 *
 * Determinism is the whole point — see `configureDeterministicRendering()`.
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { BrowserWindow, app } from "electron";

/**
 * Must be called before Electron is ready, so it belongs to whoever owns the
 * process rather than to a single render call.
 *
 * Left to itself Chromium rasterises against the machine it happens to be on:
 * the GPU driver decides how edges are antialiased and the display profile
 * decides what the blues become, so the committed PNGs would disagree with a
 * fresh run for reasons that have nothing to do with the artwork.
 *
 * `--force-device-scale-factor=1` belongs with them but cannot be set here:
 * Chromium resolves the display scale while the screen is initialised, which
 * is before this module is even evaluated. It has to be a real argument on the
 * `electron` command line — see the `icon` script in `package.json`. Without
 * it a Retina display returns a capture at twice the size asked for, which is
 * what the guard in `renderSvgToPng` catches.
 */
export function configureDeterministicRendering() {
  // Each size is captured in its own window and destroyed straight after, so
  // the window list empties between sizes. Electron's default handler quits
  // the app when that happens, ending the run after the first PNG with exit
  // code 0 and nothing written to say why.
  app.on("window-all-closed", () => {});

  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("force-color-profile", "srgb");
  app.commandLine.appendSwitch("disable-lcd-text");
}

/**
 * The SVG is inlined into a page rather than loaded as a document of its own:
 * as a document Chromium applies its own sizing to the root element, while an
 * inline `<svg>` stretched to the viewport lands on exactly the pixels asked
 * for. The page itself is transparent, so the squircle's corners stay clear.
 *
 * The page is written to a temp file and loaded over `file:`. A `data:` URL
 * carrying artwork this size is refused with `ERR_FAILED` once a window has
 * already been through one — the artwork is far past the size a data URL is
 * meant for, and the error says nothing useful about why.
 */
function pageFor(svg) {
  return `<!doctype html>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; background: transparent; }
  svg { display: block; width: 100vw; height: 100vh; }
</style>
${svg}`;
}

/**
 * @param {{ source: string, size: number, destination: string }} options
 */
export async function renderSvgToPng({ source, size, destination }) {
  const svg = await readFile(source, "utf8");
  const stagingDir = await mkdtemp(join(tmpdir(), "render-svg-"));
  const pagePath = join(stagingDir, "page.html");
  await writeFile(pagePath, pageFor(svg), "utf8");

  const window = new BrowserWindow({
    width: size,
    height: size,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    webPreferences: {
      offscreen: true,
      // The window is never shown, and an unshown window is a throttled one —
      // which would leave the two frames waited on below arriving whenever
      // Chromium felt like it.
      backgroundThrottling: false,
    },
  });

  try {
    await window.loadFile(pagePath);

    // `did-finish-load` means the document parsed, not that it was painted.
    // Two frames is the point after which the first paint has certainly landed.
    await window.webContents.executeJavaScript(
      "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
    );

    const image = await window.webContents.capturePage({
      x: 0,
      y: 0,
      width: size,
      height: size,
    });

    const { width, height } = image.getSize();
    if (width !== size || height !== size) {
      throw new Error(
        `expected a ${size}x${size} capture of ${source}, got ${width}x${height} — ` +
          "run electron with --force-device-scale-factor=1",
      );
    }

    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, image.toPNG());
  } finally {
    window.destroy();
    await rm(stagingDir, { recursive: true, force: true });
  }
}
