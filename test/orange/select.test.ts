import { describe, expect, it } from "vitest";

import { selectForfait } from "../../src/orange/select.js";
import type { OrangeForfait } from "../../src/orange/types.js";

/** A forfait as `parse.ts` would hand it over, named and shaped by the caller. */
function forfait(
  label: string,
  extra: Partial<OrangeForfait> = {},
): OrangeForfait {
  return { label, ...extra };
}

/** The uncapped shape the live capture carries: a nature line and no ring. */
function internet(label: string): OrangeForfait {
  return forfait(label, { nature: "Internet", consumedBytes: 7_960_000_000 });
}

/** A capped bundle, whose `.bundle-circlebar` states its kind outright. */
function capped(label: string, bundleType: string): OrangeForfait {
  return forfait(label, { bundleType, percent: 50 });
}

describe("selectForfait — a single forfait", () => {
  it("selects a lone Internet forfait when nothing is remembered", () => {
    const selection = selectForfait([internet("Wifiber Go+ SSE")]);

    expect(selection.selected?.label).toBe("Wifiber Go+ SSE");
  });

  it("selects a lone forfait whose bundle type is data", () => {
    const selection = selectForfait([capped("Pass Internet 1Go", "data")]);

    expect(selection.selected?.label).toBe("Pass Internet 1Go");
  });

  it("reads the nature rather than the position, so a reorder changes nothing", () => {
    const voice = capped("Pass Voix", "voice");
    const data = internet("Wifiber Go+ SSE");

    expect(selectForfait([voice, data]).selected?.label).toBe(
      "Wifiber Go+ SSE",
    );
    expect(selectForfait([data, voice]).selected?.label).toBe(
      "Wifiber Go+ SSE",
    );
  });

  it("selects nothing at all from a page that stated no forfaits", () => {
    const selection = selectForfait([]);

    expect(selection.selected).toBeNull();
    expect(selection.candidates).toEqual([]);
  });
});

describe("selectForfait — the three kinds a data meter does not measure", () => {
  it("never selects a voice bundle, even as the only one present", () => {
    const selection = selectForfait([capped("Pass Voix", "voice")]);

    expect(selection.selected).toBeNull();
  });

  it("never selects an SMS bundle, even as the only one present", () => {
    const selection = selectForfait([capped("Pass SMS", "sms")]);

    expect(selection.selected).toBeNull();
  });

  it("never selects a credit bundle, even as the only one present", () => {
    const selection = selectForfait([capped("Crédit", "credit")]);

    expect(selection.selected).toBeNull();
  });

  it("never selects one named only by its nature line, with no ring at all", () => {
    for (const nature of ["Voix", "SMS", "Crédit"]) {
      const selection = selectForfait([forfait("Un pass", { nature })]);

      expect(selection.selected).toBeNull();
      expect(selection.candidates).toEqual([]);
    }
  });

  it("keeps them out of the candidates, since they are nothing to offer", () => {
    const selection = selectForfait([
      capped("Pass Voix", "voice"),
      capped("Pass SMS", "sms"),
      capped("Crédit", "credit"),
    ]);

    expect(selection.candidates).toEqual([]);
  });

  it("ignores them beside a data forfait rather than shadowing it", () => {
    const selection = selectForfait([
      capped("Pass Voix", "voice"),
      internet("Wifiber Go+ SSE"),
      capped("Pass SMS", "sms"),
    ]);

    expect(selection.selected?.label).toBe("Wifiber Go+ SSE");
    expect(selection.candidates.map((entry) => entry.label)).toEqual([
      "Wifiber Go+ SSE",
    ]);
  });
});

describe("selectForfait — several data forfaits at once", () => {
  const base = internet("Wifiber Go+ SSE");
  const topUp = capped("Pass Internet 1Go", "data");

  it("selects the remembered one when it is listed first", () => {
    const selection = selectForfait([topUp, base], "Pass Internet 1Go");

    expect(selection.selected?.label).toBe("Pass Internet 1Go");
  });

  it("selects the remembered one when it is listed last", () => {
    const selection = selectForfait([base, topUp], "Pass Internet 1Go");

    expect(selection.selected?.label).toBe("Pass Internet 1Go");
  });

  it("reports a remembered choice as the user's own", () => {
    expect(selectForfait([base, topUp], "Pass Internet 1Go").remembered).toBe(
      true,
    );
  });

  it("selects the first data forfait when nothing was remembered", () => {
    const selection = selectForfait([base, topUp]);

    expect(selection.selected?.label).toBe("Wifiber Go+ SSE");
  });

  it("reports that an unremembered choice was not the user's", () => {
    expect(selectForfait([base, topUp]).remembered).toBe(false);
  });

  it("offers every data forfait as a candidate, in page order", () => {
    const selection = selectForfait([base, topUp]);

    expect(selection.candidates.map((entry) => entry.label)).toEqual([
      "Wifiber Go+ SSE",
      "Pass Internet 1Go",
    ]);
  });

  it("falls back to the first data forfait when the remembered label is gone", () => {
    const selection = selectForfait([base, topUp], "Pass Internet 5Go");

    expect(selection.selected?.label).toBe("Wifiber Go+ SSE");
    expect(selection.remembered).toBe(false);
  });

  it("never lets a remembered voice bundle win over a data one", () => {
    const selection = selectForfait(
      [base, capped("Pass Voix", "voice")],
      "Pass Voix",
    );

    expect(selection.selected?.label).toBe("Wifiber Go+ SSE");
    expect(selection.remembered).toBe(false);
  });
});

describe("selectForfait — a nature nobody recognises", () => {
  const strange = forfait("Pass Mystère", { nature: "Roaming Nuit" });

  it("returns it among the candidates rather than discarding it", () => {
    const selection = selectForfait([strange]);

    expect(selection.candidates.map((entry) => entry.label)).toEqual([
      "Pass Mystère",
    ]);
  });

  it("never selects it, even as the only forfait on the page", () => {
    const selection = selectForfait([strange]);

    expect(selection.selected).toBeNull();
    expect(selection.remembered).toBe(false);
  });

  it("never selects it when a recognised data forfait is listed after it", () => {
    const selection = selectForfait([strange, internet("Wifiber Go+ SSE")]);

    expect(selection.selected?.label).toBe("Wifiber Go+ SSE");
    expect(selection.candidates.map((entry) => entry.label)).toEqual([
      "Pass Mystère",
      "Wifiber Go+ SSE",
    ]);
  });

  it("treats a forfait stating neither nature nor bundle type as unrecognised", () => {
    const selection = selectForfait([forfait("Sans nature")]);

    expect(selection.selected).toBeNull();
    expect(selection.candidates.map((entry) => entry.label)).toEqual([
      "Sans nature",
    ]);
  });

  it("never selects it even when its label is the remembered one", () => {
    const selection = selectForfait([strange], "Pass Mystère");

    expect(selection.selected).toBeNull();
    expect(selection.remembered).toBe(false);
  });
});

describe("selectForfait — purity", () => {
  it("leaves the list it was handed untouched", () => {
    const forfaits = [
      internet("Wifiber Go+ SSE"),
      capped("Pass Voix", "voice"),
    ];
    const before = JSON.stringify(forfaits);

    selectForfait(forfaits, "Wifiber Go+ SSE");

    expect(JSON.stringify(forfaits)).toBe(before);
  });

  it("hands back the parsed forfait itself, not a copy missing its figures", () => {
    const only = internet("Wifiber Go+ SSE");

    expect(selectForfait([only]).selected).toBe(only);
  });
});
