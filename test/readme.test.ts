import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * A documentation-rot guard rather than a style check. The README tells a
 * stranger which commands to run and which settings exist; every one of those
 * claims is checked here against the code that has to honour it, so the page
 * cannot quietly stop being true.
 */
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

const readme = readRepoFile("README.md");

/** The sections the README has to carry, by the heading each one opens with. */
const REQUIRED_HEADINGS = [
  "## What it does",
  "## What it was tested against",
  "## Install and build",
  "## The plan cap and the carrier sync",
  "## The config file",
  "## Troubleshooting",
];

/**
 * Every `[text](target)` and `![alt](target)` whose target is a path in this
 * repository. Absolute URLs are somebody else's to keep working.
 */
function relativeTargets(markdown: string): string[] {
  return [...markdown.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/g)]
    .map((match) => match[1])
    .filter((target) => !/^[a-z]+:/i.test(target) && !target.startsWith("#"))
    .map((target) => target.split("#")[0]);
}

/** Every `npm run <script>` the README tells a reader to type. */
function namedScripts(markdown: string): string[] {
  return [
    ...new Set(
      [...markdown.matchAll(/npm run ([a-z][\w-]*)/g)].map((match) => match[1]),
    ),
  ];
}

/**
 * The settings the app actually reads, taken from the `AppConfig` interface
 * rather than from a list kept here — a key added to the config without a line
 * in the README is exactly the drift this guards against.
 */
function configKeys(): string[] {
  const source = readRepoFile("src/config/defaults.ts");
  const body = /export interface AppConfig \{([\s\S]*?)\n\}/.exec(source)?.[1];

  expect(body).toBeTruthy();

  return [...body!.matchAll(/^ {2}(\w+)\??:/gm)].map((match) => match[1]);
}

describe("README.md", () => {
  it("exists at the root, where a visitor lands", () => {
    expect(existsSync(new URL("../README.md", import.meta.url))).toBe(true);
  });

  it("opens with the app's name, its mark, and what it is for", () => {
    const opening = readme.split("\n").slice(0, 12).join("\n");

    expect(opening).toContain("# ck-connect-check");
    expect(opening).toMatch(/!\[[^\]]*\]\(docs\/media\/icon\.png\)/);
    // The one-sentence statement: a visitor should not have to scroll to learn
    // what the thing is.
    expect(opening).toMatch(/menu bar/i);
    expect(opening).toMatch(/Huawei/);
  });

  it.each(REQUIRED_HEADINGS)("carries the %s section", (heading) => {
    expect(readme).toContain(heading);
  });

  it.each(relativeTargets(readme))(
    "links %s to a file that exists",
    (target) => {
      expect(existsSync(new URL(target, `file://${repoRoot}`))).toBe(true);
    },
  );

  it.each(namedScripts(readme))(
    "names `npm run %s`, which package.json defines",
    (script) => {
      const packageJson = JSON.parse(readRepoFile("package.json")) as {
        scripts?: Record<string, string>;
      };
      expect(packageJson.scripts).toHaveProperty(script);
    },
  );

  it("says which device and software version were actually tested", () => {
    // The router side was verified against one device. Saying so is the
    // difference between a report and a compatibility claim.
    expect(readme).toContain("B310s-22");
    expect(readme).toContain("21.333.01.00.00");
  });

  it("presents the USSD menu as one carrier's, not as universal", () => {
    expect(readme).toContain("#359#");
    expect(readme).toMatch(/one carrier|this carrier|carrier's own menu/i);
  });

  it.each(configKeys())("documents the %s setting", (key) => {
    expect(readme).toContain(key);
  });

  it("says the router password is in the Keychain, not in the config file", () => {
    expect(readme).toMatch(/Keychain/);
    expect(readme).toMatch(
      /never (?:stored )?in `?config\.json`?|not in `?config\.json`?/i,
    );
  });

  /*
   * The panel and menu bar screenshots T-35 asked for are not here yet — they
   * need a running app on a real screen, and nothing in this suite can produce
   * one. The assertion that would guard them is deliberately absent rather
   * than skipped, so it cannot pass by describing files nobody has taken. The
   * link check above covers them the moment the README references them.
   */
});
