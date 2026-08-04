import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseConfig, readPlanDaysEntry } from "../src/config/config.js";
import { DEFAULT_SYNC_STALE_AFTER_MINUTES } from "../src/config/defaults.js";
import { isNewPlan } from "../src/domain/allowance.js";
import type { AllowanceAnchor } from "../src/domain/allowance.js";
import { readPace } from "../src/domain/pace.js";
import type { MonthStatistics } from "../src/hilink/types.js";

/**
 * A documentation-rot guard rather than a style check. The README tells a
 * stranger which commands to run and which settings exist; every one of those
 * claims is checked here against the code that has to honour it, so the page
 * cannot quietly stop being true.
 *
 * "Against the code" is meant literally. A README assertion that only greps its
 * own prose proves the prose exists, never that it is true — so the numbers the
 * page quotes are compared with the constants behind them, and the worked
 * example it walks a reader through is recomputed here by the very function the
 * panel calls.
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
  "## The pace meter",
  "## When it syncs by itself",
  "## After a top-up",
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

/**
 * The settings `config.ts` actually parses, obtained by parsing a file that
 * states every one of them rather than by reading the interface. The interface
 * is what the app is allowed to hold; this is what survives a round trip through
 * the reader, which is the thing a user editing `config.json` by hand meets.
 */
function parsedConfigKeys(): string[] {
  return Object.keys(
    parseConfig({
      host: "192.168.8.1",
      pollIntervalSeconds: 30,
      activePollIntervalSeconds: 2,
      warnThresholdPercent: 90,
      planLimitBytes: 150_000_000_000,
      planDays: 30,
      planCapConfirmed: true,
      syncStaleAfterMinutes: 30,
      routerUsername: "admin",
      routerPasswordBlob: "AAAA",
      orangeForfaitLabel: "Wifiber Go+ SSE",
      allowanceAnchor: {
        planLabel: "NET MONTH 150",
        remainingBytes: 90_000_000_000,
        expiresAt: "2026-08-31T12:00:00.000Z",
        routerMonthBytes: 1_000,
        routerClearTime: "2026-8-1",
        syncedAt: "2026-08-11T12:00:00.000Z",
      },
    }),
  );
}

/** The keys the README's config table names, in its first column. */
function documentedConfigKeys(): string[] {
  return [...readme.matchAll(/^\|\s*`(\w+)`\s*\|/gm)].map((match) => match[1]);
}

/** The line of the config table describing `key`, so a default can be checked. */
function configTableRow(key: string): string {
  const row = readme
    .split("\n")
    .find((line) => line.startsWith(`| \`${key}\``));

  expect(row).toBeTruthy();

  return row!;
}

/** A named numeric constant's value, read out of a module's source. */
function sourceConstant(relativePath: string, name: string): number {
  const source = readRepoFile(relativePath);
  const literal = new RegExp(`const ${name} = ([\\d._]+);`).exec(source)?.[1];

  expect(literal).toBeTruthy();

  return Number(literal!.replaceAll("_", ""));
}

const GIGAOCTET = 1_000_000_000;
const MILLISECONDS_PER_DAY = 86_400_000;

/**
 * The README's worked example, as data: a 150 Go plan running 30 days, ten days
 * in, with 60 Go spent. `readPace` turns this into 6 Go a day against an
 * afforded 5 — a ratio of exactly 1.20, which is the boundary case the page
 * claims lands in `over`.
 *
 * August on purpose: no daylight-saving shift falls inside the window in either
 * hemisphere, so the elapsed day count is exact rather than 23 or 25 hours out.
 */
const WORKED_EXAMPLE_CAP = 150 * GIGAOCTET;
const WORKED_EXAMPLE_DAYS = 30;
const workedExampleExpiry = new Date("2026-08-31T12:00:00.000Z");
const workedExampleNow = new Date(
  workedExampleExpiry.getTime() - 20 * MILLISECONDS_PER_DAY,
);

const workedExampleAnchor: AllowanceAnchor = {
  planLabel: "NET MONTH 150",
  // 150 Go bought, 60 Go gone.
  remainingBytes: 90 * GIGAOCTET,
  expiresAt: workedExampleExpiry,
  routerMonthBytes: 0,
  routerClearTime: "2026-8-1",
  syncedAt: workedExampleNow,
};

const workedExampleMonth: MonthStatistics = {
  monthDownloadBytes: 0,
  monthUploadBytes: 0,
  monthDurationSeconds: 0,
  monthLastClearTime: "2026-8-1",
};

const workedExampleClock = { now: () => workedExampleNow };

function readWorkedExample(planDays: number | null) {
  return readPace({
    anchor: workedExampleAnchor,
    month: workedExampleMonth,
    planLimitBytes: WORKED_EXAMPLE_CAP,
    planDays,
    clock: workedExampleClock,
  });
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

  it.each(parsedConfigKeys())(
    "gives %s a row in the config table, since config.ts parses it",
    (key) => {
      expect(documentedConfigKeys()).toContain(key);
    },
  );

  it("documents no setting the config reader would throw away", () => {
    // The other direction of the same guard: a row for a key nothing parses
    // sends a reader to edit a field the app silently drops.
    expect([...documentedConfigKeys()].sort()).toEqual(
      [...parsedConfigKeys()].sort(),
    );
  });

  it.each(["planDays", "syncStaleAfterMinutes"])(
    "names %s, the setting this release added",
    (key) => {
      expect(parsedConfigKeys()).toContain(key);
      expect(documentedConfigKeys()).toContain(key);
    },
  );

  it("says the router password is in the Keychain, not in the config file", () => {
    expect(readme).toMatch(/Keychain/);
    expect(readme).toMatch(
      /never (?:stored )?in `?config\.json`?|not in `?config\.json`?/i,
    );
  });

  /*
   * The panel and menu bar screenshots T-35 asked for are still not here, and
   * T-41 needs a new one: the panel it would show is now two views behind a
   * header toggle, so the pre-T-45 capture would be a picture of an app that no
   * longer exists.
   *
   * The image the README expects is `docs/media/panel.png`, and it has to show
   * the compacted panel — dial, pace meter, allowance and rates in the main
   * view, with the settings toggle in the header. It needs a running app on a
   * real screen against a real router, which nothing in this suite can produce.
   *
   * The assertion that would guard it is deliberately absent rather than
   * skipped, so it cannot pass by describing a file nobody has taken. The link
   * check above covers it the moment the README references it.
   */
});

/**
 * The plan length, the second of the two figures the app has to be told. The
 * carrier states an expiry date and never a duration, so this is the only input
 * that can say how far the period has travelled.
 */
describe("README.md on the plan length", () => {
  it("names the setting and says where it is typed", () => {
    expect(readme).toMatch(/plan length|how long (?:the|your) plan/i);
    // It moved behind the header's toggle in T-45; a reader sent to look under
    // the dial for it would not find it.
    expect(readme).toMatch(/settings/i);
  });

  it("says it is typed in whole days, which is what the reader refuses to round", () => {
    expect(readme).toMatch(/whole days/i);
    expect(readPlanDaysEntry("30").ok).toBe(true);
    expect(readPlanDaysEntry("30.5")).toEqual({
      ok: false,
      reason: "not-whole",
    });
  });

  it("points at a field the settings view actually carries", () => {
    const page = readRepoFile("src/renderer/index.html");
    expect(page).toContain("data-settings-view");
    expect(page).toContain("data-plan-days-input");
  });

  it("says the length is optional, as the config reader treats it", () => {
    // `planDays` falls back to null rather than throwing, and the pace is
    // defined to stop short rather than be drawn over a guessed period.
    expect(parseConfig({}).planDays).toBeNull();
    expect(readme).toMatch(/until (?:it|one) is set|without (?:it|one)/i);
  });
});

/**
 * The pace, which is the release's headline. Every number the section quotes is
 * recomputed here from `pace.ts`, so the page cannot describe a band the code
 * does not draw.
 */
describe("README.md on the pace meter", () => {
  it("describes it as a coloured meter rather than a sentence", () => {
    expect(readme).toMatch(/coloured meter/i);
    expect(readRepoFile("src/renderer/index.html")).toContain(
      "data-pace-meter",
    );
  });

  it.each(["safe", "warning", "over"])(
    "names the %s band, which the stylesheet colours",
    (band) => {
      expect(readme).toContain(band);
      expect(readRepoFile("src/renderer/popover.css")).toContain(
        `.pace[data-pace-state="${band}"]`,
      );
    },
  );

  it.each([
    ["safe", "green", "--safe"],
    ["warning", "orange", "--warn"],
    ["over", "red", "--over"],
  ])(
    "gives the %s band the colour the stylesheet gives it",
    (band, colour, property) => {
      expect(readme).toContain(colour);

      const rule = readRepoFile("src/renderer/popover.css")
        .split(`.pace[data-pace-state="${band}"]`)[1]
        ?.split("}")[0];

      expect(rule).toContain(`var(${property})`);
    },
  );

  it("quotes the band boundaries the constants in pace.ts actually use", () => {
    expect(sourceConstant("src/domain/pace.ts", "SAFE_PACE")).toBe(1);
    expect(sourceConstant("src/domain/pace.ts", "WARNING_PACE")).toBe(1.2);
    // Both boundaries stated on the page, in the two-decimal form the worked
    // example uses.
    expect(readme).toContain("1.00");
    expect(readme).toContain("1.20");
  });

  it("walks the 5 Go a day example the code produces", () => {
    const reading = readWorkedExample(WORKED_EXAMPLE_DAYS);

    expect(reading?.tier).toBe(3);
    expect(reading?.affordedPerDay).toBe(5 * GIGAOCTET);
    expect(reading?.averagePerDay).toBe(6 * GIGAOCTET);

    expect(readme).toContain("150 Go");
    expect(readme).toContain("30 days");
    expect(readme).toContain("5 Go");
    expect(readme).toContain("6 Go");
  });

  it("puts that example in the band the README says it lands in", () => {
    const reading = readWorkedExample(WORKED_EXAMPLE_DAYS);

    // Exactly 1.20, the inclusive edge T-43 moved. The page calls this `over`,
    // so the code had better agree.
    expect(reading?.pace).toBeCloseTo(1.2, 10);
    expect(reading?.state).toBe("over");
    expect(readme).toMatch(/1\.20[^.]*\bover\b|\bover\b[^.]*1\.20/);
  });

  it("says the meter needs the length as well as the cap, as the tiers do", () => {
    // Without a length there is no afforded figure, so there is no meter to
    // draw — which is exactly what the README has to tell a reader who has
    // typed only the cap.
    const withoutLength = readWorkedExample(null);

    expect(withoutLength?.tier).toBe(2);
    expect(withoutLength?.affordedPerDay).toBeNull();
    expect(withoutLength?.state).toBeNull();

    expect(readme).toMatch(/tier/i);
  });

  it("says the fill is pinned rather than truncated past twice the budget", () => {
    expect(readme).toMatch(/twice/i);
    expect(readRepoFile("src/main/view-model.ts")).toContain("PACE_METER_SPAN");
  });
});

/** The half-hour window, and the guards that keep it off the router's lockout. */
describe("README.md on the automatic sync", () => {
  it("states the window the default actually is", () => {
    expect(DEFAULT_SYNC_STALE_AFTER_MINUTES).toBe(30);
    expect(readme).toMatch(
      new RegExp(`${DEFAULT_SYNC_STALE_AFTER_MINUTES} minutes`),
    );
    expect(readme).toMatch(/half an hour/i);
  });

  it("gives syncStaleAfterMinutes the default the constant holds", () => {
    expect(configTableRow("syncStaleAfterMinutes")).toContain(
      `Default \`${String(DEFAULT_SYNC_STALE_AFTER_MINUTES)}\``,
    );
  });

  it("says it runs on opening the panel and on its own timer", () => {
    expect(readme).toMatch(/open/i);
    expect(readme).toMatch(/timer|on its own|by itself/i);

    // Both moments go through one staleness check, and it is measured against
    // the configured window rather than a number of its own.
    const main = readRepoFile("src/main/main.ts");
    expect(main).toContain("isAnchorStale");
    expect(main).toContain("config.syncStaleAfterMinutes");
    expect(main).toContain("startAutomatic");
  });

  it("says a failed automatic sync is not retried, as the code parks it", () => {
    expect(readme).toMatch(
      /not retried|never retried|no (?:further|more) automatic/i,
    );
    expect(readme).toMatch(/five/i);
    expect(readRepoFile("src/main/sync.ts")).toMatch(/parked/);
  });

  it("says a window nobody can use falls back rather than taking the config down", () => {
    expect(
      parseConfig({ syncStaleAfterMinutes: 0 }).syncStaleAfterMinutes,
    ).toBe(DEFAULT_SYNC_STALE_AFTER_MINUTES);
    expect(readme).toMatch(/syncStaleAfterMinutes/);
  });
});

/**
 * What to do after topping up — the flow with no button behind it, which is
 * precisely why it has to be written down.
 */
describe("README.md on a new plan", () => {
  it("says a new plan needs a Sync and a confirmation of the cap", () => {
    expect(readme).toMatch(/\*\*Sync\*\*|`Sync`|Sync/);
    expect(readme).toMatch(/confirm/i);
  });

  it("says outright that there is no reset control", () => {
    expect(readme).toMatch(/no reset/i);
  });

  it("describes no reset the panel does not have", () => {
    // The claim is only honest while the page really carries no such control.
    const page = readRepoFile("src/renderer/index.html");

    expect(page).not.toMatch(/data-reset\b/);
    expect(page).not.toMatch(/>\s*Reset\s*</i);
    expect(page).toContain("data-plan-cap-confirm");
  });

  it("names the sign the app itself uses to notice the new plan", () => {
    // A bigger remaining volume than the stored cap, which is the one sign that
    // catches a top-up the carrier labelled identically.
    expect(
      isNewPlan(
        { ...workedExampleAnchor, remainingBytes: 150 * GIGAOCTET },
        { ...workedExampleAnchor, remainingBytes: 10 * GIGAOCTET },
        50 * GIGAOCTET,
      ),
    ).toBe(true);

    expect(readme).toMatch(/top[- ]up/i);
    expect(readme).toMatch(/planCapConfirmed/);
  });

  it("says what disappears while the cap is unconfirmed", () => {
    // The dial and the share go; the tier 1 reading stays, because it needs no
    // cap and is therefore still true.
    expect(parseConfig({ planCapConfirmed: false }).planCapConfirmed).toBe(
      false,
    );
    expect(readme).toMatch(/dial/i);
    expect(configTableRow("planCapConfirmed")).toMatch(/sync/i);
  });
});
