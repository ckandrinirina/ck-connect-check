/**
 * The Windows tray icon: the usage percentage drawn as pixels.
 *
 * The Windows notification area has no text beside an icon, so the figure the
 * macOS menu bar spells out has to be the icon itself. This is pure
 * image-building code with no Electron import, so every badge is testable
 * without a display; `tray-icon.ts` hands the bitmap to `nativeImage`.
 */

/** The badge is square: 32×32, the size Windows asks for at 200% scaling. */
export const TRAY_BADGE_SIZE = 32;

/** Raw pixels, row-major, four bytes (R, G, B, A) per pixel. */
export interface TrayBadgeBitmap {
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * A 3×5 pixel font: one string per row, `#` for ink. Digits only, plus the
 * dash shown when there is no figure — the same dash the menu bar title uses.
 */
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  "0": ["###", "#.#", "#.#", "#.#", "###"],
  "1": [".#.", "##.", ".#.", ".#.", "###"],
  "2": ["###", "..#", "###", "#..", "###"],
  "3": ["###", "..#", "###", "..#", "###"],
  "4": ["#.#", "#.#", "###", "..#", "..#"],
  "5": ["###", "#..", "###", "..#", "###"],
  "6": ["###", "#..", "###", "#.#", "###"],
  "7": ["###", "..#", ".#.", ".#.", ".#."],
  "8": ["###", "#.#", "###", "#.#", "###"],
  "9": ["###", "#.#", "###", "..#", "###"],
  "-": ["...", "...", "###", "...", "..."],
};

const GLYPH_WIDTH = 3;
const GLYPH_HEIGHT = 5;
/** Font columns between two glyphs. */
const GLYPH_GAP = 1;
/** Pixels kept clear between the ink and the badge's edge. */
const PADDING = 3;
/** A single digit is drawn no larger than this, so it does not look shouted. */
const MAX_SCALE = 4;
const CORNER_RADIUS = 6;

// Achromatic on purpose: Electron's `createFromBitmap` takes the platform's
// native byte order (BGRA on Windows), and a grey is the same either way.
const BACKGROUND = [0x30, 0x30, 0x30, 0xff] as const;
const INK = [0xff, 0xff, 0xff, 0xff] as const;

/** Whether pixel (x, y) falls inside the rounded square, judged at its centre. */
function insideRoundedSquare(x: number, y: number): boolean {
  const near = (v: number) =>
    Math.max(
      0,
      CORNER_RADIUS - (v + 0.5),
      v + 0.5 - (TRAY_BADGE_SIZE - CORNER_RADIUS),
    );
  const dx = near(x);
  const dy = near(y);

  return dx * dx + dy * dy <= CORNER_RADIUS * CORNER_RADIUS;
}

/** What the badge spells: the rounded, clamped share, or a dash for none. */
function label(percent: number | null): string {
  if (percent === null || Number.isNaN(percent)) {
    return "-";
  }

  return String(Math.min(100, Math.max(0, Math.round(percent))));
}

/**
 * The badge for one share of the plan, 0–100: its digits light on a dark
 * rounded square, which reads on a light taskbar and a dark one alike. Null —
 * no figure yet — draws a dash.
 */
export function renderTrayBadge(percent: number | null): TrayBadgeBitmap {
  const size = TRAY_BADGE_SIZE;
  const data = new Uint8Array(size * size * 4);
  const paint = (x: number, y: number, colour: readonly number[]) => {
    data.set(colour, (y * size + x) * 4);
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (insideRoundedSquare(x, y)) {
        paint(x, y, BACKGROUND);
      }
    }
  }

  const text = label(percent);
  const columns = text.length * (GLYPH_WIDTH + GLYPH_GAP) - GLYPH_GAP;
  const room = size - 2 * PADDING;
  // As large as the widest figure allows: 4× for one digit, 2× for `100`.
  const scale = Math.min(
    MAX_SCALE,
    Math.floor(room / columns),
    Math.floor(room / GLYPH_HEIGHT),
  );
  const left = Math.floor((size - columns * scale) / 2);
  const top = Math.floor((size - GLYPH_HEIGHT * scale) / 2);

  [...text].forEach((char, index) => {
    const originX = left + index * (GLYPH_WIDTH + GLYPH_GAP) * scale;

    GLYPHS[char].forEach((row, gy) => {
      [...row].forEach((cell, gx) => {
        if (cell !== "#") {
          return;
        }
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            paint(originX + gx * scale + dx, top + gy * scale + dy, INK);
          }
        }
      });
    });
  });

  return { width: size, height: size, data };
}
