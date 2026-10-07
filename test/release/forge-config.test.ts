import { existsSync, readFileSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * What `npm run make` builds is decided entirely by `package.json`: the script
 * that runs Forge and the forge config it reads. The real make takes minutes and
 * needs a Mac toolchain, so the config is asserted here instead of exercised.
 */
interface Maker {
  name?: string;
  platforms?: string[];
  config?: Record<string, unknown>;
}

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

const packageJson = JSON.parse(
  readFileSync(resolve(repoRoot, "package.json"), "utf8"),
) as {
  name?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  config?: {
    forge?: {
      packagerConfig?: { icon?: string; ignore?: string[] };
      makers?: Maker[];
    };
  };
};

const forge = packageJson.config?.forge;

function maker(name: string): Maker | undefined {
  return forge?.makers?.find((entry) => entry.name === name);
}

describe("the makers", () => {
  it.each(["@electron-forge/maker-dmg", "@electron-forge/maker-zip"])(
    "installs %s as a dev dependency",
    (name) => {
      expect(packageJson.devDependencies).toHaveProperty(name);
    },
  );

  it.each(["@electron-forge/maker-dmg", "@electron-forge/maker-zip"])(
    "lists %s for darwin",
    (name) => {
      expect(maker(name)?.platforms).toEqual(["darwin"]);
    },
  );

  it("names the dmg after the app", () => {
    expect(maker("@electron-forge/maker-dmg")?.config?.name).toBe(
      packageJson.name,
    );
  });

  it("gives the dmg the app icon", () => {
    expect(maker("@electron-forge/maker-dmg")?.config?.icon).toBe(
      "assets/icon.icns",
    );
  });
});

describe("the Windows installer", () => {
  const squirrel = () => maker("@electron-forge/maker-squirrel");

  it("installs @electron-forge/maker-squirrel as a dev dependency", () => {
    expect(packageJson.devDependencies).toHaveProperty(
      "@electron-forge/maker-squirrel",
    );
  });

  it("lists the Squirrel maker for win32 only", () => {
    expect(squirrel()?.platforms).toEqual(["win32"]);
  });

  it("names the installer after the app", () => {
    expect(squirrel()?.config?.name).toBe(packageJson.name);
  });

  it("gives Setup.exe the .ico, which is on disk", () => {
    expect(squirrel()?.config?.setupIcon).toBe("assets/icon.ico");
    expect(existsSync(resolve(repoRoot, "assets/icon.ico"))).toBe(true);
  });

  it("carries no signing options — the build is unsigned", () => {
    for (const key of [
      "certificateFile",
      "certificatePassword",
      "signWithParams",
      "windowsSign",
    ]) {
      expect(squirrel()?.config ?? {}).not.toHaveProperty(key);
    }
  });

  /**
   * The packager appends `.ico` or `.icns` to an icon path that has no
   * extension, by the platform it packages for.
   */
  function appIconFor(platform: "win32" | "darwin"): string | undefined {
    const icon = forge?.packagerConfig?.icon;
    if (icon === undefined || extname(icon) !== "") return icon;
    return `${icon}${platform === "win32" ? ".ico" : ".icns"}`;
  }

  it("gives the Windows app the .ico and the Mac app the .icns", () => {
    expect(appIconFor("win32")).toBe("assets/icon.ico");
    expect(appIconFor("darwin")).toBe("assets/icon.icns");
  });
});

describe("npm run make:win", () => {
  it("builds first, then makes the x64 Windows installer", () => {
    expect(packageJson.scripts?.["make:win"]).toBe(
      "npm run build && electron-forge make --platform=win32 --arch=x64",
    );
  });
});

describe("npm run make", () => {
  it("builds first, then makes one universal binary", () => {
    expect(packageJson.scripts?.make).toBe(
      "npm run build && electron-forge make --arch=universal",
    );
  });
});

describe("the packager ignore list", () => {
  const patterns = (forge?.packagerConfig?.ignore ?? []).map(
    (pattern) => new RegExp(pattern),
  );

  function ignored(path: string): boolean {
    return patterns.some((pattern) => pattern.test(path));
  }

  it.each(["/site", "/.github"])("keeps %s out of the bundle", (path) => {
    expect(ignored(path)).toBe(true);
  });

  it("still ships the compiled app", () => {
    expect(ignored("/dist")).toBe(false);
    expect(ignored("/dist/main/main.js")).toBe(false);
  });
});
