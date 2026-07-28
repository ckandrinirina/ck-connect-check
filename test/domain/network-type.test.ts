/**
 * The code-to-label table. It is a pure lookup with no router and no window
 * behind it, so every case — including the ones this device will never report —
 * is exercised directly rather than through a snapshot.
 */

import { describe, expect, it } from "vitest";

import { networkTypeLabel } from "../../src/domain/network-type.js";

describe("networkTypeLabel", () => {
  it("names LTE as 4G — the code this device actually reports", () => {
    expect(networkTypeLabel(101)).toBe("4G");
  });

  it("names the HSPA family as 3G", () => {
    expect(networkTypeLabel(41)).toBe("3G");
    expect(networkTypeLabel(45)).toBe("3G");
  });

  it("names the GSM family as 2G", () => {
    expect(networkTypeLabel(1)).toBe("2G");
    expect(networkTypeLabel(3)).toBe("2G");
  });

  it("says there is no service rather than naming a generation for zero", () => {
    // Zero is the router attached to nothing at all. Calling that "2G" would be
    // a worse answer than the truth.
    expect(networkTypeLabel(0)).toBe("No service");
  });

  it("shows an unmapped code as the code, so it can be looked up", () => {
    // The same bargain T-23 struck with unrecognised error codes: a number the
    // user can report beats a label that was guessed at.
    expect(networkTypeLabel(999)).toBe("Type 999");
  });

  it("never invents a label for a negative code either", () => {
    expect(networkTypeLabel(-1)).toBe("Type -1");
  });
});

describe("src/domain/network-type.ts", () => {
  it("imports neither Electron nor the network", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/domain/network-type.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/from\s+["']electron["']/);
    expect(source).not.toMatch(/node:http|node:https|fetch\(/);
  });
});
