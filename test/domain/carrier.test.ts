/**
 * The name-to-carrier table. Like the network-type lookup beside it, this is a
 * pure function with no router behind it, so every spelling the device has been
 * seen to report — and the ones it has not — is exercised directly.
 *
 * The SIM moved from YAS to Orange MG on 2026-08-04, and the two endpoints that
 * name the network disagree on capitalisation for the same one, so the spelling
 * is treated as unreliable and the resolved value as the fact.
 */

import { describe, expect, it } from "vitest";

import { carrierFrom } from "../../src/domain/carrier.js";

describe("carrierFrom", () => {
  it("reads both of the spellings the device reports for Orange as orange", () => {
    // `FullName` shouts and `ShortName` does not, for the same network.
    expect(carrierFrom("ORANGE MG")).toBe("orange");
    expect(carrierFrom("Orange MG")).toBe("orange");
  });

  it("ignores surrounding whitespace and any other casing of Orange", () => {
    expect(carrierFrom(" orange mg ")).toBe("orange");
    expect(carrierFrom("\toRaNgE Mg\n")).toBe("orange");
  });

  it("reads both spellings of Yas as yas", () => {
    expect(carrierFrom("Yas")).toBe("yas");
    expect(carrierFrom("YAS")).toBe("yas");
  });

  it("ignores surrounding whitespace around Yas too", () => {
    expect(carrierFrom("  yas  ")).toBe("yas");
  });

  it("calls a name no table covers unknown rather than guessing", () => {
    // The same bargain the network-type table strikes: a state to render beats
    // a carrier asserted about a network we have never seen.
    expect(carrierFrom("Telma")).toBe("unknown");
    expect(carrierFrom("Airtel MG")).toBe("unknown");
  });

  it("never mistakes a near miss for the carrier it resembles", () => {
    expect(carrierFrom("Orange")).toBe("unknown");
    expect(carrierFrom("Orange MG Postpaid")).toBe("unknown");
    expect(carrierFrom("Yassine")).toBe("unknown");
  });

  it("calls an empty name unknown without throwing", () => {
    expect(carrierFrom("")).toBe("unknown");
    expect(carrierFrom("   ")).toBe("unknown");
  });

  it("calls a missing name unknown without throwing", () => {
    // `FullName` absent from the reply is not the same as a name we cannot
    // place, but the app knows exactly as little either way.
    expect(() => carrierFrom(undefined)).not.toThrow();
    expect(carrierFrom(undefined)).toBe("unknown");
  });

  it("never falls back to yas for a name it cannot place", () => {
    // Everything downstream branches on this: YAS answers over USSD and Orange
    // over a web page, so a wrong guess dials the wrong carrier.
    for (const name of ["", "   ", "Telma", "Orange"]) {
      expect(carrierFrom(name)).not.toBe("yas");
    }
    expect(carrierFrom(undefined)).not.toBe("yas");
  });
});

describe("src/domain/carrier.ts", () => {
  it("imports neither Electron nor the network", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(
      new URL("../../src/domain/carrier.ts", import.meta.url),
      "utf8",
    );

    expect(source).not.toMatch(/from\s+["']electron["']/);
    expect(source).not.toMatch(/node:http|node:https|fetch\(/);
  });
});
