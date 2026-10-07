/**
 * The glyph beside the number in the menu bar.
 *
 * It is the same four ascending bars the panel's header draws, and it changes
 * with the level the router reports — an image that looked the same at one bar
 * as at five would be decoration, which is what T-30 took out of the panel.
 *
 * The five artworks are template images: macOS recolours a template for light,
 * dark and selected menu bars, which is the only way a tray icon looks right in
 * all three. They are loaded once, at startup, and handed to the tray by level.
 *
 * Windows has no text beside a tray icon, so there the icon is the usage
 * figure itself — a badge from `tray-badge.ts` — and the title the menu bar
 * would show goes in the tooltip. {@link createTrayDisplay} makes that choice
 * once, from `platform.ts`.
 *
 * Everything here except the factories is pure — the Electron calls are
 * `nativeImage.createFromPath` and `createFromBitmap`, so the mapping and the
 * clamping are testable without a tray.
 */

import { nativeImage } from "electron";
import { fileURLToPath } from "node:url";

import type { NativeImage } from "electron";

import type { RouterStatus } from "../hilink/types.js";
import type { PlatformTraits } from "./platform.js";
import { STARTUP_TRAY_TITLE } from "./poller.js";
import { NO_TRAY_VALUE, OFFLINE_TRAY_TITLE } from "./tray.js";
import { renderTrayBadge } from "./tray-badge.js";

/**
 * How many bars the glyph draws, which is also the highest level there is an
 * artwork for. It matches the panel's own bar count: the router's level is
 * scaled onto it here exactly as the renderer scales it onto the header, so the
 * menu bar and the panel can never show a different signal.
 */
export const TRAY_MAX_BARS = 4;

/** Every level with an artwork behind it: none filled through all filled. */
const LEVELS = Array.from({ length: TRAY_MAX_BARS + 1 }, (_, level) => level);

/**
 * A bar count reduced to one the artwork covers. Out of range is still a menu
 * bar that has to show something, so it is pulled to the nearest level rather
 * than left to resolve to nothing; a count that is not a number at all reads as
 * no signal.
 */
function clampBars(bars: number): number {
  if (!Number.isFinite(bars)) {
    return 0;
  }

  return Math.min(TRAY_MAX_BARS, Math.max(0, Math.round(bars)));
}

/**
 * Where the artwork for a level lives.
 *
 * It resolves into the build output rather than into `assets/`: a packaged
 * bundle carries `dist/` and drops both `src/` and `assets/`, so a path into
 * either would start fine and then fail to find its own glyph. `npm run build`
 * copies the PNGs across, the same bargain the panel's page makes in T-22.
 *
 * Only the 1x file is named. The `@2x` beside it is Retina's, and
 * `nativeImage.createFromPath` picks that up on its own.
 */
export function trayImageFor(bars: number): string {
  return fileURLToPath(
    new URL(
      `../../dist/assets/tray/bars-${String(clampBars(bars))}Template.png`,
      import.meta.url,
    ),
  );
}

/**
 * The level the glyph should show for one router status.
 *
 * A maximum of zero is the router having said nothing yet rather than a
 * connection at its worst, so it reads as no signal instead of being divided
 * by — the same reading the panel's header takes.
 */
export function trayBarsFor(
  status: Pick<RouterStatus, "signalBars" | "maxSignalBars">,
): number {
  if (status.maxSignalBars <= 0) {
    return 0;
  }

  return clampBars((status.signalBars / status.maxSignalBars) * TRAY_MAX_BARS);
}

/** The tray, reduced to the one call the glyph makes on it. */
export interface TrayImageTarget {
  setImage(image: NativeImage): void;
}

export interface TrayGlyph {
  /** The image for a level, template flag already applied. */
  imageFor(bars: number): NativeImage;
  /**
   * Shows a level in the menu bar — but only when it is not the level already
   * showing. A poll every few seconds that reassigns the same image is work
   * the menu bar does not need doing.
   */
  apply(target: TrayImageTarget, bars: number): void;
}

/**
 * Loads the five artworks and remembers which one is showing.
 *
 * The load happens here, once, rather than on each poll: reading five small
 * files at startup costs nothing, and reading one of them every thirty seconds
 * for the life of the app costs it forever.
 */
export function createTrayGlyph(): TrayGlyph {
  const images = LEVELS.map((level) => {
    const image = nativeImage.createFromPath(trayImageFor(level));

    // Without this the glyph is drawn as-is: black on a black menu bar.
    image.setTemplateImage(true);

    return image;
  });

  /** The level last handed to a tray, or null before the first one. */
  let showing: number | null = null;

  return {
    imageFor: (bars) => images[clampBars(bars)],
    apply(target, bars) {
      const level = clampBars(bars);

      if (level === showing) {
        return;
      }

      showing = level;
      target.setImage(images[level]);
    },
  };
}

/** What a Windows tray shows for one title: the badge's figure and the tooltip. */
export interface TrayFace {
  /** The share the badge draws, or null for the dash. */
  percent: number | null;
  tooltip: string;
}

/**
 * Why there is no figure, for each title that carries none. A dash on its own
 * says nothing; the tooltip is the one place on Windows that can say why.
 */
const NO_FIGURE_REASONS: Readonly<Record<string, string>> = {
  [OFFLINE_TRAY_TITLE]: "Router unreachable — offline",
  [NO_TRAY_VALUE]: "No usage figure yet — open the panel and sync",
  [STARTUP_TRAY_TITLE]: "Waiting for the router's first reading",
};

/** The share at the end of a title: `"8Go · 40%"` → 40. */
const TITLE_PERCENT = /(\d+)%$/;

/**
 * The Windows face of one menu bar title. The figure is read back out of the
 * title rather than computed again, so the badge and the tooltip beside it can
 * never disagree — and neither can disagree with what macOS shows.
 */
export function trayFaceFor(title: string): TrayFace {
  const reason = NO_FIGURE_REASONS[title];

  if (reason !== undefined) {
    return { percent: null, tooltip: reason };
  }

  const match = TITLE_PERCENT.exec(title);

  return { percent: match === null ? null : Number(match[1]), tooltip: title };
}

/** The tray, reduced to every call a display makes on it. */
export interface TrayTarget extends TrayImageTarget {
  setTitle(title: string): void;
  setToolTip(toolTip: string): void;
}

export interface TrayDisplay {
  /** What the tray is created with, before any poll has answered. */
  initialImage: NativeImage;
  /** A new signal level. Only macOS draws it; on Windows the icon is the figure. */
  showSignal(target: TrayTarget, bars: number): void;
  /** A new menu bar title: beside the icon on macOS, badge and tooltip on Windows. */
  showTitle(target: TrayTarget, title: string): void;
}

function badgeImage(percent: number | null): NativeImage {
  const { data, width, height } = renderTrayBadge(percent);

  return nativeImage.createFromBitmap(Buffer.from(data), { width, height });
}

/** The badge-and-tooltip display, for a tray that cannot show a title. */
function createBadgeDisplay(): TrayDisplay {
  /** The figure last drawn; `undefined` before the first, null for the dash. */
  let showing: number | null | undefined;

  return {
    initialImage: badgeImage(null),
    showSignal() {},
    showTitle(target, title) {
      const face = trayFaceFor(title);

      if (face.percent !== showing) {
        showing = face.percent;
        target.setImage(badgeImage(face.percent));
      }
      target.setToolTip(face.tooltip);
    },
  };
}

/** The signal glyph with the title beside it — the menu bar as it has always been. */
function createGlyphDisplay(): TrayDisplay {
  const glyph = createTrayGlyph();

  return {
    // Empty-handed rather than at full signal: no poll has answered yet.
    initialImage: glyph.imageFor(0),
    showSignal: (target, bars) => glyph.apply(target, bars),
    showTitle: (target, title) => target.setTitle(title),
  };
}

/** The tray's display for a platform: a title where it can show one, a badge where not. */
export function createTrayDisplay(
  traits: Pick<PlatformTraits, "trayShowsTitle">,
): TrayDisplay {
  return traits.trayShowsTitle ? createGlyphDisplay() : createBadgeDisplay();
}
