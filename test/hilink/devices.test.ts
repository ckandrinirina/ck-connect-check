/**
 * The LAN-device boundary. `host-list` is the only device source this firmware
 * offers (T-62), and it is the first reply the app reads that is *nested* — a
 * repeated `<Host>` under `<Hosts>` rather than the flat leaf list every
 * monitoring endpoint sends. These tests pin both halves: the repeated-block
 * reader added to `parse.ts`, and the typed `Device[]` it feeds.
 *
 * The awkward rows come first, because they are the ones a naive parser gets
 * wrong: an empty `HostName`, a single-host reply, an empty list, and two rows
 * sharing a MAC.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  HOST_LIST_ENDPOINT,
  parseHostList,
  type Device,
} from "../../src/hilink/devices.js";
import { HilinkApiError, HilinkParseError } from "../../src/hilink/parse.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/hilink/${name}.xml`, import.meta.url)),
    "utf8",
  );
}

const hostList = fixture("host-list");
const hostInfo = fixture("host-info");
const malformed = fixture("malformed");

/** A `<Host>` block with the fields the router actually sends. */
function host(fields: Record<string, string>): string {
  const body = Object.entries(fields)
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join("\n");
  return `<Host>\n${body}\n</Host>`;
}

/** A whole reply wrapping the given `<Host>` blocks. */
function reply(...hosts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<Hosts>\n${hosts.join(
    "\n",
  )}\n</Hosts>\n</response>`;
}

describe("parseHostList — the captured reply", () => {
  const devices = parseHostList(hostList);

  it("names the endpoint it reads", () => {
    expect(HOST_LIST_ENDPOINT).toBe("/api/wlan/host-list");
  });

  it("returns one device per host in the fixture", () => {
    expect(devices).toHaveLength(4);
  });

  it("reads the MAC, IP, name and association time of a host", () => {
    expect(devices[0]).toEqual({
      mac: "A2:00:5E:00:00:01",
      ip: "192.168.8.100",
      name: "MacBookPro",
      ssid: "HUAWEI-B310-XXXX",
      associatedSeconds: 21125,
    });
  });

  it("keeps the router's order", () => {
    expect(devices.map((device) => device.ip)).toEqual([
      "192.168.8.100",
      "192.168.8.102",
      "192.168.8.103",
      "192.168.8.101",
    ]);
  });

  it("reads every host's association time as a number", () => {
    expect(devices.map((device) => device.associatedSeconds)).toEqual([
      21125, 5172, 1320, 1309,
    ]);
  });
});

describe("parseHostList — a name the router did not give", () => {
  it("leaves an empty HostName empty rather than inventing one", () => {
    const devices = parseHostList(hostList);
    const unnamed = devices.find((device) => device.ip === "192.168.8.102");
    expect(unnamed?.name).toBe("");
  });

  it("does not fall back to the MAC, the IP or a placeholder", () => {
    const devices = parseHostList(hostList);
    const unnamed = devices.find((device) => device.ip === "192.168.8.102");
    expect(unnamed?.name).not.toContain("00:1A:2B");
    expect(unnamed?.name).not.toContain("192.168");
    expect(unnamed?.name.toLowerCase()).not.toContain("unknown");
  });

  it("treats a missing HostName element the same as an empty one", () => {
    const devices = parseHostList(
      reply(
        host({
          MacAddress: "A2:00:5E:00:00:09",
          IpAddress: "192.168.8.109",
          AssociatedTime: "12",
          AssociatedSsid: "HUAWEI-B310-XXXX",
        }),
      ),
    );
    expect(devices).toHaveLength(1);
    expect(devices[0]?.name).toBe("");
  });
});

describe("parseHostList — list shapes", () => {
  it("parses a single-host reply into a one-element array, not a bare object", () => {
    const devices = parseHostList(
      reply(
        host({
          MacAddress: "A2:00:5E:00:00:07",
          IpAddress: "192.168.8.107",
          HostName: "lonely",
          AssociatedTime: "60",
          AssociatedSsid: "HUAWEI-B310-XXXX",
        }),
      ),
    );
    expect(Array.isArray(devices)).toBe(true);
    expect(devices).toHaveLength(1);
    expect(devices[0]?.name).toBe("lonely");
  });

  it("parses an empty host list into an empty array, not an error", () => {
    expect(parseHostList(reply())).toEqual([]);
  });

  it("parses a self-closing empty container into an empty array", () => {
    const empty = `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<Hosts/>\n</response>`;
    expect(parseHostList(empty)).toEqual([]);
  });
});

describe("parseHostList — the MAC is the identity", () => {
  const duplicated = reply(
    host({
      MacAddress: "A2:00:5E:00:00:05",
      IpAddress: "192.168.8.105",
      HostName: "stale-lease",
      AssociatedTime: "900",
      AssociatedSsid: "HUAWEI-B310-XXXX",
    }),
    host({
      MacAddress: "A2:00:5E:00:00:05",
      IpAddress: "192.168.8.106",
      HostName: "current-lease",
      AssociatedTime: "30",
      AssociatedSsid: "HUAWEI-B310-XXXX",
    }),
  );

  it("collapses two entries sharing a MAC into one device", () => {
    expect(parseHostList(duplicated)).toHaveLength(1);
  });

  it("keeps the later entry, the router's freshest word on that MAC", () => {
    const [device] = parseHostList(duplicated);
    expect(device?.name).toBe("current-lease");
    expect(device?.ip).toBe("192.168.8.106");
  });

  it("treats a MAC differing only in case as the same device", () => {
    const mixedCase = reply(
      host({
        MacAddress: "a2:00:5e:00:00:08",
        IpAddress: "192.168.8.108",
        HostName: "lower",
        AssociatedTime: "10",
        AssociatedSsid: "HUAWEI-B310-XXXX",
      }),
      host({
        MacAddress: "A2:00:5E:00:00:08",
        IpAddress: "192.168.8.118",
        HostName: "upper",
        AssociatedTime: "20",
        AssociatedSsid: "HUAWEI-B310-XXXX",
      }),
    );
    const devices = parseHostList(mixedCase);
    expect(devices).toHaveLength(1);
    expect(devices[0]?.mac).toBe("A2:00:5E:00:00:08");
  });

  it("gives every device in the capture a distinct MAC", () => {
    const devices = parseHostList(hostList);
    expect(new Set(devices.map((device) => device.mac)).size).toBe(
      devices.length,
    );
  });
});

describe("parseHostList — failures carry the endpoint", () => {
  it("raises an API error carrying the router's code when the reply is an error", () => {
    let caught: unknown;
    try {
      parseHostList(hostInfo);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HilinkApiError);
    expect((caught as HilinkApiError).code).toBe(100002);
    expect((caught as HilinkApiError).endpoint).toBe(HOST_LIST_ENDPOINT);
  });

  it("raises an API error for the unauthenticated 100003 refusal", () => {
    // The fixture names 100002 in its comment before the element, so the
    // replacement has to target the element itself.
    const denied = hostInfo.replace(
      "<code>100002</code>",
      "<code>100003</code>",
    );
    let caught: unknown;
    try {
      parseHostList(denied);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HilinkApiError);
    expect((caught as HilinkApiError).code).toBe(100003);
  });

  it("raises a parse error, not an API error, for malformed XML", () => {
    let caught: unknown;
    try {
      parseHostList(malformed);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HilinkParseError);
    expect(caught).not.toBeInstanceOf(HilinkApiError);
    expect((caught as HilinkParseError).endpoint).toBe(HOST_LIST_ENDPOINT);
  });

  it("rejects a host whose MacAddress is missing", () => {
    const noMac = reply(
      host({
        IpAddress: "192.168.8.110",
        HostName: "nameless",
        AssociatedTime: "5",
        AssociatedSsid: "HUAWEI-B310-XXXX",
      }),
    );
    expect(() => parseHostList(noMac)).toThrow(HilinkParseError);
  });

  it("rejects a host whose AssociatedTime is not numeric", () => {
    const badTime = reply(
      host({
        MacAddress: "A2:00:5E:00:00:11",
        IpAddress: "192.168.8.111",
        HostName: "odd",
        AssociatedTime: "a while",
        AssociatedSsid: "HUAWEI-B310-XXXX",
      }),
    );
    expect(() => parseHostList(badTime)).toThrow(HilinkParseError);
  });
});

describe("Device — nothing but primitives crosses out of src/hilink/", () => {
  const devices = parseHostList(hostList);

  it("types every field as a string or a number, never the router's XML", () => {
    for (const device of devices) {
      expect(typeof device.mac).toBe("string");
      expect(typeof device.ip).toBe("string");
      expect(typeof device.name).toBe("string");
      expect(typeof device.ssid).toBe("string");
      expect(typeof device.associatedSeconds).toBe("number");
    }
  });

  it("carries no element the router never sent — no medium, band or active flag", () => {
    for (const device of devices) {
      expect(Object.keys(device).sort()).toEqual([
        "associatedSeconds",
        "ip",
        "mac",
        "name",
        "ssid",
      ]);
    }
  });

  it("exposes a Device assignable from plain values alone", () => {
    const plain: Device = {
      mac: "A2:00:5E:00:00:12",
      ip: "192.168.8.112",
      name: "plain",
      ssid: "HUAWEI-B310-XXXX",
      associatedSeconds: 1,
    };
    expect(plain.mac).toBe("A2:00:5E:00:00:12");
  });
});
