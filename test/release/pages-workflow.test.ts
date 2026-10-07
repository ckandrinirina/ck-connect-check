import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * The Pages workflow only runs on GitHub, so its shape is asserted here: it
 * fires on pushes to `main` that touch `site/`, and publishes `site/` as is.
 */
interface Step {
  uses?: string;
  with?: Record<string, unknown>;
}

interface Job {
  permissions?: Record<string, string>;
  environment?: { name?: string } | string;
  steps?: Step[];
}

interface Workflow {
  on?: Record<string, unknown>;
  permissions?: Record<string, string>;
  jobs?: Record<string, Job>;
}

const workflowPath = fileURLToPath(
  new URL("../../.github/workflows/pages.yml", import.meta.url),
);

function load(): Workflow {
  return parse(readFileSync(workflowPath, "utf8")) as Workflow;
}

function allSteps(workflow: Workflow): Step[] {
  return Object.values(workflow.jobs ?? {}).flatMap((job) => job.steps ?? []);
}

function stepUsing(workflow: Workflow, action: string): Step | undefined {
  return allSteps(workflow).find((step) => step.uses?.startsWith(`${action}@`));
}

describe("the Pages workflow", () => {
  it("exists at .github/workflows/pages.yml", () => {
    expect(existsSync(workflowPath)).toBe(true);
  });

  it("runs on pushes to main that touch site/", () => {
    const push = load().on?.push as Record<string, unknown> | undefined;
    expect(push?.branches).toEqual(["main"]);
    expect(push?.paths).toEqual(["site/**"]);
  });

  it("never runs on tags or pull requests", () => {
    const on = load().on ?? {};
    expect(on).not.toHaveProperty("pull_request");
    expect(on.push).not.toHaveProperty("tags");
  });

  it("has the pages and id-token permissions deploy-pages needs", () => {
    const workflow = load();
    const permissions = {
      ...workflow.permissions,
      ...Object.values(workflow.jobs ?? {}).reduce(
        (all, job) => ({ ...all, ...job.permissions }),
        {} as Record<string, string>,
      ),
    };
    expect(permissions.pages).toBe("write");
    expect(permissions["id-token"]).toBe("write");
  });

  it("uploads site/ as the Pages artifact", () => {
    const upload = stepUsing(load(), "actions/upload-pages-artifact");
    expect(upload).toBeDefined();
    expect(String(upload?.with?.path).replace(/\/$/, "")).toMatch(
      /^(\.\/)?site$/,
    );
  });

  it("deploys it with deploy-pages after the upload", () => {
    const workflow = load();
    const uses = allSteps(workflow).map((step) => step.uses ?? "");
    const upload = uses.findIndex((u) =>
      u.startsWith("actions/upload-pages-artifact@"),
    );
    const deploy = uses.findIndex((u) => u.startsWith("actions/deploy-pages@"));
    expect(upload).toBeGreaterThanOrEqual(0);
    expect(deploy).toBeGreaterThan(upload);
  });
});
