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
  MAC_FILTER_CAP,
  MAC_FILTER_ENDPOINT,
  MAC_FILTER_OFF,
  macFilterRequestXml,
  macFilterStatus,
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

/**
 * The write T-68 adds. The router replaces the whole filter with what it is
 * sent, so the body is judged on what it *carries* rather than on what it
 * changes: four blocks, ten slots each, both spellings, and a status the reader
 * beside it agrees with.
 *
 * No test here reaches a router. The captured reply is off with every slot
 * empty, so every populated case is a reply built to the captured shape.
 */
describe("macFilterRequestXml", () => {
  const atRest = parseMacFilter(captured);

  it("states the cap the firmware actually enforces, which is ten per SSID", () => {
    // T-62 corrected the architecture's guess of 32: the reply carries
    // `WifiMacFilterMac0..9` and nothing beyond it.
    expect(MAC_FILTER_CAP).toBe(10);
  });

  it("carries all four SSID blocks, so a write cannot clear the ones it omits", () => {
    const body = macFilterRequestXml(atRest);

    expect([...body.matchAll(/<Ssid>/g)]).toHaveLength(4);
    expect(body).toContain("<Index>0</Index>");
    expect(body).toContain("<Index>1</Index>");
    expect(body).toContain("<Index>2</Index>");
    expect(body).toContain("<Index>3</Index>");
  });

  it("sends every one of the ten slots, empty ones included", () => {
    const body = macFilterRequestXml(atRest);

    for (let slot = 0; slot < MAC_FILTER_CAP; slot += 1) {
      expect(body).toContain(`<WifiMacFilterMac${slot}>`);
      expect(body).toContain(`<wifihostname${slot}>`);
    }
    expect(body).not.toContain("<WifiMacFilterMac10>");
  });

  it("reproduces the router's own casing split rather than tidying it", () => {
    const filter = everySsid(BLACKLIST, [["A2:00:5E:00:00:01", "MacBookPro"]]);
    const body = macFilterRequestXml(filter);

    // `WifiMacFilterMacN` is capitalised and `wifihostnameN` is not. That is the
    // device's spelling, and a write has to reproduce both exactly.
    expect(body).toContain(
      "<WifiMacFilterMac0>A2:00:5E:00:00:01</WifiMacFilterMac0>",
    );
    expect(body).toContain("<wifihostname0>MacBookPro</wifihostname0>");
    expect(body).not.toContain("<WifiHostname0>");
  });

  it("puts each address in the slot its block holds it in", () => {
    const body = macFilterRequestXml(
      everySsid(BLACKLIST, [
        ["A2:00:5E:00:00:01", "MacBookPro"],
        ["00:1A:2B:00:00:02", "galaxy-s10e"],
      ]),
    );

    expect(body).toContain(
      "<WifiMacFilterMac1>00:1A:2B:00:00:02</WifiMacFilterMac1>",
    );
    expect(body).toContain("<wifihostname1>galaxy-s10e</wifihostname1>");
    expect(body).toContain("<WifiMacFilterMac9></WifiMacFilterMac9>");
  });

  it("is a request, not a response, and declares its encoding", () => {
    const body = macFilterRequestXml(atRest);

    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain("<request>");
    expect(body).toContain("</request>");
    expect(body).not.toContain("<response>");
  });

  it("escapes a name the router stored, which is the one string we did not write", () => {
    const body = macFilterRequestXml(
      everySsid(BLACKLIST, [["A2:00:5E:00:00:01", "Bill & Ben's <box>"]]),
    );

    expect(body).toContain(
      "<wifihostname0>Bill &amp; Ben&apos;s &lt;box&gt;</wifihostname0>",
    );
  });

  it("writes each block's own status, so a mixed filter is carried as it was read", () => {
    const mixed = parseMacFilter(
      reply(
        ssidBlock(0, BLACKLIST, [["A2:00:5E:00:00:01", "MacBookPro"]]),
        ssidBlock(1, OFF),
        ssidBlock(2, OFF),
        ssidBlock(3, OFF),
      ),
    );
    const statuses = [
      ...macFilterRequestXml(mixed).matchAll(
        /<WifiMacFilterStatus>(\d+)<\/WifiMacFilterStatus>/g,
      ),
    ].map((match) => match[1]);

    expect(statuses).toEqual([String(BLACKLIST), "0", "0", "0"]);
  });
});

/**
 * The one place the router's status number and the app's named mode meet.
 *
 * `1`→whitelist and `2`→blacklist are **inferred from the router's web UI and
 * never observed**: the captured reply is all zeros. These tests therefore pin
 * the *round trip* rather than the number — whatever `MODES` says, the writer
 * and the reader must not disagree, so correcting the table corrects both at
 * once.
 */
describe("macFilterStatus — the mode mapping, written and read the same way", () => {
  it("round-trips every mode through the number the router is sent", () => {
    for (const mode of ["off", "whitelist", "blacklist"] as const) {
      expect(everySsid(macFilterStatus(mode)).mode).toBe(mode);
    }
  });

  it("agrees with the status the fixture's off filter carries", () => {
    expect(macFilterStatus("off")).toBe(0);
  });

  it("hands out a number for every mode and never a word", () => {
    for (const mode of ["off", "whitelist", "blacklist"] as const) {
      expect(Number.isInteger(macFilterStatus(mode))).toBe(true);
    }
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
