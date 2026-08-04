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
import {
  compareDevices,
  deviceAssociatedFor,
  deviceDisplayName,
  sortDevices,
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
