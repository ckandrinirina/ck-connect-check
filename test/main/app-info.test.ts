import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readAppInfo } from "../../src/main/app-info.js";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const srcRoot = join(repoRoot, "src");

/** Writes a manifest into a fresh directory and returns its path. */
function fixtureManifest(manifest: unknown): string {
  const path = join(mkdtempSync(join(tmpdir(), "app-info-")), "package.json");
  writeFileSync(path, JSON.stringify(manifest), "utf8");
  return path;
}

const FIXTURE = {
  name: "some-other-app",
  version: "4.5.6",
  author: "Jane Doe",
  repository: { type: "git", url: "https://github.com/jane/some-other-app" },
  homepage: "https://github.com/jane/some-other-app",
};

describe("readAppInfo", () => {
  it("reads the app's own package.json by default", () => {
    expect(readAppInfo()).toEqual({
      name: "ck-connect-check",
      version: "1.0.0",
      author: "ANDRINIRINA Erick",
      repositoryUrl: "https://github.com/ckandrinirina/ck-connect-check",
    });
  });

  it("returns every field from the manifest it is given", () => {
    expect(readAppInfo(fixtureManifest(FIXTURE))).toEqual({
      name: "some-other-app",
      version: "4.5.6",
      author: "Jane Doe",
      repositoryUrl: "https://github.com/jane/some-other-app",
    });
  });

  it("follows the manifest when any one field changes", () => {
    const changed = readAppInfo(
      fixtureManifest({
        ...FIXTURE,
        name: "renamed",
        version: "9.9.9",
        author: "Someone Else",
        repository: { type: "git", url: "https://github.com/else/renamed" },
      }),
    );

    expect(changed).toEqual({
      name: "renamed",
      version: "9.9.9",
      author: "Someone Else",
      repositoryUrl: "https://github.com/else/renamed",
    });
  });

  it("refuses a manifest that leaves a field out rather than showing a blank", () => {
    const { author: _author, ...withoutAuthor } = FIXTURE;

    expect(() => readAppInfo(fixtureManifest(withoutAuthor))).toThrow(/author/);
  });
});

/** Every file under `src/`, as paths relative to the repo root. */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  });
}

/**
 * The manifest is the only place these are typed — a literal anywhere else is
 * a second copy the next release can forget to bump.
 */
describe("identity literals under src/", () => {
  const info = readAppInfo();
  const literals = [
    info.version,
    info.author,
    info.repositoryUrl.replace(/^https?:\/\//, ""),
  ];

  const files = sourceFiles(srcRoot)
    .map((path) => relative(repoRoot, path))
    .filter((path) => path !== join("src", "main", "app-info.ts"));

  it.each(literals)("never spells %s outside app-info.ts", (literal) => {
    const offenders = files.filter((path) =>
      readFileSync(join(repoRoot, path), "utf8").includes(literal),
    );

    expect(offenders).toEqual([]);
  });
});
