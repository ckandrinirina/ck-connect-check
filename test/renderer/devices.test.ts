// @vitest-environment jsdom

/**
 * The devices window's renderer, exercised against the real `devices.html`
 * under jsdom.
 *
 * This is the shell only: the page ships an empty table, and the rows arrive in
 * T-66. What can be asserted now is that the page loads without complaining,
 * that the columns it declares are the ones the window promises, and that it
 * shows no row it was never given.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `import.meta.url` is turned into a path before anything is resolved against
 * it: under jsdom the global `URL` is jsdom's own, which `fileURLToPath` will
 * not accept, so the whole path is built with `node:path` instead.
 */
const RENDERER_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/renderer",
);

const DEVICES_HTML = readFileSync(
  resolve(RENDERER_DIR, "devices.html"),
  "utf8",
);

/** The page's own markup, so the tests run against what actually ships. */
function loadPage(): void {
  const inner = /<html[^>]*>([\s\S]*)<\/html>/.exec(DEVICES_HTML)?.[1];

  if (inner === undefined) {
    throw new Error("devices.html has no <html> element");
  }

  document.documentElement.innerHTML = inner;
}

let errors: unknown[][] = [];

beforeEach(async () => {
  errors = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
  loadPage();
  // Reset first: the page is rebuilt for every test, so the module has to run
  // against it again rather than being served from the import cache.
  vi.resetModules();
  await import("../../src/renderer/devices.js");
});

afterEach(() => {
  vi.restoreAllMocks();
});

function headerCells(): string[] {
  return [...document.querySelectorAll("table thead th")].map(
    (cell) => cell.textContent?.trim() ?? "",
  );
}

function bodyRows(): HTMLTableRowElement[] {
  return [...document.querySelectorAll<HTMLTableRowElement>("table tbody tr")];
}

describe("the devices page", () => {
  it("loads without the renderer reporting anything", () => {
    expect(errors).toEqual([]);
  });

  it("names every column it will fill", () => {
    expect(headerCells()).toEqual(["Device", "IP address", "MAC address"]);
  });

  it("shows no row until it is given one", () => {
    expect(bodyRows()).toHaveLength(0);
  });

  it("declares a body for the rows to land in", () => {
    expect(document.querySelector("table tbody[data-devices]")).not.toBeNull();
  });

  it("loads its script and nothing from anywhere else", () => {
    // `default-src 'none'` means every reference has to be a relative one to a
    // file the build copies in beside the page.
    expect(DEVICES_HTML).toContain('src="./devices.js"');
    expect(DEVICES_HTML).not.toContain("../../dist/");
    expect(DEVICES_HTML).not.toMatch(/(src|href)="https?:/);
  });
});
