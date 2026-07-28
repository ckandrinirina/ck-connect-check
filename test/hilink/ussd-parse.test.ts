import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { HilinkParseError } from "../../src/hilink/parse.js";
import {
  parseAllowance,
  parseUssdContent,
  parseUssdError,
} from "../../src/hilink/ussd-parse.js";
import type { UssdReply } from "../../src/hilink/types.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/hilink/${name}.xml`, import.meta.url)),
    "utf8",
  );
}

/** The router's own `/api/ussd/get` envelope, around arbitrary carrier text. */
function envelope(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<content>${text}</content>\n<date></date>\n</response>`;
}

function reply(text: string): UssdReply {
  return parseUssdContent(envelope(text));
}

const credit = fixture("ussd-1-credit");
const offers = fixture("ussd-2-offers");
const offer = fixture("ussd-3-offer");
const allowance = fixture("ussd-4-allowance");
const malformed = fixture("malformed");

describe("parseUssdContent", () => {
  it("returns the text and options of a <response><content> envelope", () => {
    const parsed = parseUssdContent(credit);
    expect(parsed.text).toBe(
      "Votre credit est: 0 Ar valable jusqu au 24/10/2026.\n1 Mes offres",
    );
    expect(Array.isArray(parsed.options)).toBe(true);
  });

  it("reads the single option of the #359# reply", () => {
    expect(parseUssdContent(credit).options).toEqual([
      { digit: "1", label: "Mes offres" },
    ]);
  });

  it("reads the offer list reply", () => {
    const parsed = parseUssdContent(offers);
    expect(parsed.options).toEqual([
      { digit: "1", label: "NET MONTH 200 000" },
    ]);
  });

  it("keeps 00 as a string and preserves the order of the third reply", () => {
    const parsed = parseUssdContent(offer);
    expect(parsed.options).toEqual([
      { digit: "1", label: "Info conso" },
      { digit: "00", label: "Page precedente" },
    ]);
    expect(typeof parsed.options[1]?.digit).toBe("string");
    expect(parsed.options[1]?.digit).toBe("00");
  });

  it("returns an empty options array, not null, when no line is numbered", () => {
    const parsed = parseUssdContent(allowance);
    expect(parsed.options).toEqual([]);
    expect(parsed.options).not.toBeNull();
  });

  it("raises the shared parse error on a malformed envelope", () => {
    expect(() => parseUssdContent(malformed)).toThrow(HilinkParseError);
  });

  it("raises the shared parse error on an empty body", () => {
    expect(() => parseUssdContent("")).toThrow(HilinkParseError);
  });

  it("names the ussd endpoint on a parse failure", () => {
    let caught: unknown;
    try {
      parseUssdContent(malformed);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HilinkParseError);
    expect((caught as HilinkParseError).endpoint).toBe("/api/ussd/get");
  });
});

describe("parseAllowance", () => {
  const parsed = parseAllowance(parseUssdContent(allowance));

  it("reads the remaining volume on the decimal 1000^3 scale", () => {
    expect(parsed?.remainingBytes).toBe(145_835_900_000);
  });

  it("reads the expiry date", () => {
    expect(parsed?.expiresAt?.getDate()).toBe(25);
    expect((parsed?.expiresAt?.getMonth() ?? -1) + 1).toBe(8);
    expect(parsed?.expiresAt?.getFullYear()).toBe(2026);
  });

  it("reads the offer name as the plan label", () => {
    expect(parsed?.planLabel).toBe("NET MONTH 200 000");
  });

  it("accepts Go, Mo and Ko units", () => {
    expect(
      parseAllowance(reply("X, il vous reste 2 Go restants."))?.remainingBytes,
    ).toBe(2_000_000_000);
    expect(
      parseAllowance(reply("X, il vous reste 500 Mo restants."))
        ?.remainingBytes,
    ).toBe(500_000_000);
    expect(
      parseAllowance(reply("X, il vous reste 250 Ko restants."))
        ?.remainingBytes,
    ).toBe(250_000);
  });

  it("accepts a comma decimal separator", () => {
    expect(
      parseAllowance(
        reply("NET MONTH 200 000, il vous reste 145835,9 Mo utilisable."),
      )?.remainingBytes,
    ).toBe(145_835_900_000);
  });

  it("returns null for the credit line rather than throwing", () => {
    expect(parseAllowance(parseUssdContent(credit))).toBeNull();
  });

  it('returns null for any reply without an "il vous reste" clause', () => {
    expect(parseAllowance(parseUssdContent(offers))).toBeNull();
    expect(parseAllowance(parseUssdContent(offer))).toBeNull();
    expect(parseAllowance(reply(""))).toBeNull();
  });

  it("returns null instead of throwing when the clause carries no readable volume", () => {
    expect(
      parseAllowance(reply("il vous reste beaucoup de donnees.")),
    ).toBeNull();
  });
});

describe("parseUssdError", () => {
  it("maps 111019 to a not-ready result", () => {
    expect(parseUssdError(fixture("ussd-not-ready"))).toEqual({
      kind: "not-ready",
      code: 111019,
    });
  });

  it("keeps any other error code distinct from not-ready", () => {
    const other = fixture("ussd-not-ready").replace("111019", "100003");
    const result = parseUssdError(other);
    expect(result.kind).toBe("error");
    expect(result.kind).not.toBe("not-ready");
    expect(result).toEqual({ kind: "error", code: 100003 });
  });

  it("reports a content envelope as ready", () => {
    expect(parseUssdError(allowance)).toEqual({ kind: "ready" });
  });

  it("raises the shared parse error on a malformed or empty envelope", () => {
    expect(() => parseUssdError(malformed)).toThrow(HilinkParseError);
    expect(() => parseUssdError("")).toThrow(HilinkParseError);
  });
});
