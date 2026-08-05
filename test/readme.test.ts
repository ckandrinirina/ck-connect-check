import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseConfig, readPlanDaysEntry } from "../src/config/config.js";
import {
  DEFAULT_SYNC_STALE_AFTER_MINUTES,
  defaultConfig,
} from "../src/config/defaults.js";
import { isNewPlan } from "../src/domain/allowance.js";
import type { AllowanceAnchor } from "../src/domain/allowance.js";
import { carrierFrom } from "../src/domain/carrier.js";
import type { Carrier } from "../src/domain/carrier.js";
import { readMonthlyPace, readPace } from "../src/domain/pace.js";
import { calendarMonthPeriod, readPortalUsage } from "../src/domain/quota.js";
import type { SnapshotResult } from "../src/hilink/client.js";
import type { MonthStatistics } from "../src/hilink/types.js";
import type { PortalStatus } from "../src/main/poller.js";
import { DEVICES_MENU_LABEL, buildTrayTitle } from "../src/main/tray.js";
import { INFO_CONSO_PATH, PORTAL_BASE_URL } from "../src/orange/portal.js";
import { selectForfait } from "../src/orange/select.js";
import type { OrangeForfait } from "../src/orange/types.js";

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

/**
 * The sections the README has to carry, by the heading each one opens with.
 *
 * The one allowance section became three in T-58. There is no longer a single
 * answer to "where does the figure come from" — it is a USSD dialogue on YAS
 * and a web page on Orange — so a reader with either SIM needs a heading of
 * their own to land on rather than a page written for whoever came first.
 */
const REQUIRED_HEADINGS = [
  "## What it does",
  "## What it was tested against",
  "## Install and build",
  "## Where the allowance comes from",
  "### On Orange — the info-conso portal",
  "### On YAS — the USSD sync",
  "## The pace meter",
  "## When it syncs by itself",
  "## After a top-up",
  "## The config file",
  "## Troubleshooting",
];

/** The heading that opens the Orange path, and the one that opens the YAS path. */
const ORANGE_HEADING = "### On Orange — the info-conso portal";
const YAS_HEADING = "### On YAS — the USSD sync";

const readmeLines = readme.split("\n");

/**
 * One section's body, from its heading down to the next heading of the same or
 * a higher level.
 *
 * Per-carrier assertions need this. Asserting a claim against the whole page
 * proves only that the sentence is somewhere on it, which is exactly how a
 * README ends up telling an Orange reader to press a button their panel does
 * not draw: the sentence is true of YAS and the page never says so.
 */
function section(heading: string): string {
  const level = /^#+/.exec(heading)?.[0].length ?? 0;

  expect(level).toBeGreaterThan(0);

  const start = readmeLines.findIndex((line) => line.startsWith(heading));

  expect(start).toBeGreaterThanOrEqual(0);

  const rest = readmeLines.slice(start + 1);
  const nextHeading = new RegExp(`^#{1,${String(level)}} `);
  const end = rest.findIndex((line) => nextHeading.test(line));
  const body = (end === -1 ? rest : rest.slice(0, end)).join("\n").trim();

  // A heading with nothing under it would satisfy every `not.toMatch` below
  // while saying nothing at all — the empty-versus-empty comparison T-49
  // caught in its own suite.
  expect(body.length).toBeGreaterThan(0);

  return body;
}

/** The heading a line sits under, so a claim can be placed as well as found. */
function owningHeading(lineIndex: number): string {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const line = readmeLines[index];
    if (line !== undefined && line.startsWith("#")) return line;
  }

  return "";
}

/**
 * Instructions that only one carrier can carry out. Pressing Sync does nothing
 * on Orange — the panel does not draw the button — and the portal answers a
 * plain `GET`, so there is no admin password in the Orange path at all.
 */
const CARRIER_ONLY_INSTRUCTIONS = [
  // Every emphasis the page might dress the button in — `Press **Sync**`,
  // `**Press Sync**`, `press `Sync``. Matching only one spelling would let the
  // instruction escape the guard by being written the other way.
  /\bpress\s+(?:\*\*|`)?sync\b/i,
  /\basks for the router's admin password\b/i,
  /\benter the router's admin password\b/i,
];

/** Every line of the README that gives one of those instructions. */
function carrierOnlyInstructionLines(): { line: string; heading: string }[] {
  return readmeLines
    .map((line, index) => ({ line, heading: owningHeading(index) }))
    .filter(({ line }) =>
      CARRIER_ONLY_INSTRUCTIONS.some((pattern) => pattern.test(line)),
    );
}

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

/**
 * The Orange forfait the live capture states, with the volume it stated. The
 * README quotes the menu bar title this produces, so the page and the tray are
 * checked against one another rather than against a number typed twice.
 */
const WIFIBER_CONSUMED_BYTES = 7_370_000_000;

const wifiber: OrangeForfait = {
  label: "Wifiber Go+ SSE",
  nature: "Internet",
  bundleType: "data",
  consumedBytes: WIFIBER_CONSUMED_BYTES,
};

/** A second live data forfait — the case that makes the choice worth offering. */
const topUp: OrangeForfait = {
  label: "Pass Internet 5Go",
  nature: "Internet",
  bundleType: "data",
  consumedBytes: 1_000_000_000,
};

/** The cap the README's Orange example types in, chosen to read `37%`. */
const ORANGE_EXAMPLE_CAP = 20 * GIGAOCTET;

/** A portal that answered, holding the forfait above. Never fetched here. */
const portalStanding: PortalStatus = {
  reading: {
    forfait: wifiber,
    candidates: [wifiber],
    remembered: true,
    at: workedExampleNow,
  },
  live: true,
};

/** One router snapshot, on whichever network the caller names. */
function snapshotOn(id: Carrier, fullName: string): SnapshotResult {
  return {
    online: true,
    snapshot: {
      month: workedExampleMonth,
      traffic: {
        downloadRateBps: 0,
        uploadRateBps: 0,
        connectTimeSeconds: 0,
      },
      status: {
        connected: true,
        signalBars: 4,
        maxSignalBars: 5,
        connectedDevices: 3,
        networkTypeCode: 101,
      },
      carrier: { carrier: fullName, id },
      billing: {
        startDay: 1,
        routerDataLimitBytes: 0,
        warnThresholdPercent: 90,
      },
    },
  };
}

/** August 2026 — 31 days long, and the fourth is the day the SIM moved. */
const augustFourth = new Date(2026, 7, 4);
const augustClock = { now: () => augustFourth };

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
   * The panel capture T-35 and T-41 waited for is now `docs/media/panel-orange.png`,
   * guarded at the end of this file rather than here.
   *
   * It is the Orange panel, not the YAS one T-41 implied: the SIM moved to
   * Orange on the day that release was still open, and a YAS panel cannot be
   * photographed without a YAS SIM back in the router. What the criterion was
   * protecting against was a stale *layout*, and this is the compacted
   * post-T-45 panel with the settings toggle in the header.
   *
   * The menu bar capture T-35 asked for is still absent, and no assertion
   * stands in for it — the README references no menu bar image, so the link
   * check has nothing to hold.
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

/**
 * Which network the app is on, and where that answer comes from.
 *
 * The carrier is read off `/api/net/current-plmn` on every poll and is not a
 * setting, so a reader must never go looking for one. That is a claim about the
 * config as much as about the prose, and it is checked both ways here: the
 * table has to map the names the router really spells, and the config has to
 * carry no key a reader could mistake for a carrier switch.
 */
describe("README.md on the carrier it detects", () => {
  it("says the carrier is read from the router rather than configured", () => {
    const where = section("## Where the allowance comes from");

    expect(where).toMatch(/detect/i);
    // The endpoint named, so the claim is checkable rather than reassuring.
    expect(where).toContain("/api/net/current-plmn");
    expect(where).toMatch(/not (?:a )?configur|never configur|rather than/i);
  });

  it.each([
    ["ORANGE MG", "orange"],
    ["Yas", "yas"],
  ])("names %s, which carrier.ts maps to %s", (fullName, id) => {
    expect(carrierFrom(fullName)).toBe(id);
    expect(readme).toContain(fullName);
  });

  it("offers no setting a reader could mistake for a carrier switch", () => {
    // The other direction of the same claim. A `carrier` key would make the
    // page's "detected, not configured" false the moment it landed.
    const keys = parsedConfigKeys();

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => /carrier|network|operator/i.test(key))).toEqual(
      [],
    );
  });

  it("says an unmapped network is its own answer, as carrierFrom returns", () => {
    expect(carrierFrom("Telma")).toBe("unknown");
    expect(carrierFrom(undefined)).toBe("unknown");
    expect(section("## Where the allowance comes from")).toMatch(
      /another network|any other network|unknown|neither/i,
    );
  });
});

/**
 * The Orange path. Every claim is anchored to the module that implements it —
 * the portal's own constants, the calendar-month period, the portal arithmetic,
 * the forfait selection and the tray title — rather than to the presence of the
 * word "Orange" somewhere on the page.
 */
describe("README.md on Orange", () => {
  const orange = () => section(ORANGE_HEADING);

  it("names the page the app actually fetches", () => {
    // Built from the boundary's own constants, so moving the portal breaks this
    // rather than leaving the README quietly wrong.
    const portalUrl = new URL(INFO_CONSO_PATH, PORTAL_BASE_URL).toString();

    expect(portalUrl).toBe("http://123.orange.mg/info-conso/");
    expect(orange()).toContain(portalUrl);
  });

  it("says the read carries no credential, as the boundary carries none", () => {
    const source = readRepoFile("src/orange/portal.ts");
    const body = /export interface OrangePortalOptions \{([\s\S]*?)\n\}/.exec(
      source,
    )?.[1];

    expect(body).toBeTruthy();

    const options = [...body!.matchAll(/^ {2}(\w+)\??:/gm)].map(
      (match) => match[1],
    );

    // Two knobs, and neither of them is a credential: there is nothing for the
    // README to tell a reader to type.
    expect([...options].sort()).toEqual(["baseUrl", "timeoutMs"]);
    expect(orange()).toMatch(
      /no (?:login|password|account|authentication)|without (?:a )?(?:login|password)|unauthenticated/i,
    );
  });

  it("says the period is the calendar month the code reads", () => {
    const period = calendarMonthPeriod(augustClock);

    expect(period.planDays).toBe(31);
    expect(period.elapsedDays).toBe(4);
    expect(orange()).toMatch(/calendar month/i);
  });

  it("says the plan length is not typed, as the reading takes none", () => {
    const source = readRepoFile("src/domain/pace.ts");
    const body = /export interface MonthlyPaceInput \{([\s\S]*?)\n\}/.exec(
      source,
    )?.[1];

    expect(body).toBeTruthy();

    const inputs = [...body!.matchAll(/^ {2}(\w+)\??:/gm)].map(
      (match) => match[1],
    );

    // No `planDays` anywhere in it — the calendar supplies the period, so the
    // field is not on the Orange panel and must not be asked for on the page.
    expect(inputs).not.toContain("planDays");
    expect(orange()).toMatch(
      /no plan length|never typed|not typed|from the calendar/i,
    );
  });

  it("says the cap is typed, since the portal states none", () => {
    const capless = readMonthlyPace({
      consumedBytes: WIFIBER_CONSUMED_BYTES,
      planLimitBytes: null,
      clock: augustClock,
    });

    // The consumed volume survives without a cap; every share does not.
    expect(capless.usedBytes).toBe(WIFIBER_CONSUMED_BYTES);
    expect(capless.usedShare).toBeNull();
    expect(capless.state).toBeNull();

    const capped = readMonthlyPace({
      consumedBytes: WIFIBER_CONSUMED_BYTES,
      planLimitBytes: ORANGE_EXAMPLE_CAP,
      clock: augustClock,
    });

    expect(capped.usedShare).toBeCloseTo(0.3685, 10);
    expect(orange()).toMatch(/cap|plan size/i);
    expect(orange()).toMatch(/typed|type it|you type/i);
  });

  it("says the portal states consumed, which is how the arithmetic runs", () => {
    const usage = readPortalUsage(WIFIBER_CONSUMED_BYTES, ORANGE_EXAMPLE_CAP);

    // The figure passes through untouched and the remainder is the derived
    // half — the reverse of YAS, which is the sentence the page has to carry.
    expect(usage.usedBytes).toBe(WIFIBER_CONSUMED_BYTES);
    expect(usage.remainingBytes).toBe(
      ORANGE_EXAMPLE_CAP - WIFIBER_CONSUMED_BYTES,
    );
    expect(orange()).toMatch(/consumed|spent|used/i);
  });

  it("names the forfait, and the setting that remembers a chosen one", () => {
    const alone = selectForfait([wifiber, topUp]);

    expect(alone.remembered).toBe(false);
    expect(alone.candidates).toHaveLength(2);

    const chosen = selectForfait([wifiber, topUp], wifiber.label);

    expect(chosen.remembered).toBe(true);
    expect(chosen.selected?.label).toBe(wifiber.label);
    expect(
      parseConfig({ orangeForfaitLabel: wifiber.label }).orangeForfaitLabel,
    ).toBe(wifiber.label);

    expect(orange()).toContain(wifiber.label);
    expect(readme).toContain("orangeForfaitLabel");
  });

  it("quotes the menu bar titles buildTrayTitle actually produces", () => {
    const result = snapshotOn("orange", "ORANGE MG");

    const capped = buildTrayTitle(
      result,
      { ...defaultConfig(), planLimitBytes: ORANGE_EXAMPLE_CAP },
      workedExampleClock,
      portalStanding,
    );
    const uncapped = buildTrayTitle(
      result,
      defaultConfig(),
      workedExampleClock,
      portalStanding,
    );

    expect(capped).toBe("7.4Go · 37%");
    expect(uncapped).toBe("7.4Go");
    expect(orange()).toContain(capped);
    expect(orange()).toContain(uncapped);
  });

  it("gives no instruction the Orange panel cannot carry out", () => {
    const body = orange();

    for (const pattern of CARRIER_ONLY_INSTRUCTIONS) {
      expect(body).not.toMatch(pattern);
    }
  });
});

/**
 * The YAS path, which is unchanged and has to stay written down as such. The
 * risk here is the opposite of the Orange one: not a missing section, but a YAS
 * instruction left standing where a reader on the other SIM will meet it.
 */
describe("README.md on YAS", () => {
  const yas = () => section(YAS_HEADING);

  it("keeps the dialogue, the password and the Sync press in its own section", () => {
    const body = yas();

    expect(body).toContain("#359#");
    expect(body).toMatch(/password/i);
    expect(body).toMatch(/Sync/);
  });

  it("puts every carrier-only instruction under a heading that says YAS", () => {
    const instructions = carrierOnlyInstructionLines();

    // Guarded against passing on an empty page: the README really does give
    // these instructions, and the claim is about where they sit, not whether
    // they were deleted.
    expect(instructions.length).toBeGreaterThan(0);

    for (const { line, heading } of instructions) {
      expect(`${heading} :: ${line}`).toMatch(/YAS/);
    }
  });

  it("takes its menu bar figure from the anchor, not from the portal", () => {
    // The same portal standing goes in as the Orange case above; on YAS the
    // title is built from the anchor instead, which is the branch the page's
    // two sections describe.
    const title = buildTrayTitle(
      snapshotOn("yas", "Yas"),
      {
        ...defaultConfig(),
        planLimitBytes: WORKED_EXAMPLE_CAP,
        allowanceAnchor: workedExampleAnchor,
      },
      workedExampleClock,
      portalStanding,
    );

    expect(title).toBe("60Go · 40%");
  });

  it("marks its automatic sync as the YAS path, since Orange has none", () => {
    const heading = readmeLines.find((line) =>
      line.startsWith("## When it syncs by itself"),
    );

    expect(heading).toMatch(/YAS/);
  });
});

/*
 * The Orange panel screenshot T-58 asked for now exists: a capture of the app
 * running against a SIM on the Orange network, taken on a real screen.
 *
 * These assertions hold the README to showing it, and hold the file to being
 * the shape the panel actually renders. They cannot be satisfied by a drawn or
 * borrowed image of the right dimensions — but nothing in a test can prove an
 * image is a photograph of a running app, so what is checked here is the part
 * a test can honestly hold: that the README points at it, that it is there, and
 * that its height matches the panel's own asserted budget rather than some
 * other window's.
 */
describe("README.md on the Orange panel it shows", () => {
  const SCREENSHOT = "docs/media/panel-orange.png";

  it("shows the Orange panel in its Orange section", () => {
    const orange = section(ORANGE_HEADING);

    expect(orange).toMatch(
      new RegExp(`!\\[[^\\]]*\\]\\(${SCREENSHOT.replace(/[./]/g, "\\$&")}\\)`),
    );
  });

  it("has that capture on disk", () => {
    expect(existsSync(new URL(SCREENSHOT, `file://${repoRoot}`))).toBe(true);
  });

  it("captures the panel at the height the panel asserts for itself", () => {
    // The renderer suite pins the worst-case panel at 497 px. A capture of some
    // other window — or of the pre-T-61 panel, which stood at 514 — would not
    // match, so this is what stops a stale or borrowed image passing as the
    // panel this README describes.
    const png = readFileSync(new URL(SCREENSHOT, `file://${repoRoot}`));

    // IHDR: width and height are big-endian uint32 at byte 16 and byte 20.
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(20)).toBe(497);
  });
});

/**
 * The device list, as the README describes it.
 *
 * T-58 left the page describing an app with one window and one pane. T-72 to
 * T-76 gave it a second pane and took the second window away again, so the
 * page has to describe a *tab* — a reader sent looking for a window would not
 * find one, and the difference is the whole of what changed.
 *
 * Every claim below is checked against the code that has to honour it, the way
 * the rest of this suite is: the tray label the menu actually builds, and the
 * refusal the app really states when no password is stored.
 */
describe("README.md on the device list", () => {
  const DEVICES_HEADING = "## The device list";

  it("gives it a section of its own", () => {
    expect(readme).toContain(DEVICES_HEADING);
  });

  it("calls it a tab on the panel rather than a window", () => {
    const devices = section(DEVICES_HEADING);

    expect(devices).toMatch(/\btab\b/i);
    // The window is gone. A page still naming one sends a reader looking for
    // something the app no longer has.
    expect(devices).not.toMatch(/devices window|window listing/i);
  });

  it("says how the tab is reached", () => {
    const devices = section(DEVICES_HEADING);

    expect(devices).toMatch(/Devices/);
    expect(devices).toMatch(/menu bar|tray|right-click/i);
  });

  it("says a block is written to the router's own MAC filter", () => {
    const devices = section(DEVICES_HEADING);

    // The one thing a reader cannot work out from the panel: the block is not
    // an app-level mute, it is a write to the router.
    expect(devices).toMatch(/MAC filter/i);
    expect(devices).toMatch(/router password|password/i);
  });

  it("says a block outlives the app, because it lives on the router", () => {
    const devices = section(DEVICES_HEADING);

    expect(devices).toMatch(/reboot|survives|outlives/i);
    expect(devices).toMatch(/config\.json|not stored in the app|on the router/i);
  });

  it("says this machine cannot be blocked from the list", () => {
    const devices = section(DEVICES_HEADING);

    expect(devices).toMatch(/this Mac|the Mac the app|machine the app/i);
  });

  it("names the tray entry the menu really builds", () => {
    const devices = section(DEVICES_HEADING);

    // Quoted from the constant rather than retyped, so a relabelled menu item
    // cannot leave the page naming one nobody will find.
    expect(devices).toContain(DEVICES_MENU_LABEL);
  });
});
