import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The README's Download and Releasing sections. The download link is the same
 * latest-release URL the Pages site uses, and the release steps are the ones
 * the release workflow and `scripts/check-release-tag.mjs` actually enforce.
 */
function readRepoFile(relativePath: string): string {
  return readFileSync(
    new URL(`../../${relativePath}`, import.meta.url),
    "utf8",
  );
}

const readme = readRepoFile("README.md");
const lines = readme.split("\n");

const LATEST =
  "https://github.com/ckandrinirina/ck-connect-check/releases/latest/download";
const DMG_URL = `${LATEST}/ck-connect-check-mac.dmg`;
const ZIP_URL = `${LATEST}/ck-connect-check-mac.zip`;
const EXE_URL = `${LATEST}/ck-connect-check-windows-setup.exe`;

/** A level-2 section's body, up to the next level-2 heading. */
function section(heading: string): string {
  const start = lines.findIndex((line) => line.trim() === heading);
  expect(start, `README has no "${heading}" heading`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^#{1,2} /.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();
  expect(body.length).toBeGreaterThan(0);
  return body;
}

describe("the README's Download section", () => {
  it("links to the latest release's .dmg", () => {
    expect(section("## Download")).toContain(`(${DMG_URL})`);
  });

  it("links to the latest release's .zip", () => {
    expect(section("## Download")).toContain(`(${ZIP_URL})`);
  });

  it("uses the same .dmg link as the download page", () => {
    expect(readRepoFile("site/index.html")).toContain(`href="${DMG_URL}"`);
  });

  it("links to the latest release's Windows Setup.exe", () => {
    expect(section("## Download")).toContain(`(${EXE_URL})`);
  });

  it("uses the same Setup.exe link as the download page", () => {
    expect(readRepoFile("site/index.html")).toContain(`href="${EXE_URL}"`);
  });

  it("gives the SmartScreen route: More info, then Run anyway", () => {
    const body = section("## Download");
    expect(body).toContain("SmartScreen");
    expect(body).toMatch(/\*\*More info\*\*/);
    expect(body).toMatch(/\*\*Run anyway\*\*/);
    expect(body.indexOf("More info")).toBeLessThan(body.indexOf("Run anyway"));
  });

  it("gives the right-click → Open route", () => {
    const body = section("## Download");
    expect(body).toMatch(/right-click/i);
    expect(body).toMatch(/\*\*Open\*\*/);
  });

  it("gives the System Settings → Privacy & Security → Open Anyway route", () => {
    const body = section("## Download");
    expect(body).toContain("System Settings");
    expect(body).toContain("Privacy & Security");
    expect(body).toContain("Open Anyway");
    expect(body.indexOf("System Settings")).toBeLessThan(
      body.indexOf("Open Anyway"),
    );
  });

  it("comes before Install and build, so a reader who only wants the app stops there", () => {
    const download = lines.findIndex((line) => line.trim() === "## Download");
    const install = lines.findIndex(
      (line) => line.trim() === "## Install and build",
    );
    expect(download).toBeGreaterThanOrEqual(0);
    expect(download).toBeLessThan(install);
  });
});

describe("the README's intro", () => {
  /** The paragraph under the title, before the first level-2 heading. */
  function intro(): string {
    const title = lines.findIndex((line) => line.trim() === "# ck-connect-check");
    const rest = lines.slice(title + 1);
    const end = rest.findIndex((line) => /^## /.test(line));
    return rest.slice(0, end).join(" ").replace(/\s+/g, " ").trim();
  }

  it("names both platforms", () => {
    expect(intro()).toMatch(/macOS/);
    expect(intro()).toMatch(/Windows/);
  });

  it("no longer calls it a macOS app", () => {
    expect(intro()).not.toMatch(/^An? macOS\b/);
  });
});

describe("the README's Releasing section", () => {
  it("says to bump the version in package.json first", () => {
    const body = section("## Releasing");
    expect(body).toContain("package.json");
    expect(body).toMatch(/bump|npm version/i);
  });

  it("then to tag vX.Y.Z", () => {
    const body = section("## Releasing");
    expect(body).toMatch(/git tag v\d+\.\d+\.\d+|git tag vX\.Y\.Z/);
  });

  it("then to push the tag", () => {
    const body = section("## Releasing");
    expect(body).toMatch(
      /git push origin v\d+\.\d+\.\d+|git push origin vX\.Y\.Z/,
    );
  });

  it("orders the three steps bump, tag, push", () => {
    const body = section("## Releasing");
    const bump = body.search(/npm version|bump/i);
    const tag = body.search(/git tag v/);
    const push = body.search(/git push origin v/);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThan(tag);
    expect(tag).toBeLessThan(push);
  });

  it("points at the release workflow that does the rest", () => {
    expect(section("## Releasing")).toContain(".github/workflows/release.yml");
  });
});
