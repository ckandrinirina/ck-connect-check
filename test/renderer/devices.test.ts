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

import type {
  DeviceRefusal,
  DeviceRow,
  DevicesModel,
} from "../../src/main/devices-window.js";

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

/**
 * The text of a row's cells, without the last one.
 *
 * The final column holds the block control rather than a reading, and what it
 * says is asserted where the control itself is — see "the block control" below.
 */
function cellsOfRow(index: number): (string | null)[] {
  return [...(bodyRows()[index]?.cells ?? [])]
    .slice(0, -1)
    .map((cell) => cell.textContent);
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
    blocked: false,
    present: true,
    local: false,
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
  return document.documentElement.dataset["devicesState"];
}

function emptyNotice(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-devices-empty]");
}

function offlineNotice(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-devices-offline]");
}

function noPasswordNotice(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-devices-no-password]");
}

function refusalNotice(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-devices-refusal]");
}

/** The list, plus why the last press changed nothing. */
function refused(
  refusal: DeviceRefusal,
  ...devices: DeviceRow[]
): DevicesModel {
  return { state: "listed", devices, refusal };
}

/** Whatever notice the page is currently showing, or "" when it shows none. */
function shownNotice(): string {
  const notices = [
    emptyNotice(),
    offlineNotice(),
    noPasswordNotice(),
    refusalNotice(),
  ];

  return notices
    .filter((notice) => notice !== null && !notice.hidden)
    .map((notice) => notice.textContent?.trim() ?? "")
    .join(" ")
    .trim();
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
      "Access",
      "Action",
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
      "Allowed",
    ]);
    expect(cellsOfRow(1)).toEqual([
      "MacBookPro",
      "192.168.8.100",
      "A2:00:5E:00:00:01",
      "HUAWEI-B310-XXXX",
      "5h 52m",
      "Allowed",
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
      "Allowed",
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

/** The Access cell of a row — what the page says about the device's access. */
function accessOfRow(index: number): string | null {
  const cells = bodyRows()[index]?.cells;

  return cells === undefined
    ? null
    : (cells[cells.length - 2]?.textContent ?? null);
}

/**
 * What the router is already blocking. The window ships unstyled, so a colour
 * would say nothing at all here — and once it is styled it would still say
 * nothing to a colour-blind reader, which is why every assertion below is about
 * a word or an attribute.
 */
describe("the devices table — the blocked state", () => {
  it("states a blocked device in words rather than by a colour alone", async () => {
    await apply(listed(row({ blocked: true })));

    expect(accessOfRow(0)).toBe("Blocked");
    expect(bodyRows()[0]?.textContent).toContain("Blocked");
  });

  it("states an allowed device as allowed", async () => {
    await apply(listed(row({ blocked: false })));

    expect(accessOfRow(0)).toBe("Allowed");
  });

  it("marks the row itself, so a style has something to hang on", async () => {
    await apply(listed(row({ blocked: true }), PHONE));

    expect(bodyRows()[0]?.dataset["blocked"]).toBe("true");
    expect(bodyRows()[1]?.dataset["blocked"]).toBe("false");
  });

  it("shows a device the filter remembers but the router no longer reports", async () => {
    await apply(
      listed(
        row({
          name: "iPad",
          ip: "",
          mac: "A6:00:5E:00:00:03",
          network: "",
          connectedFor: "",
          blocked: true,
          present: false,
        }),
      ),
    );

    // Blocked and gone. Without the row, unblocking it would need it to connect
    // first, which is the one thing a blocked device cannot do.
    expect(accessOfRow(0)).toBe("Blocked");
    expect(cellsOfRow(0)).toEqual([
      "iPad",
      "",
      "A6:00:5E:00:00:03",
      "",
      "Not connected",
      "Blocked",
    ]);
    expect(bodyRows()[0]?.dataset["present"]).toBe("false");
  });

  it("marks a connected device as present", async () => {
    await apply(listed(row()));

    expect(bodyRows()[0]?.dataset["present"]).toBe("true");
  });

  it("follows a verdict that changed between polls, in the row it already has", async () => {
    await apply(listed(row({ blocked: false })));
    const [before] = bodyRows();

    await apply(listed(row({ blocked: true })));

    // Keyed by MAC still: blocking a device must not pull its row out from
    // under the click that blocked it.
    expect(bodyRows()[0]).toBe(before);
    expect(accessOfRow(0)).toBe("Blocked");
    expect(bodyRows()[0]?.dataset["blocked"]).toBe("true");
  });

  it("writes the access as text, never as markup", async () => {
    await apply(listed(row({ blocked: true })));

    expect(document.querySelector("table img")).toBeNull();
    expect(bodyRows()[0]?.cells).toHaveLength(7);
  });
});

/** The block control of a row, or null when the row has none. */
function controlOfRow(index: number): HTMLButtonElement | null {
  return (
    bodyRows()[index]?.querySelector<HTMLButtonElement>("[data-block]") ?? null
  );
}

/** Every request the page handed the bridge, in order. */
let sent: { mac: string; blocked: boolean }[] = [];

/**
 * Answers the confirmation the way the argument says, and counts the asking.
 * jsdom's own `confirm` is a not-implemented stub, so it is always replaced.
 */
function confirmationAnswers(answer: boolean): { asked: string[] } {
  const asked: string[] = [];

  vi.spyOn(window, "confirm").mockImplementation((message?: string) => {
    asked.push(message ?? "");

    return answer;
  });

  return { asked };
}

/**
 * The block control, and the confirmation in front of it.
 *
 * Blocking a device is an authenticated `POST` that changes what the router
 * refuses, so it is never a side effect of a stray click: the page asks first,
 * and a declined confirmation sends nothing at all. Every assertion about "no
 * request was made" here is a call count, because a test reading a return value
 * would pass an implementation that sent it anyway.
 */
describe("the devices table — the block control", () => {
  beforeEach(() => {
    sent = [];
    window.devicesBridge = {
      setBlocked(request: { mac: string; blocked: boolean }) {
        sent.push(request);
      },
    };
  });

  it("offers to block a device the router is allowing", async () => {
    await apply(listed(row({ blocked: false })));

    expect(controlOfRow(0)?.textContent).toBe("Block");
  });

  it("offers to unblock a device the router is already refusing", async () => {
    await apply(listed(row({ blocked: true })));

    expect(controlOfRow(0)?.textContent).toBe("Unblock");
  });

  it("gives every row its own control", async () => {
    await apply(listed(PHONE, row(), TABLET));

    expect([0, 1, 2].map((index) => controlOfRow(index) !== null)).toEqual([
      true,
      true,
      true,
    ]);
  });

  it("gives a blocked but absent device a control, which is the only way back", async () => {
    await apply(listed(row({ blocked: true, present: false })));

    // A blocked device stops associating, so without this it could only be
    // unblocked by connecting first — the one thing it cannot do.
    expect(controlOfRow(0)?.textContent).toBe("Unblock");
  });

  it("sends nothing at all when the confirmation is declined", async () => {
    confirmationAnswers(false);
    await apply(listed(row({ blocked: false })));

    controlOfRow(0)?.click();

    expect(sent).toEqual([]);
  });

  it("sends the block once the confirmation is accepted", async () => {
    confirmationAnswers(true);
    await apply(listed(row({ blocked: false })));

    controlOfRow(0)?.click();

    expect(sent).toEqual([{ mac: "A2:00:5E:00:00:01", blocked: true }]);
  });

  it("sends the unblock for a device already blocked", async () => {
    confirmationAnswers(true);
    await apply(listed(row({ blocked: true })));

    controlOfRow(0)?.click();

    expect(sent).toEqual([{ mac: "A2:00:5E:00:00:01", blocked: false }]);
  });

  it("names the device in what it asks, so the wrong row cannot be confirmed", async () => {
    const { asked } = confirmationAnswers(false);
    await apply(listed(PHONE));

    controlOfRow(0)?.click();

    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("galaxy-s10e");
    expect(asked[0]).toContain("00:1A:2B:00:00:02");
  });

  it("asks once per press and sends once per confirmation", async () => {
    const { asked } = confirmationAnswers(true);
    await apply(listed(row({ blocked: false })));

    controlOfRow(0)?.click();
    controlOfRow(0)?.click();

    expect(asked).toHaveLength(2);
    expect(sent).toHaveLength(2);
  });

  it("does not re-arm the same control on every poll", async () => {
    const { asked } = confirmationAnswers(true);

    await apply(listed(row({ blocked: false })));
    await apply(listed(row({ blocked: false })));
    await apply(listed(row({ blocked: false })));
    controlOfRow(0)?.click();

    // The row is kept and updated in place, so a listener added per render
    // would fire three times for one press.
    expect(asked).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it("leaves the row saying what the router last said, not what the click assumed", async () => {
    confirmationAnswers(true);
    await apply(listed(row({ blocked: false })));

    controlOfRow(0)?.click();

    // The row follows the re-read the main process makes afterwards. Painting
    // it here would show a block the router may well have refused.
    expect(accessOfRow(0)).toBe("Allowed");
    expect(bodyRows()[0]?.dataset["blocked"]).toBe("false");
    expect(controlOfRow(0)?.textContent).toBe("Block");
  });

  it("follows the re-read when it lands, in the row it already has", async () => {
    confirmationAnswers(true);
    await apply(listed(row({ blocked: false })));
    const [before] = bodyRows();

    controlOfRow(0)?.click();
    await apply(listed(row({ blocked: true })));

    expect(bodyRows()[0]).toBe(before);
    expect(accessOfRow(0)).toBe("Blocked");
    expect(controlOfRow(0)?.textContent).toBe("Unblock");
  });

  it("survives a press with no bridge behind it rather than reporting an error", async () => {
    confirmationAnswers(true);
    delete window.devicesBridge;
    await apply(listed(row()));

    expect(() => controlOfRow(0)?.click()).not.toThrow();
    expect(errors).toEqual([]);
  });
});

/** The Action cell of a row — the control, or whatever stands in its place. */
function actionOfRow(index: number): HTMLTableCellElement | null {
  const cells = bodyRows()[index]?.cells;

  return cells === undefined ? null : (cells[cells.length - 1] ?? null);
}

/**
 * The row that is the Mac this app runs on.
 *
 * Blocking it severs the connection the undo would have to travel over, and
 * nothing inside the app could put it back: recovery would mean the router's own
 * web UI from another device, or a factory reset. No confirmation dialog makes
 * that a reasonable thing to offer, so the control is not offered — absent, not
 * disabled, because a disabled control is one attribute away from being pressed.
 *
 * Every assertion about "nothing was sent" is a count of what reached the
 * bridge, never a returned value.
 */
describe("the devices table — this machine's own row", () => {
  beforeEach(() => {
    sent = [];
    window.devicesBridge = {
      setBlocked(request: { mac: string; blocked: boolean }) {
        sent.push(request);
      },
    };
  });

  it("renders the row of a local interface with no block control at all", async () => {
    await apply(listed(row({ local: true })));

    expect(controlOfRow(0)).toBeNull();
    expect(bodyRows()[0]?.querySelector("button")).toBeNull();
  });

  it("states why the control is gone, in words and not only by its absence", async () => {
    await apply(listed(row({ local: true })));

    const reason = actionOfRow(0)?.textContent ?? "";

    // The window ships unstyled, so an empty cell or a greyed-out control would
    // say nothing at all — the same rule the Access column already follows.
    expect(reason.trim()).not.toBe("");
    expect(reason).toMatch(/this mac/i);
    expect(reason.toLowerCase()).toContain("block");
  });

  it("leaves every other row its control", async () => {
    await apply(listed(PHONE, row({ local: true }), TABLET));

    expect([0, 1, 2].map((index) => controlOfRow(index) !== null)).toEqual([
      true,
      false,
      true,
    ]);
  });

  it("leaves every row its control when this machine is not in the list", async () => {
    // On Ethernet, with only Wi-Fi hosts reported, the guard has nothing to
    // match. That is the correct outcome, and nothing errors.
    await apply(listed(PHONE, row(), TABLET));

    expect([0, 1, 2].map((index) => controlOfRow(index) !== null)).toEqual([
      true,
      true,
      true,
    ]);
    expect(errors).toEqual([]);
  });

  it("sends nothing for this machine, there being nothing to press", async () => {
    confirmationAnswers(true);
    await apply(listed(row({ local: true })));

    bodyRows()[0]?.click();
    actionOfRow(0)?.click();

    expect(sent).toHaveLength(0);
  });

  it("still reads as a full row, with its access stated like any other", async () => {
    await apply(listed(row({ local: true })));

    expect(bodyRows()[0]?.cells).toHaveLength(7);
    expect(accessOfRow(0)).toBe("Allowed");
    expect(cellsOfRow(0)).toEqual([
      "MacBookPro",
      "192.168.8.100",
      "A2:00:5E:00:00:01",
      "HUAWEI-B310-XXXX",
      "5h 52m",
      "Allowed",
    ]);
  });

  it("marks the row itself, so a style has something to hang on", async () => {
    await apply(listed(row({ local: true }), PHONE));

    expect(bodyRows()[0]?.dataset["local"]).toBe("true");
    expect(bodyRows()[1]?.dataset["local"]).toBe("false");
  });

  it("writes the reason as text, never as markup", async () => {
    await apply(listed(row({ local: true })));

    expect(document.querySelector("table img")).toBeNull();
    expect(actionOfRow(0)?.querySelector("*")).toBeNull();
  });

  it("says it once however many polls land on the same row", async () => {
    await apply(listed(row({ local: true })));
    const before = actionOfRow(0)?.textContent;

    await apply(listed(row({ local: true })));
    await apply(listed(row({ local: true })));

    expect(actionOfRow(0)?.childNodes).toHaveLength(1);
    expect(actionOfRow(0)?.textContent).toBe(before);
  });

  it("leaves no handler behind when a control is replaced by the reason", async () => {
    confirmationAnswers(true);
    await apply(listed(row({ local: false })));
    const stale = controlOfRow(0);

    await apply(listed(row({ local: true })));
    stale?.click();

    expect(controlOfRow(0)).toBeNull();
    expect(sent).toHaveLength(0);
  });

  it("puts a control back, armed exactly once, if the row stops being this machine", async () => {
    const { asked } = confirmationAnswers(true);

    await apply(listed(row({ local: true })));
    await apply(listed(row({ local: false })));
    await apply(listed(row({ local: false })));
    controlOfRow(0)?.click();

    // The row is kept between polls, so a listener added per render would fire
    // twice for one press.
    expect(controlOfRow(0)?.textContent).toBe("Block");
    expect(asked).toHaveLength(1);
    expect(sent).toHaveLength(1);
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

/**
 * The cap the firmware actually enforces. Ten entries per SSID, established
 * against the live router in T-62 — the architecture's original 32 was wrong,
 * and a message quoting the wrong number is worse than none.
 */
const CAP = 10;

/**
 * A router error code nobody here has a name for, at the endpoint a filter
 * write goes to.
 *
 * Deliberately not one of the codes this codebase does name — 100002, 100003,
 * 108006, 108007, 111019, 125002, 125003 — so what is asserted below is the
 * general "carry it whole" path and not a second branch spelled out by hand.
 */
const UNNAMED_REFUSAL: DeviceRefusal = {
  kind: "error",
  source: "api",
  code: 100004,
  endpoint: "/api/wlan/multi-macfilter-settings",
};

/**
 * The five conditions that are not a populated list, each named and each with
 * the model that produces it.
 *
 * They are held in one table because the claim being made is about all five
 * together: that each reads as itself, and that none of them is a bare table
 * with nothing said. The individual assertions follow one per condition.
 */
const CONDITIONS: { name: string; model: DevicesModel }[] = [
  { name: "the router is unreachable", model: { state: "offline" } },
  { name: "the router says nothing is connected", model: listed() },
  { name: "no router password is stored", model: { state: "no-password" } },
  {
    name: "the router refused the write",
    model: refused(UNNAMED_REFUSAL, PHONE),
  },
  {
    name: "the filter is full",
    model: refused({ kind: "full", cap: CAP }, PHONE),
  },
];

/**
 * Why there is no list, or why a change did not take.
 *
 * Five conditions that would otherwise look alike — and looking alike is the
 * whole failure, because a window that answers "nothing here" to five different
 * questions has answered none of them. Every assertion is about words: the page
 * ships unstyled, so a colour or an icon would say nothing at all, and once it
 * is styled it would still say nothing in greyscale.
 *
 * None of them is a dialog. The app runs unattended, and a modal nobody
 * dismisses blocks it for as long as it is left alone.
 */
describe("the devices page — why there is no list, or why a press changed nothing", () => {
  it("states a missing password as a missing password, not as a router failure", async () => {
    await apply({ state: "no-password" });

    const said = noPasswordNotice();

    // Its own state in the DOM, so it cannot be mistaken for the router being
    // unreachable — which is exactly what it used to degrade into.
    expect(pageState()).toBe("no-password");
    expect(said?.hidden).toBe(false);
    expect(said?.textContent?.trim()).not.toBe("");
    expect(said?.textContent?.toLowerCase()).toContain("password");
    expect(offlineNotice()?.hidden).toBe(true);
    expect(emptyNotice()?.hidden).toBe(true);
  });

  it("says where the password is set rather than leaving it to be found", async () => {
    await apply({ state: "no-password" });

    // Nothing in this window can take a password, so the sentence has to point
    // at the one place that can, or it states a problem with no way out of it.
    expect(noPasswordNotice()?.textContent).toMatch(/menu bar/i);
  });

  it("states a refusal the router answered with a number, code and endpoint and all", async () => {
    await apply(refused(UNNAMED_REFUSAL, PHONE));

    const said = refusalNotice();

    // 100004 has no name here on purpose. The number and the endpoint are the
    // only evidence of *why* the router refused, so they are carried whole
    // rather than flattened into "it failed".
    expect(said?.hidden).toBe(false);
    expect(said?.textContent).toContain("100004");
    expect(said?.textContent).toContain("/api/wlan/multi-macfilter-settings");
  });

  it("states a full filter with the cap in it, rather than as a write that failed", async () => {
    await apply(refused({ kind: "full", cap: CAP }, PHONE));

    const said = refusalNotice();

    // A household that has filled the firmware's list has done nothing wrong,
    // so the cap is stated and the number is the actionable part of it.
    expect(said?.hidden).toBe(false);
    expect(said?.textContent).toContain("10");
    expect(said?.textContent?.toLowerCase()).toContain("full");
  });

  it("gives each of the five conditions a message of its own", async () => {
    const said: string[] = [];

    for (const condition of CONDITIONS) {
      await apply(condition.model);
      said.push(shownNotice());
    }

    expect(said).toHaveLength(5);
    expect(said.filter((text) => text === "")).toEqual([]);
    // Five conditions, five different sentences: no two of them collapse into
    // the same "there is nothing to show".
    expect(new Set(said).size).toBe(5);
  });

  it("never shows a table with no rows and nothing said about why", async () => {
    for (const condition of CONDITIONS) {
      await apply(condition.model);

      const explained = shownNotice() !== "";

      expect({ [condition.name]: explained }).toEqual({
        [condition.name]: true,
      });
    }
  });

  it("raises no dialog for any of them, the app being unattended", async () => {
    const confirmed = vi.spyOn(window, "confirm").mockReturnValue(false);
    const alerted = vi
      .spyOn(window, "alert")
      .mockImplementation(() => undefined);

    for (const condition of CONDITIONS) {
      await apply(condition.model);
    }

    expect(confirmed).not.toHaveBeenCalled();
    expect(alerted).not.toHaveBeenCalled();
    expect(errors).toEqual([]);
  });

  it("keeps every device row when a write is refused", async () => {
    await apply(listed(PHONE, row(), TABLET));
    const before = bodyRows().length;

    await apply(refused(UNNAMED_REFUSAL, PHONE, row(), TABLET));

    // The devices are still there. A list that vanished because a toggle failed
    // would throw away the very thing the window exists to show.
    expect(before).toBe(3);
    expect(bodyRows()).toHaveLength(before);
    expect(shownNames()).toEqual(["galaxy-s10e", "MacBookPro", "iPad"]);
    expect(pageState()).toBe("listed");
  });

  it("keeps the rows themselves, not merely their number", async () => {
    await apply(listed(PHONE, row()));
    const [phone, laptop] = bodyRows();

    await apply(refused({ kind: "full", cap: CAP }, PHONE, row()));

    expect(bodyRows()[0]).toBe(phone);
    expect(bodyRows()[1]).toBe(laptop);
    expect(controlOfRow(0)?.textContent).toBe("Block");
  });

  it("takes the complaint back down once a press is not refused", async () => {
    await apply(refused(UNNAMED_REFUSAL, PHONE));
    await apply(listed(PHONE));

    expect(refusalNotice()?.hidden).toBe(true);
    expect(pageState()).toBe("listed");
  });

  it("states a whitelist filter as itself rather than as an unexplained refusal", async () => {
    await apply(refused({ kind: "whitelist" }, PHONE));

    // The router is set to allow only a named list, which this app never
    // writes. Saying so is the only thing that makes the row's inaction sensible.
    expect(refusalNotice()?.hidden).toBe(false);
    expect(refusalNotice()?.textContent?.toLowerCase()).toContain("whitelist");
  });

  it("states an unreadable filter as its own reason", async () => {
    await apply(refused({ kind: "unreadable" }, PHONE));

    expect(refusalNotice()?.hidden).toBe(false);
    expect(refusalNotice()?.textContent?.trim()).not.toBe("");
  });

  it("gives every word-shaped router failure a sentence of its own", async () => {
    const said: string[] = [];

    for (const reason of [
      "unreachable",
      "timeout",
      "session",
      "error",
      "not-logged-in",
    ] as const) {
      await apply(refused(reason, PHONE));
      said.push(refusalNotice()?.textContent?.trim() ?? "");
    }

    expect(said.filter((text) => text === "")).toEqual([]);
    expect(new Set(said).size).toBe(said.length);
  });

  it("writes the refusal as text, never as markup", async () => {
    await apply(
      refused(
        { ...UNNAMED_REFUSAL, endpoint: "<img src=x onerror=alert(1)>" },
        PHONE,
      ),
    );

    expect(refusalNotice()?.querySelector("*")).toBeNull();
    expect(document.querySelector("img")).toBeNull();
  });

  it("still says nothing is connected when a refusal lands on an empty list", async () => {
    await apply(refused({ kind: "full", cap: CAP }));

    expect(pageState()).toBe("empty");
    expect(emptyNotice()?.hidden).toBe(false);
    expect(refusalNotice()?.hidden).toBe(false);
  });
});
