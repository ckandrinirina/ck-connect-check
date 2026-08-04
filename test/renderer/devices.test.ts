// @vitest-environment jsdom

/**
 * The devices window's renderer, exercised against the real `devices.html`
 * under jsdom.
 *
 * T-65 built the shell; this is the page with a source behind it. Three things
 * are asserted here and nowhere else: that a model becomes exactly one row per
 * device, that a list which changes between polls is *diffed* rather than
 * rebuilt — a row the user is reading must not be replaced under them — and
 * that the two ways of showing nothing, an unreachable router and a genuinely
 * empty list, are different states in the DOM rather than the same blank table.
 *
 * The medium column and the active dot the task was sketched with are absent on
 * purpose: T-62's probe found no band, frequency, medium or `Active` element in
 * `host-list`, and `host-list` reports only the hosts currently associated, so
 * an active dot would be true on every row. `AssociatedSsid` is the one real
 * network field there is, and it is shown as itself.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DeviceRow, DevicesModel } from "../../src/main/devices-window.js";

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
  // The page is rebuilt for every test, so the module has to run against the
  // new one rather than being served from the import cache.
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

function cellsOfRow(index: number): (string | null)[] {
  return [...(bodyRows()[index]?.cells ?? [])].map((cell) => cell.textContent);
}

/** The name shown in each row, top to bottom. */
function shownNames(): (string | null)[] {
  return bodyRows().map((row) => row.cells[0]?.textContent ?? null);
}

async function apply(model: DevicesModel): Promise<void> {
  const { renderDevices } = await import("../../src/renderer/devices.js");

  renderDevices(model);
}

function row(overrides: Partial<DeviceRow> = {}): DeviceRow {
  return {
    name: "MacBookPro",
    ip: "192.168.8.100",
    mac: "A2:00:5E:00:00:01",
    network: "HUAWEI-B310-XXXX",
    connectedFor: "5h 52m",
    ...overrides,
  };
}

const PHONE = row({
  name: "galaxy-s10e",
  ip: "192.168.8.101",
  mac: "00:1A:2B:00:00:02",
  connectedFor: "1h 0m",
});

const TABLET = row({
  name: "iPad",
  ip: "192.168.8.102",
  mac: "00:1A:2B:00:00:03",
  connectedFor: "12m",
});

function listed(...devices: DeviceRow[]): DevicesModel {
  return { state: "listed", devices };
}

/** What the page says it is showing, for the states that show no rows. */
function pageState(): string | undefined {
  return document.documentElement.dataset["devices"];
}

function emptyNotice(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-devices-empty]");
}

function offlineNotice(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-devices-offline]");
}

describe("the devices page", () => {
  it("loads without the renderer reporting anything", () => {
    expect(errors).toEqual([]);
  });

  it("names every column it will fill", () => {
    expect(headerCells()).toEqual([
      "Device",
      "IP address",
      "MAC address",
      "Network",
      "Connected for",
    ]);
  });

  it("declares a body for the rows to land in", () => {
    expect(document.querySelector("table tbody[data-devices]")).not.toBeNull();
  });

  it("waits for the router rather than claiming there are no devices", () => {
    // Nothing has been pushed yet. An empty table saying "no devices" would be
    // a statement about a router that has not been asked.
    expect(bodyRows()).toHaveLength(0);
    expect(pageState()).toBe("offline");
  });

  it("loads its script and nothing from anywhere else", () => {
    // `default-src 'none'` means every reference has to be a relative one to a
    // file the build copies in beside the page.
    expect(DEVICES_HTML).toContain('src="./devices.js"');
    expect(DEVICES_HTML).not.toContain("../../dist/");
    expect(DEVICES_HTML).not.toMatch(/(src|href)="https?:/);
  });

  it("takes a model pushed from the main process", async () => {
    await import("../../src/renderer/devices.js");

    // The one entry point the main process calls, exactly as the panel's is.
    expect(typeof window.applyDevicesModel).toBe("function");

    window.applyDevicesModel(listed(PHONE));

    expect(shownNames()).toEqual(["galaxy-s10e"]);
  });
});

describe("the devices table", () => {
  it("writes one row per device, in the order the columns are declared", async () => {
    await apply(listed(PHONE, row()));

    expect(bodyRows()).toHaveLength(2);
    expect(cellsOfRow(0)).toEqual([
      "galaxy-s10e",
      "192.168.8.101",
      "00:1A:2B:00:00:02",
      "HUAWEI-B310-XXXX",
      "1h 0m",
    ]);
    expect(cellsOfRow(1)).toEqual([
      "MacBookPro",
      "192.168.8.100",
      "A2:00:5E:00:00:01",
      "HUAWEI-B310-XXXX",
      "5h 52m",
    ]);
  });

  it("keeps the model's order rather than sorting again in the page", async () => {
    await apply(listed(row(), PHONE, TABLET));

    expect(shownNames()).toEqual(["MacBookPro", "galaxy-s10e", "iPad"]);
  });

  it("shows the table only while there is a list to show", async () => {
    await apply(listed(PHONE));

    expect(pageState()).toBe("listed");
    expect(emptyNotice()?.hidden).toBe(true);
    expect(offlineNotice()?.hidden).toBe(true);
  });

  it("re-renders an unchanged list without replacing a single row", async () => {
    await apply(listed(PHONE, row()));
    const before = bodyRows();

    await apply(listed(PHONE, row()));

    // Keyed by MAC: the same devices are the same elements, so a row cannot be
    // pulled out from under a click every time a poll lands.
    expect(bodyRows()[0]).toBe(before[0]);
    expect(bodyRows()[1]).toBe(before[1]);
  });

  it("lands a new device in position without moving the rows around it", async () => {
    await apply(listed(PHONE, row()));
    const [phone, laptop] = bodyRows();

    // `iPad` sorts between the two, so it arrives in the middle.
    await apply(listed(PHONE, TABLET, row()));

    expect(shownNames()).toEqual(["galaxy-s10e", "iPad", "MacBookPro"]);
    expect(bodyRows()[0]).toBe(phone);
    expect(bodyRows()[2]).toBe(laptop);
  });

  it("removes exactly the row of a device that has gone", async () => {
    await apply(listed(PHONE, TABLET, row()));
    const [phone, , laptop] = bodyRows();

    await apply(listed(PHONE, row()));

    expect(shownNames()).toEqual(["galaxy-s10e", "MacBookPro"]);
    expect(bodyRows()[0]).toBe(phone);
    expect(bodyRows()[1]).toBe(laptop);
  });

  it("follows a device whose lease or name moved, in the row it already has", async () => {
    await apply(listed(PHONE));
    const [before] = bodyRows();

    await apply(
      listed({ ...PHONE, ip: "192.168.8.150", connectedFor: "2h 0m" }),
    );

    expect(bodyRows()[0]).toBe(before);
    expect(cellsOfRow(0)).toEqual([
      "galaxy-s10e",
      "192.168.8.150",
      "00:1A:2B:00:00:02",
      "HUAWEI-B310-XXXX",
      "2h 0m",
    ]);
  });

  it("writes a device's own name as text, never as markup", async () => {
    await apply(listed(row({ name: "<img src=x onerror=alert(1)>" })));

    // A device names itself: it is the one string on this page the user did
    // not write.
    expect(bodyRows()[0]?.cells[0]?.textContent).toBe(
      "<img src=x onerror=alert(1)>",
    );
    expect(document.querySelector("table img")).toBeNull();
  });
});

describe("the devices page with nothing to list", () => {
  it("states an empty list rather than showing a bare table", async () => {
    await apply(listed());

    expect(bodyRows()).toHaveLength(0);
    expect(pageState()).toBe("empty");
    expect(emptyNotice()?.hidden).toBe(false);
    expect(emptyNotice()?.textContent?.trim()).not.toBe("");
    expect(offlineNotice()?.hidden).toBe(true);
  });

  it("renders an unreachable router as the offline state, distinct from an empty list", async () => {
    await apply({ state: "offline" });

    // Two different answers to "why is there no list?", told apart in the DOM
    // rather than by both being a table with no rows.
    expect(pageState()).toBe("offline");
    expect(offlineNotice()?.hidden).toBe(false);
    expect(offlineNotice()?.textContent?.trim()).not.toBe("");
    expect(emptyNotice()?.hidden).toBe(true);
  });

  it("never turns an unreachable router into a claim that nothing is connected", async () => {
    await apply(listed(PHONE));
    await apply({ state: "offline" });

    expect(pageState()).toBe("offline");
    expect(emptyNotice()?.hidden).toBe(true);
  });

  it("puts the list back when the router answers again", async () => {
    await apply(listed(PHONE));
    const [before] = bodyRows();

    await apply({ state: "offline" });
    await apply(listed(PHONE));

    expect(pageState()).toBe("listed");
    expect(shownNames()).toEqual(["galaxy-s10e"]);
    expect(bodyRows()[0]).toBe(before);
  });

  it("opens no dialog and reports no error whatever the state", async () => {
    await apply({ state: "offline" });
    await apply(listed());

    expect(errors).toEqual([]);
  });
});
