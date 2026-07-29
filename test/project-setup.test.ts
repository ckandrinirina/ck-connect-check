import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { APP_VERSION } from "../src/app-info.js";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../${relativePath}`, import.meta.url)),
    "utf8",
  );
}

const packageJson = JSON.parse(readRepoFile("package.json")) as {
  version?: string;
  scripts?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** The release this tree is: the pace meter and the automatic sync. */
const RELEASED_VERSION = "0.2.0";

describe("package.json", () => {
  it("declares test, build and lint scripts", () => {
    expect(packageJson.scripts?.test).toBeTruthy();
    expect(packageJson.scripts?.build).toBeTruthy();
    expect(packageJson.scripts?.lint).toBeTruthy();
  });

  it("depends on Electron and Vitest", () => {
    expect(packageJson.devDependencies).toHaveProperty("electron");
    expect(packageJson.devDependencies).toHaveProperty("vitest");
  });
});

/**
 * One version, stated in three places that cannot be allowed to drift: the
 * manifest npm reads, the lockfile it writes beside it, and the constant the app
 * itself carries. A bump that touches only one of them ships a build that
 * reports a version nobody released.
 */
describe("the released version", () => {
  it("reads 0.2.0 in package.json", () => {
    expect(packageJson.version).toBe(RELEASED_VERSION);
  });

  it("is what the app itself reports", () => {
    // Asserted against the manifest rather than against the literal, so the
    // constant cannot be left behind by the next bump either.
    expect(APP_VERSION).toBe(packageJson.version);
  });

  it("is a plain three-part semantic version", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it.each(["the root entry", "the root package entry"])(
    "agrees in package-lock.json at %s",
    (where) => {
      const lock = JSON.parse(readRepoFile("package-lock.json")) as {
        version?: string;
        packages?: Record<string, { version?: string }>;
      };

      const found =
        where === "the root entry"
          ? lock.version
          : lock.packages?.[""]?.version;

      expect(found).toBe(packageJson.version);
    },
  );
});

describe("build config", () => {
  it("emits compiled output to dist/", () => {
    const buildConfig = JSON.parse(readRepoFile("tsconfig.build.json")) as {
      compilerOptions?: { noEmit?: boolean; outDir?: string };
    };
    expect(buildConfig.compilerOptions?.noEmit).toBe(false);
    expect(buildConfig.compilerOptions?.outDir).toBe("dist");
  });
});

/**
 * The packaged app ships `dist/` and nothing else — electron-forge's `ignore`
 * list drops `^/src$` from the bundle. So the page and its stylesheet have to be
 * part of the build output, not read out of the source tree at runtime.
 *
 * This runs the real build rather than inspecting a `dist/` somebody else left
 * behind: an assertion about build output that a stale directory can satisfy
 * proves nothing.
 */
describe("build output", () => {
  beforeAll(() => {
    execFileSync("npm", ["run", "build"], { cwd: repoRoot, stdio: "pipe" });
  }, 180_000);

  it.each(["index.html", "popover.css"])(
    "copies %s into dist/renderer/",
    (asset) => {
      expect(
        existsSync(new URL(`../dist/renderer/${asset}`, import.meta.url)),
      ).toBe(true);
    },
  );

  it.each([0, 1, 2, 3, 4])(
    "copies the %i-bar tray glyph into dist/assets/tray/",
    (bars) => {
      // The tray reads its image at runtime, so the glyphs travel with `dist/`
      // for the same reason the panel's page does.
      for (const scale of ["", "@2x"]) {
        expect(
          existsSync(
            new URL(
              `../dist/assets/tray/bars-${String(bars)}Template${scale}.png`,
              import.meta.url,
            ),
          ),
        ).toBe(true);
      }
    },
  );

  it("leaves the built page pointing at its own directory", () => {
    // The copy lands beside the compiled script, so the page's own references
    // have to be relative to itself — a walk out to `../../dist/` would resolve
    // outside the bundle once the page no longer lives in `src/`.
    const page = readRepoFile("dist/renderer/index.html");
    expect(page).toContain('src="./popover.js"');
    expect(page).toContain('href="./popover.css"');
    expect(page).not.toContain("../../dist/");
  });
});

describe("gitignore", () => {
  it("ignores build and dependency output", () => {
    const ignored = readRepoFile(".gitignore");
    for (const entry of ["node_modules", "dist/", "out/"]) {
      expect(ignored).toContain(entry);
    }
  });

  it("ignores a node_modules symlink, not just the directory", () => {
    // A worktree symlinks node_modules to the main checkout to reuse its
    // install; `node_modules/` would not match that symlink, so it could be
    // committed by accident. The pattern must carry no trailing slash.
    const entries = readRepoFile(".gitignore")
      .split("\n")
      .map((line) => line.trim());
    expect(entries).toContain("node_modules");
    expect(entries).not.toContain("node_modules/");
  });
});

describe("docs/ARCHITECTURE.md", () => {
  const commandsSection =
    readRepoFile("docs/ARCHITECTURE.md")
      .split("## Commands")[1]
      ?.split("\n## ")[0] ?? "";

  it("names the three scripts under ## Commands", () => {
    expect(commandsSection).toContain("npm test");
    expect(commandsSection).toContain("npm run build");
    expect(commandsSection).toContain("npm run lint");
  });

  it("no longer records a missing command", () => {
    expect(commandsSection).not.toMatch(/^\s*-\s*\w+:\s*\(none\)/m);
  });
});
