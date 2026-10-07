// @vitest-environment jsdom

/**
 * The GitHub Pages download page, parsed under jsdom. Only `site/` is
 * deployed, so every relative reference the page makes has to resolve inside
 * it — a screenshot pointed at `../docs/media/` would render locally and 404
 * on Pages.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

/** Built with `node:path`: under jsdom the global `URL` is jsdom's own. */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SITE_DIR = resolve(REPO_ROOT, "site");

const pkg = JSON.parse(
  readFileSync(resolve(REPO_ROOT, "package.json"), "utf8"),
) as { author: string; homepage: string };

const REPO_URL = "https://github.com/ckandrinirina/ck-connect-check";
const LATEST = `${REPO_URL}/releases/latest/download`;
const DMG_URL = `${LATEST}/ck-connect-check-mac.dmg`;
const ZIP_URL = `${LATEST}/ck-connect-check-mac.zip`;
const EXE_URL = `${LATEST}/ck-connect-check-windows-setup.exe`;

let page: Document;

beforeAll(() => {
  const html = readFileSync(resolve(SITE_DIR, "index.html"), "utf8");
  page = new DOMParser().parseFromString(html, "text/html");
});

function text(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function linksTo(href: string): HTMLAnchorElement[] {
  return [...page.querySelectorAll<HTMLAnchorElement>("a[href]")].filter(
    (anchor) => anchor.getAttribute("href") === href,
  );
}

describe("the download links", () => {
  it("has a Download button pointing at the latest release's .dmg", () => {
    const links = linksTo(DMG_URL);
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((link) => /download/i.test(text(link)))).toBe(true);
  });

  it("has a secondary link to the latest release's .zip", () => {
    const links = linksTo(ZIP_URL);
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((link) => /zip/i.test(text(link)))).toBe(true);
  });

  it("has a Windows button pointing at the latest release's Setup.exe", () => {
    const links = linksTo(EXE_URL);
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((link) => /windows/i.test(text(link)))).toBe(true);
  });

  it("puts the Windows button beside the Mac button", () => {
    const mac = linksTo(DMG_URL).find((link) => /download/i.test(text(link)));
    const windows = linksTo(EXE_URL).find((link) => /windows/i.test(text(link)));
    expect(mac?.parentElement).toBeTruthy();
    expect(windows?.parentElement).toBe(mac?.parentElement);
  });

  it("uses the asset names the release workflow publishes", () => {
    const workflow = readFileSync(
      resolve(REPO_ROOT, ".github/workflows/release.yml"),
      "utf8",
    );
    for (const url of [DMG_URL, ZIP_URL, EXE_URL]) {
      const asset = url.slice(url.lastIndexOf("/") + 1);
      expect(workflow).toContain(`release/${asset}`);
    }
  });

  it("never links to a versioned release", () => {
    const hrefs = [...page.querySelectorAll("a[href]")].map(
      (anchor) => anchor.getAttribute("href") ?? "",
    );
    expect(
      hrefs.filter((href) => /releases\/(download|tag)\//.test(href)),
    ).toEqual([]);
  });
});

describe("what the page says about the app", () => {
  it("names the author", () => {
    expect(text(page.body)).toContain(pkg.author);
  });

  it("links to the repository", () => {
    expect(pkg.homepage).toBe(REPO_URL);
    expect(linksTo(REPO_URL).length).toBeGreaterThan(0);
  });

  it("shows the panel screenshot copied from docs/media", () => {
    const images = [...page.querySelectorAll("img[src]")];
    const panel = images.find((image) =>
      /panel/i.test(image.getAttribute("src") ?? ""),
    );
    expect(panel).toBeDefined();
    expect(panel?.getAttribute("alt")?.trim()).toBeTruthy();

    const src = panel?.getAttribute("src") ?? "";
    const local = resolve(SITE_DIR, src);
    expect(local.startsWith(SITE_DIR)).toBe(true);
    expect(existsSync(local)).toBe(true);
    expect(
      readFileSync(local).equals(
        readFileSync(resolve(REPO_ROOT, "docs/media/panel-orange.png")),
      ),
    ).toBe(true);
  });

  it("states the macOS requirement", () => {
    expect(text(page.body)).toMatch(/requires macOS/i);
  });

  it("states the Windows requirement", () => {
    expect(text(page.body)).toMatch(/Windows 10/);
  });

  it("loads its stylesheet from site/style.css", () => {
    const sheet = page.querySelector('link[rel="stylesheet"]');
    expect(sheet?.getAttribute("href")).toBe("style.css");
    expect(existsSync(resolve(SITE_DIR, "style.css"))).toBe(true);
  });

  it("references no relative file outside site/", () => {
    const refs = [
      ...[...page.querySelectorAll("[src]")].map((el) =>
        el.getAttribute("src"),
      ),
      ...[...page.querySelectorAll("[href]")].map((el) =>
        el.getAttribute("href"),
      ),
    ].filter(
      (ref): ref is string => ref !== null && !/^(https?:|mailto:|#)/.test(ref),
    );
    for (const ref of refs) {
      const local = resolve(SITE_DIR, ref);
      expect(local.startsWith(`${SITE_DIR}/`), ref).toBe(true);
      expect(existsSync(local), ref).toBe(true);
    }
  });
});

describe("the unsigned-app instructions", () => {
  function steps(): string {
    const list = [...page.querySelectorAll("ol")].find((ol) =>
      /Open Anyway/.test(text(ol)),
    );
    expect(list, "no ordered list carries the Open Anyway steps").toBeDefined();
    return text(list);
  }

  it("explains the first launch is blocked because the app is unsigned", () => {
    expect(text(page.body)).toMatch(/unsigned|not signed|isn.t signed/i);
  });

  it("gives the right-click → Open route", () => {
    expect(steps()).toMatch(/right-click/i);
    expect(steps()).toMatch(/\bOpen\b/);
  });

  it("gives the System Settings → Privacy & Security → Open Anyway route", () => {
    const list = steps();
    expect(list).toContain("System Settings");
    expect(list).toContain("Privacy & Security");
    expect(list.indexOf("System Settings")).toBeLessThan(
      list.indexOf("Open Anyway"),
    );
  });

  it("says it is only needed once", () => {
    expect(text(page.body)).toMatch(/once|one-time|first launch/i);
  });
});

describe("the SmartScreen instructions", () => {
  function steps(): string {
    const list = [...page.querySelectorAll("ol")].find((ol) =>
      /Run anyway/.test(text(ol)),
    );
    expect(list, "no ordered list carries the Run anyway steps").toBeDefined();
    return text(list);
  }

  it("explains SmartScreen warns because the installer is unsigned", () => {
    expect(text(page.body)).toMatch(/SmartScreen/);
  });

  it("gives More info, then Run anyway", () => {
    const list = steps();
    expect(list).toContain("More info");
    expect(list.indexOf("More info")).toBeLessThan(list.indexOf("Run anyway"));
  });
});
