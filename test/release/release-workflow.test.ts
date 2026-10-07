import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The release workflow only runs on GitHub, on a pushed tag, so its shape is
 * asserted here: what triggers it, what it runs in which order, and the fixed
 * asset names the Pages site links to through `releases/latest/download/`.
 */
interface Step {
  name?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface Job {
  "runs-on"?: string;
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

function onlyJob(workflow: Workflow): Job {
  const jobs = Object.values(workflow.jobs ?? {});
  expect(jobs).toHaveLength(1);
  return jobs[0] as Job;
}

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

const ASSETS = ["ck-connect-check-mac.dmg", "ck-connect-check-mac.zip"];

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

  it("runs on a macOS runner with Node 22", () => {
    const job = onlyJob(loadWorkflow());
    expect(job["runs-on"]).toMatch(/^macos-/);
    const setupNode = (job.steps ?? []).find((step) =>
      step.uses?.startsWith("actions/setup-node@"),
    );
    expect(String(setupNode?.with?.["node-version"])).toBe("22");
  });

  it("has contents: write permission", () => {
    const workflow = loadWorkflow();
    const permissions = {
      ...workflow.permissions,
      ...onlyJob(workflow).permissions,
    };
    expect(permissions.contents).toBe("write");
  });
});

describe("the release job's steps", () => {
  it("checks the tag against package.json before running anything else", () => {
    const runs = runSteps(onlyJob(loadWorkflow()));
    expect(runs[0]).toMatch(/node scripts\/check-release-tag\.mjs/);
    expect(runs[0]).toMatch(/GITHUB_REF_NAME|github\.ref_name/);
  });

  it("then runs npm ci, npm test, npm run lint and npm run make, in that order", () => {
    const runs = runSteps(onlyJob(loadWorkflow()));
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
});

describe("the published assets", () => {
  it.each(ASSETS)("renames a built file to %s after npm run make", (asset) => {
    const runs = runSteps(onlyJob(loadWorkflow()));
    const make = indexOfRun(runs, /^npm run make$/m);
    const rename = runs.findIndex(
      (run, index) =>
        index > make && !/gh release create/.test(run) && run.includes(asset),
    );
    expect(rename).toBeGreaterThan(make);
  });

  it("creates a Release named after the tag with generated notes and both assets", () => {
    const job = onlyJob(loadWorkflow());
    const runs = runSteps(job);
    const release = runs.find((run) => /gh release create/.test(run));
    expect(release).toBeDefined();
    expect(release).toMatch(
      /gh release create "?\$(GITHUB_REF_NAME|\{\{ ?github\.ref_name ?\}\})"?/,
    );
    expect(release).toMatch(
      /--title "?\$(GITHUB_REF_NAME|\{\{ ?github\.ref_name ?\}\})"?/,
    );
    expect(release).toContain("--generate-notes");
    for (const asset of ASSETS) {
      expect(release).toContain(asset);
    }
    expect(runs.indexOf(release as string)).toBe(runs.length - 1);
  });

  it("gives gh the workflow token", () => {
    const step = (onlyJob(loadWorkflow()).steps ?? []).find((candidate) =>
      candidate.run?.includes("gh release create"),
    );
    expect(String(step?.env?.["GH_TOKEN"])).toMatch(
      /github\.token|secrets\.GITHUB_TOKEN/,
    );
  });
});
