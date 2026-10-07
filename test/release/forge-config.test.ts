import { readFileSync } from "node:fs";
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

const packageJson = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf8",
  ),
) as {
  name?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
  config?: {
    forge?: { packagerConfig?: { ignore?: string[] }; makers?: Maker[] };
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
