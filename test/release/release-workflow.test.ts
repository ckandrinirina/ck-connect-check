import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The release workflow only runs on GitHub, on a pushed tag, so its shape is
 * asserted here: what triggers it, what each job runs in which order, how the
 * jobs share one Release, and the fixed asset names the Pages site links to
 * through `releases/latest/download/`.
 */
interface Step {
  name?: string;
  uses?: string;
  run?: string;
  shell?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface Job {
  "runs-on"?: string;
  needs?: string | string[];
  permissions?: Record<string, string>;
  steps?: Step[];
}

interface Workflow {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, Job>;
}

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/release.yml", import.meta.url),
);

function loadWorkflow(): Workflow {
  return parse(readFileSync(workflowPath, "utf8")) as Workflow;
}

function jobsOf(workflow: Workflow): [string, Job][] {
  return Object.entries(workflow.jobs ?? {});
}

/** The one job running on a runner whose label matches `runner`. */
function jobOn(runner: RegExp): Job {
  const matches = jobsOf(loadWorkflow()).filter(([, job]) =>
    runner.test(job["runs-on"] ?? ""),
  );
  expect(matches, `jobs on ${String(runner)}`).toHaveLength(1);
  return (matches[0] as [string, Job])[1];
}

const macJob = (): Job => jobOn(/^macos-/);
const windowsJob = (): Job => jobOn(/^windows-latest$/);

function runSteps(job: Job): string[] {
  return (job.steps ?? []).flatMap((step) =>
    step.run === undefined ? [] : [step.run],
  );
}

function indexOfRun(runs: string[], pattern: RegExp): number {
  const index = runs.findIndex((run) => pattern.test(run));
  expect(
    index,
    `no run step matches ${String(pattern)}`,
  ).toBeGreaterThanOrEqual(0);
  return index;
}

function needsOf(job: Job): string[] {
  if (job.needs === undefined) return [];
  return Array.isArray(job.needs) ? job.needs : [job.needs];
}

const TAG = /"?\$(GITHUB_REF_NAME|\{\{ ?github\.ref_name ?\}\})"?/;
const MAC_ASSETS = ["ck-connect-check-mac.dmg", "ck-connect-check-mac.zip"];
const WINDOWS_ASSET = "ck-connect-check-windows-setup.exe";

describe("the release workflow", () => {
  it("exists at .github/workflows/release.yml", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it("triggers only on pushed tags matching v*", () => {
    const workflow = loadWorkflow();
    expect(Object.keys(workflow.on ?? {})).toEqual(["push"]);
    const push = workflow.on?.push as Record<string, unknown>;
    expect(push).toEqual({ tags: ["v*"] });
  });

  it("has contents: write permission for every job", () => {
    const workflow = loadWorkflow();
    for (const [, job] of jobsOf(workflow)) {
      const permissions = { ...workflow.permissions, ...job.permissions };
      expect(permissions.contents).toBe("write");
    }
  });

  it.each([
    ["macOS", macJob],
    ["Windows", windowsJob],
  ])("runs the %s job with Node 22", (_platform, job) => {
    const setupNode = (job().steps ?? []).find((step) =>
      step.uses?.startsWith("actions/setup-node@"),
    );
    expect(String(setupNode?.with?.["node-version"])).toBe("22");
  });
});

describe("the macOS job's steps", () => {
  it("checks the tag against package.json before running anything else", () => {
    const runs = runSteps(macJob());
    expect(runs[0]).toMatch(/node scripts\/check-release-tag\.mjs/);
    expect(runs[0]).toMatch(/GITHUB_REF_NAME|github\.ref_name/);
  });

  it("then runs npm ci, npm test, npm run lint and npm run make, in that order", () => {
    const runs = runSteps(macJob());
    const order = [
      /check-release-tag\.mjs/,
      /^npm ci$/m,
      /^npm test$/m,
      /^npm run lint$/m,
      /^npm run make$/m,
    ].map((pattern) => indexOfRun(runs, pattern));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });

  it.each(MAC_ASSETS)("renames a built file to %s after npm run make", (asset) => {
    const runs = runSteps(macJob());
    const make = indexOfRun(runs, /^npm run make$/m);
    const rename = runs.findIndex(
      (run, index) =>
        index > make && !/gh release/.test(run) && run.includes(`release/${asset}`),
    );
    expect(rename).toBeGreaterThan(make);
  });
});

describe("the Windows job's steps", () => {
  it("runs on windows-latest", () => {
    expect(windowsJob()["runs-on"]).toBe("windows-latest");
  });

  it("checks the tag, then runs npm ci, npm test, npm run lint and npm run make:win, in that order", () => {
    const runs = runSteps(windowsJob());
    const order = [
      /check-release-tag\.mjs/,
      /^npm ci$/m,
      /^npm test$/m,
      /^npm run lint$/m,
      /^npm run make:win$/m,
    ].map((pattern) => indexOfRun(runs, pattern));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });

  it(`renames the Squirrel Setup.exe to ${WINDOWS_ASSET} after npm run make:win`, () => {
    const runs = runSteps(windowsJob());
    const make = indexOfRun(runs, /^npm run make:win$/m);
    const rename = runs.findIndex(
      (run, index) =>
        index > make &&
        !/gh release/.test(run) &&
        /squirrel\.windows/.test(run) &&
        run.includes(`release/${WINDOWS_ASSET}`),
    );
    expect(rename).toBeGreaterThan(make);
  });
});

/**
 * One Release, created once by a job both build jobs wait on, so neither build
 * races the other to create it; each build then uploads its own assets into it,
 * whichever finishes first.
 */
describe("the shared Release", () => {
  function creators(): [string, Job][] {
    return jobsOf(loadWorkflow()).filter(([, job]) =>
      runSteps(job).some((run) => /gh release create/.test(run)),
    );
  }

  it("is created by exactly one job, which builds nothing", () => {
    const found = creators();
    expect(found).toHaveLength(1);
    const runs = runSteps((found[0] as [string, Job])[1]);
    expect(runs.some((run) => /npm run make/.test(run))).toBe(false);
  });

  it("is named after the tag, with generated notes, and created without assets", () => {
    const [, job] = creators()[0] as [string, Job];
    const create = runSteps(job).find((run) => /gh release create/.test(run));
    expect(create).toMatch(new RegExp(`gh release create ${TAG.source}`));
    expect(create).toMatch(new RegExp(`--title ${TAG.source}`));
    expect(create).toContain("--generate-notes");
    expect(create).not.toMatch(/release\//);
  });

  it("is only created once the tag matches package.json", () => {
    const [, job] = creators()[0] as [string, Job];
    const runs = runSteps(job);
    const check = indexOfRun(runs, /node scripts\/check-release-tag\.mjs/);
    const create = indexOfRun(runs, /gh release create/);
    expect(check).toBeLessThan(create);
  });

  it.each([
    ["macOS", macJob],
    ["Windows", windowsJob],
  ])("is a job the %s job needs", (_platform, job) => {
    const [name] = creators()[0] as [string, Job];
    expect(needsOf(job())).toContain(name);
  });

  it.each([
    ["macOS", macJob, MAC_ASSETS],
    ["Windows", windowsJob, [WINDOWS_ASSET]],
  ])(
    "receives the %s assets as the job's last step, overwriting on a re-run",
    (_platform, job, assets) => {
      const runs = runSteps(job());
      const upload = runs[runs.length - 1] ?? "";
      expect(upload).toMatch(new RegExp(`gh release upload ${TAG.source}`));
      expect(upload).toContain("--clobber");
      for (const asset of assets) {
        expect(upload).toContain(`release/${asset}`);
      }
      expect(runs.some((run) => /gh release create/.test(run))).toBe(false);
    },
  );

  it("gives every gh step the workflow token", () => {
    const ghSteps = jobsOf(loadWorkflow()).flatMap(([, job]) =>
      (job.steps ?? []).filter((step) => /gh release/.test(step.run ?? "")),
    );
    expect(ghSteps.length).toBe(3);
    for (const step of ghSteps) {
      expect(String(step.env?.["GH_TOKEN"])).toMatch(
        /github\.token|secrets\.GITHUB_TOKEN/,
      );
    }
  });
});
