import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { platformTraits } from "../../src/main/platform.js";

const mainRoot = fileURLToPath(new URL("../../src/main/", import.meta.url));

describe("platformTraits", () => {
  it("on macOS: a titled tray, a panel below it, a Dock to hide", () => {
    expect(platformTraits("darwin")).toEqual({
      trayShowsTitle: true,
      panelAnchor: "below-tray",
      hasDock: true,
      needsAppUserModelId: false,
      installedBySquirrel: false,
    });
  });

  it("on Windows: no tray title, a panel above it, no Dock, an app user model ID", () => {
    // The taskbar sits at the bottom, so a panel opened below the icon would
    // land off-screen; the notification area has no text beside an icon.
    expect(platformTraits("win32")).toEqual({
      trayShowsTitle: false,
      panelAnchor: "above-tray",
      hasDock: false,
      needsAppUserModelId: true,
      installedBySquirrel: true,
    });
  });

  it("answers for the running platform when none is given", () => {
    expect(platformTraits()).toEqual(platformTraits(process.platform));
  });
});

describe("process.platform under src/main/", () => {
  it("is read by platform.ts and by no other module", () => {
    const readers = readdirSync(mainRoot, {
      recursive: true,
      withFileTypes: true,
    })
      .filter((entry) => entry.isFile())
      .map((entry) => join(entry.parentPath, entry.name))
      .filter((file) => readFileSync(file, "utf8").includes("process.platform"))
      .map((file) => file.slice(mainRoot.length));

    expect(readers).toEqual(["platform.ts"]);
  });
});
