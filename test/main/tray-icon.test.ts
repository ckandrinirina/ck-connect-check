import { basename } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RouterStatus } from "../../src/hilink/types.js";
import { platformTraits } from "../../src/main/platform.js";
import { STARTUP_TRAY_TITLE } from "../../src/main/poller.js";
import { NO_TRAY_VALUE, OFFLINE_TRAY_TITLE } from "../../src/main/tray.js";
import { renderTrayBadge } from "../../src/main/tray-badge.js";
import {
  TRAY_MAX_BARS,
  createTrayDisplay,
  createTrayGlyph,
  trayBarsFor,
  trayFaceFor,
  trayImageFor,
} from "../../src/main/tray-icon.js";

/**
 * Electron is never loaded for real. `createFromPath` is the only call this
 * module makes, so the fake records what was asked for and hands back an image
 * that remembers whether the template flag was set on it.
 */
const electron = vi.hoisted(() => ({
  createFromPath: vi.fn((path: string) => ({
    path,
    template: false,
    setTemplateImage(value: boolean) {
      this.template = value;
    },
  })),
  createFromBitmap: vi.fn(
    (bitmap: Buffer, size: { width: number; height: number }) => ({
      bitmap,
      size,
    }),
  ),
}));

vi.mock("electron", () => ({ nativeImage: electron }));

/** What the fake `createFromPath` hands back, as this suite reads it. */
interface FakeImage {
  path: string;
  template: boolean;
}

/** The tray, reduced to the one call the glyph makes on it. */
function fakeTray() {
  return { setImage: vi.fn() };
}

function status(signalBars: number, maxSignalBars: number): RouterStatus {
  return {
    connected: true,
    signalBars,
    maxSignalBars,
    connectedDevices: 3,
    networkTypeCode: 101,
  };
}

const LEVELS = [0, 1, 2, 3, 4];

beforeEach(() => {
  electron.createFromPath.mockClear();
  electron.createFromBitmap.mockClear();
});

describe("trayImageFor", () => {
  it("answers a distinct path for every filled count", () => {
    const paths = LEVELS.map((bars) => trayImageFor(bars));

    expect(new Set(paths).size).toBe(LEVELS.length);
  });

  it.each(LEVELS)("names the %i-bar artwork as a template image", (bars) => {
    // `…Template.png` is the convention `nativeImage` recognises: macOS
    // recolours a template for light, dark and selected menu bars.
    expect(basename(trayImageFor(bars))).toBe(
      `bars-${String(bars)}Template.png`,
    );
  });

  it("draws every level out of the build output", () => {
    // The packaged app ships `dist/` and drops `src/` and `assets/`, so a path
    // into either would start fine and then fail to find its own artwork.
    for (const bars of LEVELS) {
      expect(trayImageFor(bars)).toContain("dist/assets/tray/");
    }
  });

  it.each([
    { input: -1, level: 0 },
    { input: -99, level: 0 },
    { input: TRAY_MAX_BARS + 1, level: TRAY_MAX_BARS },
    { input: 99, level: TRAY_MAX_BARS },
  ])("clamps $input onto the $level-bar artwork", ({ input, level }) => {
    // A count out of range is still a menu bar that has to show something —
    // `undefined` here would be a tray with no glyph at all.
    expect(trayImageFor(input)).toBe(trayImageFor(level));
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])(
    "resolves %s to an artwork that exists",
    (input) => {
      expect(LEVELS.map((bars) => trayImageFor(bars))).toContain(
        trayImageFor(input),
      );
    },
  );
});

describe("trayBarsFor", () => {
  it.each([
    { signal: 5, max: 5, bars: 4 },
    { signal: 4, max: 5, bars: 3 },
    { signal: 3, max: 5, bars: 2 },
    { signal: 1, max: 5, bars: 1 },
    { signal: 0, max: 5, bars: 0 },
  ])("scales $signal of $max onto $bars bars", ({ signal, max, bars }) => {
    // The same scaling the panel's header does, so the glyph and the panel can
    // never disagree about how strong the signal is.
    expect(trayBarsFor(status(signal, max))).toBe(bars);
  });

  it("reads a maximum of zero as nothing said yet, not as the worst signal", () => {
    expect(() => trayBarsFor(status(0, 0))).not.toThrow();
    expect(trayBarsFor(status(0, 0))).toBe(0);
  });

  it("never answers outside the range the artwork covers", () => {
    // A router claiming more bars than its own maximum would otherwise index
    // past the five images.
    expect(trayBarsFor(status(9, 5))).toBe(TRAY_MAX_BARS);
    expect(trayBarsFor(status(-2, 5))).toBe(0);
  });
});

describe("createTrayGlyph", () => {
  it("loads the five artworks once, at creation", () => {
    const glyph = createTrayGlyph();

    expect(electron.createFromPath).toHaveBeenCalledTimes(LEVELS.length);

    const tray = fakeTray();
    for (const bars of LEVELS) {
      glyph.apply(tray, bars);
    }

    // Every later level comes out of what was already loaded — a menu bar that
    // read a file off disk on every poll would be paying for it forever.
    expect(electron.createFromPath).toHaveBeenCalledTimes(LEVELS.length);
  });

  it("marks every image as a template", () => {
    const glyph = createTrayGlyph();

    for (const bars of LEVELS) {
      expect((glyph.imageFor(bars) as unknown as FakeImage).template).toBe(
        true,
      );
    }
  });

  it("hands out the image belonging to the level asked for", () => {
    const glyph = createTrayGlyph();

    for (const bars of LEVELS) {
      expect((glyph.imageFor(bars) as unknown as FakeImage).path).toBe(
        trayImageFor(bars),
      );
    }
  });

  it("sets the tray image when the level changes", () => {
    const glyph = createTrayGlyph();
    const tray = fakeTray();

    glyph.apply(tray, 2);
    glyph.apply(tray, 3);

    expect(tray.setImage).toHaveBeenCalledTimes(2);
    expect(tray.setImage).toHaveBeenLastCalledWith(glyph.imageFor(3));
  });

  it("leaves the tray alone when the level has not changed", () => {
    // A poll every few seconds that reassigns the same image is work the menu
    // bar does not need doing.
    const glyph = createTrayGlyph();
    const tray = fakeTray();

    glyph.apply(tray, 2);
    glyph.apply(tray, 2);
    glyph.apply(tray, 2);

    expect(tray.setImage).toHaveBeenCalledTimes(1);
  });

  it("treats a clamped level as the level it clamps to", () => {
    const glyph = createTrayGlyph();
    const tray = fakeTray();

    glyph.apply(tray, TRAY_MAX_BARS);
    glyph.apply(tray, 99);

    expect(tray.setImage).toHaveBeenCalledTimes(1);
  });

  it("gives each app its own memory of what was last applied", () => {
    // Two glyphs must not share a "last level" — the second tray would start
    // out believing it already showed an image it has never been given.
    const first = createTrayGlyph();
    const second = createTrayGlyph();
    const firstTray = fakeTray();
    const secondTray = fakeTray();

    first.apply(firstTray, 4);
    second.apply(secondTray, 4);

    expect(secondTray.setImage).toHaveBeenCalledTimes(1);
  });
});

/** The tray, reduced to every call a display makes on it. */
function fakeFullTray() {
  return { setImage: vi.fn(), setTitle: vi.fn(), setToolTip: vi.fn() };
}

/** The pixels of the image last handed to `setImage`, as a bitmap fake holds them. */
function lastBadgePixels(tray: ReturnType<typeof fakeFullTray>): Uint8Array {
  const calls = tray.setImage.mock.calls;
  const image = calls[calls.length - 1]?.[0] as { bitmap: Buffer };

  return new Uint8Array(image.bitmap);
}

describe("trayFaceFor", () => {
  it.each([
    { title: "8Go · 40%", percent: 40 },
    { title: "12Go ⚠ 60%", percent: 60 },
    { title: "⚠18Go 90%", percent: 90 },
    { title: "999Go ⚠ 100%", percent: 100 },
    { title: "0o · 0%", percent: 0 },
  ])("reads $percent% out of $title", ({ title, percent }) => {
    expect(trayFaceFor(title)).toEqual({ percent, tooltip: title });
  });

  it("keeps a volume with no share as the tooltip, with no figure for the badge", () => {
    // No cap typed: the volume is the whole title, and a share of nothing is
    // exactly what the dash refuses to invent.
    expect(trayFaceFor("8Go")).toEqual({ percent: null, tooltip: "8Go" });
  });

  it("says the router is unreachable when the title is offline", () => {
    const face = trayFaceFor(OFFLINE_TRAY_TITLE);

    expect(face.percent).toBeNull();
    expect(face.tooltip).toMatch(/router/i);
    expect(face.tooltip).toMatch(/unreachable|not found|offline/i);
  });

  it("says a sync is needed when there is no figure yet", () => {
    const face = trayFaceFor(NO_TRAY_VALUE);

    expect(face.percent).toBeNull();
    expect(face.tooltip).toMatch(/sync/i);
  });

  it("says it is waiting before the first reading", () => {
    const face = trayFaceFor(STARTUP_TRAY_TITLE);

    expect(face.percent).toBeNull();
    expect(face.tooltip).toMatch(/waiting/i);
  });
});

describe("createTrayDisplay — Windows", () => {
  const windows = platformTraits("win32");

  it("starts on the dash badge", () => {
    const display = createTrayDisplay(windows);
    const image = display.initialImage as unknown as { bitmap: Buffer };

    expect(new Uint8Array(image.bitmap)).toEqual(renderTrayBadge(null).data);
  });

  it("draws the share into the icon and puts the title in the tooltip", () => {
    const display = createTrayDisplay(windows);
    const tray = fakeFullTray();

    display.showTitle(tray, "8Go · 40%");

    expect(lastBadgePixels(tray)).toEqual(renderTrayBadge(40).data);
    expect(tray.setToolTip).toHaveBeenCalledWith("8Go · 40%");
    expect(tray.setTitle).not.toHaveBeenCalled();
  });

  it("hands the bitmap over at the badge's own size", () => {
    const display = createTrayDisplay(windows);

    display.showTitle(fakeFullTray(), "8Go · 40%");

    expect(electron.createFromBitmap).toHaveBeenLastCalledWith(
      expect.anything(),
      { width: 32, height: 32 },
    );
  });

  it.each([OFFLINE_TRAY_TITLE, NO_TRAY_VALUE, STARTUP_TRAY_TITLE])(
    "shows the dash badge and says why for %s",
    (title) => {
      const display = createTrayDisplay(windows);
      const tray = fakeFullTray();

      display.showTitle(tray, "8Go · 40%");
      display.showTitle(tray, title);

      expect(lastBadgePixels(tray)).toEqual(renderTrayBadge(null).data);
      expect(tray.setToolTip).toHaveBeenLastCalledWith(
        trayFaceFor(title).tooltip,
      );
      expect(tray.setTitle).not.toHaveBeenCalled();
    },
  );

  it("redraws the badge only when the figure changes", () => {
    const display = createTrayDisplay(windows);
    const tray = fakeFullTray();

    display.showTitle(tray, "8Go · 40%");
    display.showTitle(tray, "8.1Go · 40%");

    expect(tray.setImage).toHaveBeenCalledTimes(1);
    expect(tray.setToolTip).toHaveBeenLastCalledWith("8.1Go · 40%");
  });

  it("leaves the signal level out of the icon", () => {
    // The icon is the figure on Windows; swapping in the bars would hide it.
    const display = createTrayDisplay(windows);
    const tray = fakeFullTray();

    display.showSignal(tray, 3);

    expect(tray.setImage).not.toHaveBeenCalled();
  });
});

describe("createTrayDisplay — macOS", () => {
  const mac = platformTraits("darwin");

  it("starts on the empty signal glyph", () => {
    const display = createTrayDisplay(mac);

    expect((display.initialImage as unknown as FakeImage).path).toBe(
      trayImageFor(0),
    );
    expect(electron.createFromBitmap).not.toHaveBeenCalled();
  });

  it("puts the title beside the icon and leaves the image to the signal", () => {
    const display = createTrayDisplay(mac);
    const tray = fakeFullTray();

    display.showTitle(tray, "8Go · 40%");

    expect(tray.setTitle).toHaveBeenCalledWith("8Go · 40%");
    expect(tray.setImage).not.toHaveBeenCalled();
    expect(tray.setToolTip).not.toHaveBeenCalled();
  });

  it("shows the signal level as the glyph", () => {
    const display = createTrayDisplay(mac);
    const tray = fakeFullTray();

    display.showSignal(tray, 3);

    expect(
      (tray.setImage.mock.calls[0]?.[0] as unknown as FakeImage).path,
    ).toBe(trayImageFor(3));
  });
});
