/**
 * The MAC-filter boundary. T-62 captured
 * `GET /api/wlan/multi-macfilter-settings` from the router; this turns that
 * reply into the shape the window can reason about — a mode and the addresses
 * the filter remembers.
 *
 * The reply is per-SSID, so the awkward parts are all about collapsing four
 * blocks into one answer: four statuses that must agree before the filter reads
 * as off, ten slots per SSID of which most are empty, and the router's own
 * casing split (`WifiMacFilterMacN` capitalised, `wifihostnameN` not) that a
 * naive reader would only half-see.
 *
 * The captured filter is off with every slot empty, which is the state a fresh
 * install meets, so every populated case below is a reply built to the captured
 * shape rather than a second capture.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  MAC_FILTER_ENDPOINT,
  MAC_FILTER_OFF,
  parseMacFilter,
  type MacFilter,
} from "../../src/hilink/macfilter.js";
import { HilinkApiError, HilinkParseError } from "../../src/hilink/parse.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/hilink/${name}.xml`, import.meta.url)),
    "utf8",
  );
}

const captured = fixture("macfilter");
const hostInfo = fixture("host-info");
const malformed = fixture("malformed");

/** The router's own numbers for the three states of the filter. */
const OFF = 0;
const WHITELIST = 1;
const BLACKLIST = 2;

/** One `<Ssid>` block with the ten slots the firmware always sends. */
function ssidBlock(
  index: number,
  status: number,
  entries: readonly (readonly [string, string])[] = [],
): string {
  const slots = Array.from({ length: 10 }, (_unused, slot) => {
    const [mac, name] = entries[slot] ?? ["", ""];
    return [
      `<WifiMacFilterMac${slot}>${mac}</WifiMacFilterMac${slot}>`,
      `<wifihostname${slot}>${name}</wifihostname${slot}>`,
    ].join("\n");
  }).join("\n");

  return [
    "<Ssid>",
    `<Index>${index}</Index>`,
    `<WifiMacFilterStatus>${status}</WifiMacFilterStatus>`,
    slots,
    "</Ssid>",
  ].join("\n");
}

/** A whole reply wrapping the given `<Ssid>` blocks. */
function reply(...blocks: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<Ssids>\n${blocks.join(
    "\n",
  )}\n</Ssids>\n</response>`;
}

/** The same status and entries on all four SSIDs, as the app itself writes. */
function everySsid(
  status: number,
  entries: readonly (readonly [string, string])[] = [],
): MacFilter {
  return parseMacFilter(
    reply(...[0, 1, 2, 3].map((index) => ssidBlock(index, status, entries))),
  );
}

function macsOf(filter: MacFilter): string[] {
  return filter.entries.map((entry) => entry.mac);
}

describe("parseMacFilter — the captured reply", () => {
  const filter = parseMacFilter(captured);

  it("names the endpoint it reads", () => {
    expect(MAC_FILTER_ENDPOINT).toBe("/api/wlan/multi-macfilter-settings");
  });

  it("reads the filter at rest as off", () => {
    expect(filter.mode).toBe("off");
  });

  it("reads an empty filter as no addresses at all", () => {
    expect(filter.entries).toEqual([]);
  });

  it("keeps all four SSID blocks, which a write has to carry back", () => {
    expect(filter.ssids.map((ssid) => ssid.index)).toEqual([0, 1, 2, 3]);
    expect(filter.ssids.every((ssid) => ssid.mode === "off")).toBe(true);
  });
});

describe("parseMacFilter — the mode is the router's number, converted here", () => {
  it("reads status 2 as a blacklist", () => {
    expect(everySsid(BLACKLIST).mode).toBe("blacklist");
  });

  it("reads status 1 as a whitelist", () => {
    expect(everySsid(WHITELIST).mode).toBe("whitelist");
  });

  it("reads status 0 as off", () => {
    expect(everySsid(OFF).mode).toBe("off");
  });

  it("reads the filter as off only when every SSID says so", () => {
    const mixed = parseMacFilter(
      reply(
        ssidBlock(0, OFF),
        ssidBlock(1, BLACKLIST, [["A2:00:5E:00:00:01", "MacBookPro"]]),
        ssidBlock(2, OFF),
        ssidBlock(3, OFF),
      ),
    );

    expect(mixed.mode).toBe("blacklist");
  });

  it("keeps each SSID's own mode beside the collapsed one", () => {
    const mixed = parseMacFilter(
      reply(
        ssidBlock(0, OFF),
        ssidBlock(1, BLACKLIST),
        ssidBlock(2, OFF),
        ssidBlock(3, OFF),
      ),
    );

    expect(mixed.ssids.map((ssid) => ssid.mode)).toEqual([
      "off",
      "blacklist",
      "off",
      "off",
    ]);
  });

  it("never invents a mode for a status the firmware has not been seen to send", () => {
    expect(() => parseMacFilter(reply(ssidBlock(0, 7)))).toThrow(
      HilinkParseError,
    );
  });

  it("rejects a block whose status is missing", () => {
    const noStatus = reply(
      "<Ssid>\n<Index>0</Index>\n<WifiMacFilterMac0></WifiMacFilterMac0>\n</Ssid>",
    );

    expect(() => parseMacFilter(noStatus)).toThrow(HilinkParseError);
  });
});

describe("parseMacFilter — the addresses it remembers", () => {
  const filter = everySsid(BLACKLIST, [
    ["A2:00:5E:00:00:01", "MacBookPro"],
    ["00:1a:2b:00:00:02", ""],
  ]);

  it("reads a populated slot as an entry", () => {
    expect(macsOf(filter)).toEqual(["A2:00:5E:00:00:01", "00:1A:2B:00:00:02"]);
  });

  it("upper-cases every address, as the host list does", () => {
    expect(macsOf(filter).every((mac) => mac === mac.toUpperCase())).toBe(true);
  });

  it("skips the empty slots rather than listing blank addresses", () => {
    // Ten slots per SSID, two of them filled: eight blanks per block must not
    // become eight remembered devices.
    expect(filter.entries).toHaveLength(2);
    expect(macsOf(filter)).not.toContain("");
  });

  it("reads the name slot beside each address, casing split and all", () => {
    expect(filter.entries[0]).toEqual({
      mac: "A2:00:5E:00:00:01",
      name: "MacBookPro",
    });
  });

  it("leaves a nameless entry nameless rather than inventing a name", () => {
    expect(filter.entries[1]?.name).toBe("");
  });

  it("lists an address once however many SSIDs carry it", () => {
    // The app writes all four blocks alike, so the same MAC appears four times
    // in a reply describing a single blocked device.
    expect(
      macsOf(everySsid(BLACKLIST, [["A2:00:5E:00:00:01", "one"]])),
    ).toEqual(["A2:00:5E:00:00:01"]);
  });

  it("unions the addresses when the SSIDs do not hold the same list", () => {
    const uneven = parseMacFilter(
      reply(
        ssidBlock(0, BLACKLIST, [["A2:00:5E:00:00:01", "MacBookPro"]]),
        ssidBlock(1, BLACKLIST, [["00:1A:2B:00:00:02", "galaxy-s10e"]]),
        ssidBlock(2, OFF),
        ssidBlock(3, OFF),
      ),
    );

    expect(macsOf(uneven)).toEqual(["A2:00:5E:00:00:01", "00:1A:2B:00:00:02"]);
  });

  it("keeps a list that is off, because the router still remembers it", () => {
    const remembered = everySsid(OFF, [["A2:00:5E:00:00:01", "MacBookPro"]]);

    expect(remembered.mode).toBe("off");
    expect(macsOf(remembered)).toEqual(["A2:00:5E:00:00:01"]);
  });

  it("parses a full SSID as ten entries, which is a state and not an error", () => {
    const full = Array.from(
      { length: 10 },
      (_unused, slot) => [`A2:00:5E:00:00:1${slot}`, `host${slot}`] as const,
    );

    expect(everySsid(BLACKLIST, full).entries).toHaveLength(10);
  });
});

describe("parseMacFilter — failures carry the endpoint", () => {
  it("raises an API error carrying the router's code when the reply is an error", () => {
    const denied = hostInfo.replace(
      "<code>100002</code>",
      "<code>100003</code>",
    );
    let caught: unknown;

    try {
      parseMacFilter(denied);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HilinkApiError);
    expect((caught as HilinkApiError).code).toBe(100003);
    expect((caught as HilinkApiError).endpoint).toBe(MAC_FILTER_ENDPOINT);
  });

  it("raises a parse error, not an API error, for malformed XML", () => {
    let caught: unknown;

    try {
      parseMacFilter(malformed);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(HilinkParseError);
    expect(caught).not.toBeInstanceOf(HilinkApiError);
    expect((caught as HilinkParseError).endpoint).toBe(MAC_FILTER_ENDPOINT);
  });

  it("reads a reply with no SSID block at all as an off filter, not a crash", () => {
    const none = `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<Ssids/>\n</response>`;

    expect(parseMacFilter(none)).toEqual({
      mode: "off",
      entries: [],
      ssids: [],
    });
  });
});

describe("MacFilter — nothing but primitives crosses out of src/hilink/", () => {
  it("types the mode as a word and every address as a string", () => {
    const filter = everySsid(BLACKLIST, [["A2:00:5E:00:00:01", "MacBookPro"]]);

    expect(["off", "whitelist", "blacklist"]).toContain(filter.mode);
    for (const entry of filter.entries) {
      expect(typeof entry.mac).toBe("string");
      expect(typeof entry.name).toBe("string");
    }
    for (const ssid of filter.ssids) {
      expect(typeof ssid.index).toBe("number");
      expect(["off", "whitelist", "blacklist"]).toContain(ssid.mode);
    }
  });

  it("offers an off filter to stand in before one has ever been read", () => {
    expect(MAC_FILTER_OFF).toEqual({ mode: "off", entries: [], ssids: [] });
  });
});
