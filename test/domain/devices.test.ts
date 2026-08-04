/**
 * Presentation rules over the typed devices T-63 parses. Like the network-type
 * and carrier tables beside it, this is pure code with no router behind it, so
 * every rule is exercised directly rather than through a snapshot.
 *
 * The medium label this task was planned around is absent on purpose: T-62
 * established that `host-list` carries no band, frequency or medium element,
 * so there is no value to map and a table here would have no caller. See T-64's
 * Notes in `tasks/PLAN.md`.
 */

import { describe, expect, it } from "vitest";

import type { Device } from "../../src/hilink/devices.js";
import type { MacFilter } from "../../src/hilink/macfilter.js";
import { MAC_FILTER_CAP } from "../../src/hilink/macfilter.js";
import {
  compareDevices,
  deviceAssociatedFor,
  deviceDisplayName,
  isDeviceBlocked,
  isLocalDevice,
  listDevices,
  normaliseMac,
  refuseDeviceBlock,
  sortDevices,
  withDeviceBlocked,
  withDeviceUnblocked,
} from "../../src/domain/devices.js";

function device(overrides: Partial<Device> = {}): Device {
  return {
    mac: "A2:00:5E:00:00:01",
    ip: "192.168.8.100",
    name: "MacBookPro",
    ssid: "HUAWEI-B310-XXXX",
    associatedSeconds: 21125,
    ...overrides,
  };
}

describe("deviceDisplayName", () => {
  it("shows a named device's name unchanged", () => {
    expect(deviceDisplayName(device({ name: "MacBookPro" }))).toBe(
      "MacBookPro",
    );
  });

  it("does not translate, prefix or decorate a name it was given", () => {
    expect(deviceDisplayName(device({ name: "galaxy-s10e" }))).toBe(
      "galaxy-s10e",
    );
  });

  it("falls back to the MAC when the router named the host nothing", () => {
    const unnamed = device({ name: "", mac: "00:1A:2B:00:00:02" });
    expect(deviceDisplayName(unnamed)).toBe("00:1A:2B:00:00:02");
  });

  it("never shows a bare placeholder that would make every nameless device look alike", () => {
    const shown = deviceDisplayName(device({ name: "" }));
    expect(shown.toLowerCase()).not.toBe("unknown");
    expect(shown.toLowerCase()).not.toBe("inconnu");
    expect(shown).not.toBe("");
  });

  it("displays two nameless devices differently from each other", () => {
    const first = deviceDisplayName(
      device({ name: "", mac: "00:1A:2B:00:00:02" }),
    );
    const second = deviceDisplayName(
      device({ name: "", mac: "A6:00:5E:00:00:03" }),
    );
    expect(first).not.toBe(second);
  });

  it("treats a whitespace-only name as no name at all", () => {
    const blank = device({ name: "   ", mac: "A6:00:5E:00:00:03" });
    expect(deviceDisplayName(blank)).toBe("A6:00:5E:00:00:03");
  });
});

describe("deviceAssociatedFor", () => {
  it("formats an hour-scale association through the shared duration helper", () => {
    expect(deviceAssociatedFor(device({ associatedSeconds: 21125 }))).toBe(
      "5h 52m",
    );
  });

  it("formats a day-scale association the way that helper actually renders it", () => {
    // `formatDuration` caps at hours by design and `src/domain/format.ts` is
    // outside this task's scope, so a two-day association reads as 55 hours.
    expect(deviceAssociatedFor(device({ associatedSeconds: 200_000 }))).toBe(
      "55h 33m",
    );
  });

  it("formats a minute-scale association without inventing an hour", () => {
    expect(deviceAssociatedFor(device({ associatedSeconds: 1320 }))).toBe(
      "22m",
    );
  });
});

describe("sortDevices", () => {
  const unsorted = [
    device({ name: "iPhone", mac: "A6:00:5E:00:00:03" }),
    device({ name: "", mac: "00:1A:2B:00:00:02" }),
    device({ name: "galaxy-s10e", mac: "AE:00:5E:00:00:04" }),
    device({ name: "MacBookPro", mac: "A2:00:5E:00:00:01" }),
  ];

  it("orders devices by the name they display", () => {
    expect(sortDevices(unsorted).map(deviceDisplayName)).toEqual([
      "00:1A:2B:00:00:02",
      "galaxy-s10e",
      "iPhone",
      "MacBookPro",
    ]);
  });

  it("produces a byte-identical order across two calls on an unchanged list", () => {
    expect(JSON.stringify(sortDevices(unsorted))).toBe(
      JSON.stringify(sortDevices(unsorted)),
    );
  });

  it("is idempotent — sorting an already-sorted list changes nothing", () => {
    const once = sortDevices(unsorted);
    expect(JSON.stringify(sortDevices(once))).toBe(JSON.stringify(once));
  });

  it("does not reorder under a refresh that returned the same list shuffled", () => {
    const shuffled = [unsorted[3], unsorted[0], unsorted[2], unsorted[1]];
    expect(JSON.stringify(sortDevices(shuffled as Device[]))).toBe(
      JSON.stringify(sortDevices(unsorted)),
    );
  });

  it("leaves the caller's array untouched", () => {
    const original = [...unsorted];
    sortDevices(unsorted);
    expect(unsorted).toEqual(original);
  });

  it("sorts an empty list into an empty list", () => {
    expect(sortDevices([])).toEqual([]);
  });
});

describe("compareDevices — the tiebreakers", () => {
  it("breaks a shared name by MAC, deterministically", () => {
    const first = device({ name: "iPhone", mac: "A2:00:5E:00:00:01" });
    const second = device({ name: "iPhone", mac: "A6:00:5E:00:00:03" });

    expect(compareDevices(first, second)).toBeLessThan(0);
    expect(compareDevices(second, first)).toBeGreaterThan(0);
  });

  it("orders two same-named devices the same way whichever order they arrive in", () => {
    const first = device({ name: "iPhone", mac: "A2:00:5E:00:00:01" });
    const second = device({ name: "iPhone", mac: "A6:00:5E:00:00:03" });

    expect(sortDevices([first, second]).map((d) => d.mac)).toEqual(
      sortDevices([second, first]).map((d) => d.mac),
    );
  });

  it("compares names without regard to case, so IPhone and iphone do not split", () => {
    const upper = device({ name: "IPHONE", mac: "A2:00:5E:00:00:01" });
    const lower = device({ name: "iphone", mac: "A6:00:5E:00:00:03" });
    expect(compareDevices(upper, lower)).toBeLessThan(0);
  });

  it("reports a device as equal to itself", () => {
    const only = device();
    expect(compareDevices(only, only)).toBe(0);
  });

  it("does not depend on the host's locale for its ordering", () => {
    // A raw code-unit comparison, not localeCompare: the panel refreshes every
    // 30 seconds and the order must not shift with an ICU build.
    const a = device({ name: "Zeta", mac: "A2:00:5E:00:00:01" });
    const b = device({ name: "eta", mac: "A6:00:5E:00:00:03" });
    expect(compareDevices(a, b)).toBeGreaterThan(0);
  });
});

/** A filter in one mode, remembering the addresses given. */
function filter(
  mode: MacFilter["mode"],
  ...entries: (string | { mac: string; name: string })[]
): MacFilter {
  return {
    mode,
    entries: entries.map((entry) =>
      typeof entry === "string" ? { mac: entry, name: "" } : entry,
    ),
    ssids: [],
  };
}

const LAPTOP = "A2:00:5E:00:00:01";
const PHONE = "00:1A:2B:00:00:02";

describe("normaliseMac", () => {
  it("reads the same address written two ways as one address", () => {
    expect(normaliseMac("a2:00:5e:00:00:01")).toBe(
      normaliseMac("A2-00-5E-00-00-01"),
    );
  });

  it("ignores the separator style entirely", () => {
    expect(normaliseMac("A2-00-5E-00-00-01")).toBe(normaliseMac(LAPTOP));
    expect(normaliseMac("a2005e000001")).toBe(normaliseMac(LAPTOP));
  });

  it("tells two genuinely different addresses apart", () => {
    expect(normaliseMac(LAPTOP)).not.toBe(normaliseMac(PHONE));
  });
});

describe("isDeviceBlocked — the filter is off", () => {
  it("reads a device the list names as allowed all the same", () => {
    // The state the router is in today and the one every fresh install meets:
    // the list is remembered, and it governs nothing.
    expect(isDeviceBlocked(filter("off", LAPTOP), LAPTOP)).toBe(false);
  });

  it("reads a device the list does not name as allowed", () => {
    expect(isDeviceBlocked(filter("off", LAPTOP), PHONE)).toBe(false);
  });

  it("blocks nothing whatever the list holds", () => {
    const remembered = filter("off", LAPTOP, PHONE, "AE:00:5E:00:00:04");

    for (const mac of [
      LAPTOP,
      PHONE,
      "AE:00:5E:00:00:04",
      "A6:00:5E:00:00:03",
    ]) {
      expect(isDeviceBlocked(remembered, mac)).toBe(false);
    }
  });
});

describe("isDeviceBlocked — a blacklist blocks what it names", () => {
  const blacklist = filter("blacklist", LAPTOP);

  it("reads a listed device as blocked", () => {
    expect(isDeviceBlocked(blacklist, LAPTOP)).toBe(true);
  });

  it("reads an unlisted device as allowed", () => {
    expect(isDeviceBlocked(blacklist, PHONE)).toBe(false);
  });

  it("blocks nobody when the list is empty", () => {
    expect(isDeviceBlocked(filter("blacklist"), LAPTOP)).toBe(false);
  });

  it("matches a listed address written in another case and separator style", () => {
    expect(
      isDeviceBlocked(filter("blacklist", "a2-00-5e-00-00-01"), LAPTOP),
    ).toBe(true);
  });
});

describe("isDeviceBlocked — a whitelist blocks what it does not name", () => {
  // Stated in its own right rather than as the blacklist's inverse: the whole
  // point of reading the mode is that the same list means the opposite thing.
  const whitelist = filter("whitelist", LAPTOP);

  it("reads a listed device as allowed", () => {
    expect(isDeviceBlocked(whitelist, LAPTOP)).toBe(false);
  });

  it("reads an unlisted device as blocked", () => {
    expect(isDeviceBlocked(whitelist, PHONE)).toBe(true);
  });

  it("blocks everybody when the list is empty", () => {
    expect(isDeviceBlocked(filter("whitelist"), LAPTOP)).toBe(true);
  });

  it("matches a listed address written in another case and separator style", () => {
    expect(
      isDeviceBlocked(filter("whitelist", "a2-00-5e-00-00-01"), LAPTOP),
    ).toBe(false);
  });
});

describe("isDeviceBlocked — the mode decides, never the list alone", () => {
  it("gives opposite verdicts for one address under the two modes", () => {
    expect(isDeviceBlocked(filter("blacklist", LAPTOP), LAPTOP)).toBe(true);
    expect(isDeviceBlocked(filter("whitelist", LAPTOP), LAPTOP)).toBe(false);
  });

  it("gives opposite verdicts for an unlisted address under the two modes", () => {
    expect(isDeviceBlocked(filter("blacklist", LAPTOP), PHONE)).toBe(false);
    expect(isDeviceBlocked(filter("whitelist", LAPTOP), PHONE)).toBe(true);
  });
});

describe("listDevices — the connected hosts", () => {
  const connected = [
    device({ name: "MacBookPro", mac: LAPTOP }),
    device({ name: "galaxy-s10e", mac: PHONE }),
  ];

  it("marks a blacklisted host as blocked and the others as allowed", () => {
    const listed = listDevices(connected, filter("blacklist", PHONE));

    expect(listed.map((one) => [one.device.mac, one.blocked])).toEqual([
      [PHONE, true],
      [LAPTOP, false],
    ]);
  });

  it("marks every connected host as present", () => {
    const listed = listDevices(connected, filter("blacklist", PHONE));

    expect(listed.every((one) => one.present)).toBe(true);
  });

  it("marks nothing blocked while the filter is off", () => {
    const listed = listDevices(connected, filter("off", PHONE, LAPTOP));

    expect(listed.some((one) => one.blocked)).toBe(false);
  });

  it("puts the devices in the domain's stable order", () => {
    const listed = listDevices(connected, filter("off"));

    expect(listed.map((one) => one.device.name)).toEqual([
      "galaxy-s10e",
      "MacBookPro",
    ]);
  });

  it("leaves the caller's array untouched", () => {
    const original = [...connected];
    listDevices(connected, filter("blacklist", PHONE));

    expect(connected).toEqual(original);
  });

  it("lists nothing when nothing is connected and nothing is filtered", () => {
    expect(listDevices([], filter("off"))).toEqual([]);
  });
});

describe("listDevices — a device the filter remembers and the router does not", () => {
  const away = { mac: "A6:00:5E:00:00:03", name: "iPad" };

  it("still lists it, marked blocked and absent", () => {
    // It was blocked and has since gone away. Without a row it could only be
    // unblocked by connecting first, which is exactly what it cannot do.
    const listed = listDevices([], filter("blacklist", away));

    expect(listed).toHaveLength(1);
    expect(listed[0]?.blocked).toBe(true);
    expect(listed[0]?.present).toBe(false);
    expect(listed[0]?.device.mac).toBe("A6:00:5E:00:00:03");
  });

  it("shows it under the name the filter remembered", () => {
    const listed = listDevices([], filter("blacklist", away));

    expect(deviceDisplayName(listed[0]?.device as Device)).toBe("iPad");
  });

  it("falls back to the MAC when the filter remembered no name", () => {
    const listed = listDevices([], filter("blacklist", "A6:00:5E:00:00:03"));

    expect(deviceDisplayName(listed[0]?.device as Device)).toBe(
      "A6:00:5E:00:00:03",
    );
  });

  it("claims no address or association time the router never stated", () => {
    const [only] = listDevices([], filter("blacklist", away));

    expect(only?.device.ip).toBe("");
    expect(only?.device.ssid).toBe("");
    expect(only?.device.associatedSeconds).toBe(0);
  });

  it("orders it among the connected ones rather than appending it", () => {
    const listed = listDevices(
      [device({ name: "MacBookPro", mac: LAPTOP })],
      filter("blacklist", away),
    );

    expect(listed.map((one) => one.device.name)).toEqual([
      "iPad",
      "MacBookPro",
    ]);
  });

  it("does not list a remembered address that is also connected twice", () => {
    const listed = listDevices(
      [device({ name: "MacBookPro", mac: LAPTOP })],
      filter("blacklist", { mac: "a2-00-5e-00-00-01", name: "stale name" }),
    );

    expect(listed).toHaveLength(1);
    expect(listed[0]?.present).toBe(true);
    expect(listed[0]?.device.name).toBe("MacBookPro");
    expect(listed[0]?.blocked).toBe(true);
  });

  it("adds no row for a remembered address while the filter is off", () => {
    // Nothing is blocked, so there is nothing to unblock, and a ghost row for
    // a device that is neither here nor barred answers no question.
    expect(listDevices([], filter("off", away))).toEqual([]);
  });

  it("adds no row for a whitelisted address that is merely away", () => {
    // A whitelist entry names a device that is allowed, not one that is barred.
    expect(listDevices([], filter("whitelist", away))).toEqual([]);
  });
});

describe("src/domain/devices.ts", () => {
  it("imports neither Electron nor the network", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/domain/devices.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/from\s+["']electron["']/);
    expect(source).not.toMatch(/node:http|node:https|fetch\(/);
  });

  it("carries no medium or band label table — there is no such data to map", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/domain/devices.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/["']2,4 GHz["']/);
    expect(source).not.toMatch(/["']5 GHz["']/);
    expect(source).not.toMatch(/["']Ethernet["']/);
  });
});

/**
 * A filter as the router really sends one: four `<Ssid>` blocks, each with its
 * own mode and its own slots. Everything T-68 writes is composed from a shape
 * like this, because the router replaces the filter with whatever it is sent —
 * a change built from a single block silently clears the other three.
 */
function ssids(mode: MacFilter["mode"], ...macs: string[]): MacFilter {
  const entries = macs.map((mac) => ({ mac, name: `host-${mac.slice(-2)}` }));

  return {
    mode,
    entries,
    ssids: [0, 1, 2, 3].map((index) => ({
      mode,
      index,
      entries: entries.map((entry) => ({ ...entry })),
    })),
  };
}

/** Every address each block holds, block by block. */
function perSsid(next: MacFilter): string[][] {
  return next.ssids.map((ssid) => ssid.entries.map((entry) => entry.mac));
}

const TABLET = "A6:00:5E:00:00:03";

/** As many addresses as one block can hold. */
function capacityMacs(): string[] {
  return Array.from(
    { length: MAC_FILTER_CAP },
    (_unused, slot) => `A2:00:5E:00:00:1${slot}`,
  );
}

describe("withDeviceBlocked — the write is the whole list", () => {
  it("adds the address to every SSID block, because a write carries all four", () => {
    const next = withDeviceBlocked(ssids("blacklist", LAPTOP), PHONE, "phone");

    expect(perSsid(next)).toEqual([
      [LAPTOP, PHONE],
      [LAPTOP, PHONE],
      [LAPTOP, PHONE],
      [LAPTOP, PHONE],
    ]);
  });

  it("leaves every entry that was already there exactly where it was", () => {
    const next = withDeviceBlocked(
      ssids("blacklist", LAPTOP, TABLET),
      PHONE,
      "phone",
    );

    // Composing the write from a remembered list would silently unblock
    // whoever joined it since; this is that rule as an assertion.
    expect(next.entries.map((entry) => entry.mac)).toEqual([
      LAPTOP,
      TABLET,
      PHONE,
    ]);
  });

  it("turns blacklist mode on when the filter was off, in the same write", () => {
    const next = withDeviceBlocked(ssids("off"), LAPTOP, "laptop");

    expect(next.mode).toBe("blacklist");
    expect(next.ssids.map((ssid) => ssid.mode)).toEqual([
      "blacklist",
      "blacklist",
      "blacklist",
      "blacklist",
    ]);
  });

  it("never composes a write in whitelist mode", () => {
    // The one mode this task must never send. `1`→whitelist is inferred from
    // the router's web UI and never observed, and writing it would block every
    // device the list does not name — including the Mac running this app.
    for (const mode of ["off", "blacklist"] as const) {
      const next = withDeviceBlocked(ssids(mode), LAPTOP, "laptop");

      expect(next.mode).not.toBe("whitelist");
      expect(next.ssids.some((ssid) => ssid.mode === "whitelist")).toBe(false);
    }
  });

  it("adds a device the list already holds exactly once", () => {
    const next = withDeviceBlocked(ssids("blacklist", LAPTOP), LAPTOP, "again");

    expect(perSsid(next)).toEqual([[LAPTOP], [LAPTOP], [LAPTOP], [LAPTOP]]);
  });

  it("recognises the same address written another way rather than listing it twice", () => {
    const next = withDeviceBlocked(
      ssids("blacklist", LAPTOP),
      "a2-00-5e-00-00-01",
      "again",
    );

    expect(perSsid(next)[0]).toEqual([LAPTOP]);
  });

  it("stores the address upper-cased, as every other address here is", () => {
    const next = withDeviceBlocked(ssids("off"), "00:1a:2b:00:00:02", "phone");

    expect(perSsid(next)[0]).toEqual([PHONE]);
  });

  it("keeps the name beside the address it was given", () => {
    const next = withDeviceBlocked(ssids("off"), LAPTOP, "MacBookPro");

    expect(next.ssids[0]?.entries[0]).toEqual({
      mac: LAPTOP,
      name: "MacBookPro",
    });
  });

  it("leaves the filter it was handed untouched", () => {
    const before = ssids("off");
    const snapshot = JSON.stringify(before);

    withDeviceBlocked(before, LAPTOP, "laptop");

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("withDeviceUnblocked — the mode is not the write's to change", () => {
  it("removes the address from every SSID block", () => {
    const next = withDeviceUnblocked(ssids("blacklist", LAPTOP, PHONE), PHONE);

    expect(perSsid(next)).toEqual([[LAPTOP], [LAPTOP], [LAPTOP], [LAPTOP]]);
  });

  it("leaves the mode alone when the last blocked device is unblocked", () => {
    const next = withDeviceUnblocked(ssids("blacklist", LAPTOP), LAPTOP);

    // Switching the filter off would be a change to every other device that
    // nobody asked for. The list empties; the mode stands.
    expect(next.entries).toEqual([]);
    expect(next.mode).toBe("blacklist");
    expect(next.ssids.map((ssid) => ssid.mode)).toEqual([
      "blacklist",
      "blacklist",
      "blacklist",
      "blacklist",
    ]);
  });

  it("matches the address whatever separators or case it is written with", () => {
    const next = withDeviceUnblocked(
      ssids("blacklist", LAPTOP, PHONE),
      "a2005e000001",
    );

    expect(perSsid(next)[0]).toEqual([PHONE]);
  });

  it("changes nothing when the address is not in the list", () => {
    const next = withDeviceUnblocked(ssids("blacklist", LAPTOP), TABLET);

    expect(perSsid(next)).toEqual([[LAPTOP], [LAPTOP], [LAPTOP], [LAPTOP]]);
    expect(next.mode).toBe("blacklist");
  });

  it("leaves the filter it was handed untouched", () => {
    const before = ssids("blacklist", LAPTOP);
    const snapshot = JSON.stringify(before);

    withDeviceUnblocked(before, LAPTOP);

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("isLocalDevice — identified by MAC, never by IP", () => {
  it("recognises this machine's own address in the list", () => {
    expect(isLocalDevice(LAPTOP, [LAPTOP])).toBe(true);
  });

  it("ignores separators and case, as every other MAC comparison here does", () => {
    expect(isLocalDevice("a2-00-5e-00-00-01", [LAPTOP])).toBe(true);
    expect(isLocalDevice(LAPTOP, ["a2005e000001"])).toBe(true);
  });

  it("reads another device as another device", () => {
    expect(isLocalDevice(PHONE, [LAPTOP])).toBe(false);
  });

  it("matches nothing when this machine has no interface in the list", () => {
    // On Ethernet, with only Wi-Fi hosts reported, there is nothing to match.
    // That is the correct outcome and not a fallback to work around.
    expect(isLocalDevice(PHONE, [])).toBe(false);
  });
});

describe("refuseDeviceBlock — what is refused before a request is made", () => {
  const local = [LAPTOP];

  it("allows an ordinary block", () => {
    expect(
      refuseDeviceBlock({
        filter: ssids("off"),
        mac: PHONE,
        blocked: true,
        localMacs: local,
      }),
    ).toBeNull();
  });

  it("allows an ordinary unblock", () => {
    expect(
      refuseDeviceBlock({
        filter: ssids("blacklist", PHONE),
        mac: PHONE,
        blocked: false,
        localMacs: local,
      }),
    ).toBeNull();
  });

  it("refuses a block on this machine's own address", () => {
    // Blocking the Mac the app runs on severs the connection the undo would
    // have to travel over. The guard lives here so it does not depend on the UI.
    expect(
      refuseDeviceBlock({
        filter: ssids("off"),
        mac: LAPTOP,
        blocked: true,
        localMacs: local,
      }),
    ).toEqual({ kind: "self" });
  });

  it("refuses it however the local address is spelled", () => {
    expect(
      refuseDeviceBlock({
        filter: ssids("off"),
        mac: "a2-00-5e-00-00-01",
        blocked: true,
        localMacs: local,
      }),
    ).toEqual({ kind: "self" });
  });

  it("still allows this machine to be unblocked, which frees rather than severs", () => {
    expect(
      refuseDeviceBlock({
        filter: ssids("blacklist", LAPTOP),
        mac: LAPTOP,
        blocked: false,
        localMacs: local,
      }),
    ).toBeNull();
  });

  it("refuses nothing when this machine is not in the list at all", () => {
    expect(
      refuseDeviceBlock({
        filter: ssids("off"),
        mac: PHONE,
        blocked: true,
        localMacs: [],
      }),
    ).toBeNull();
  });

  it("refuses a further block once a block is at the cap, naming the cap", () => {
    expect(
      refuseDeviceBlock({
        filter: ssids("blacklist", ...capacityMacs()),
        mac: PHONE,
        blocked: true,
        localMacs: local,
      }),
    ).toEqual({ kind: "full", cap: MAC_FILTER_CAP });
  });

  it("still allows an unblock at the cap, which is the way back under it", () => {
    const macs = capacityMacs();

    expect(
      refuseDeviceBlock({
        filter: ssids("blacklist", ...macs),
        mac: macs[0] as string,
        blocked: false,
        localMacs: local,
      }),
    ).toBeNull();
  });

  it("allows re-blocking a device already in a full list, which adds nothing", () => {
    const macs = capacityMacs();

    expect(
      refuseDeviceBlock({
        filter: ssids("blacklist", ...macs),
        mac: macs[3] as string,
        blocked: true,
        localMacs: local,
      }),
    ).toBeNull();
  });

  it("refuses any write at all while the router is in whitelist mode", () => {
    // Whitelist is the one mode this task never writes. An unblock leaves the
    // mode as it found it, so the write would carry whitelist straight back.
    expect(
      refuseDeviceBlock({
        filter: ssids("whitelist", PHONE),
        mac: PHONE,
        blocked: false,
        localMacs: local,
      }),
    ).toEqual({ kind: "whitelist" });
    expect(
      refuseDeviceBlock({
        filter: ssids("whitelist"),
        mac: PHONE,
        blocked: true,
        localMacs: local,
      }),
    ).toEqual({ kind: "whitelist" });
  });

  it("refuses a write when a single block is a whitelist, not only when all four are", () => {
    const mixed = ssids("blacklist", PHONE);
    const first = mixed.ssids[0];

    if (first !== undefined) {
      first.mode = "whitelist";
    }

    expect(
      refuseDeviceBlock({
        filter: mixed,
        mac: PHONE,
        blocked: false,
        localMacs: local,
      }),
    ).toEqual({ kind: "whitelist" });
  });

  it("refuses a write composed from a filter with no SSID block to write back", () => {
    // `MAC_FILTER_OFF` stands in before a filter has ever been read. A write
    // from it would carry no blocks at all, which is not a write anyone meant.
    expect(
      refuseDeviceBlock({
        filter: { mode: "off", entries: [], ssids: [] },
        mac: PHONE,
        blocked: true,
        localMacs: local,
      }),
    ).toEqual({ kind: "unreadable" });
  });

  it("puts this machine's own address before every other refusal", () => {
    expect(
      refuseDeviceBlock({
        filter: ssids("whitelist", ...capacityMacs()),
        mac: LAPTOP,
        blocked: true,
        localMacs: local,
      }),
    ).toEqual({ kind: "self" });
  });
});
