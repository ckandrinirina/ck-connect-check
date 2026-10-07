import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * The release job refuses a tag that does not match the version the app will
 * report — otherwise a `v1.0.1` Release could ship a build whose About panel
 * says 1.0.0.
 */
const script = fileURLToPath(
  new URL("../../scripts/check-release-tag.mjs", import.meta.url),
);

const { version } = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../../package.json", import.meta.url)),
    "utf8",
  ),
) as { version: string };

function check(...args: string[]) {
  const run = spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}

function nextPatch(semver: string): string {
  const [major, minor, patch] = semver.split(".");
  return `${String(major)}.${String(minor)}.${String(Number(patch) + 1)}`;
}

describe("check-release-tag", () => {
  it(`accepts v${version}`, () => {
    expect(check(`v${version}`).status).toBe(0);
  });

  it.each([
    [`v${nextPatch(version)}`, "another version"],
    [version, "the version without its v"],
  ])("refuses %s (%s), naming both values", (tag) => {
    const { status, output } = check(tag);
    expect(status).not.toBe(0);
    expect(output).toContain(tag);
    expect(output).toContain(`v${version}`);
  });

  it("refuses to run without a tag", () => {
    const { status, output } = check();
    expect(status).not.toBe(0);
    expect(output).toMatch(/usage/i);
  });
});
