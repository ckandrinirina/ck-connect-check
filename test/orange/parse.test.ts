import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseInfoConso, parseOctets } from "../../src/orange/parse.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/orange/${name}.html`, import.meta.url)),
    "utf8",
  );
}

/**
 * The live `http://123.orange.mg/info-conso/` capture. It can only be fetched
 * from inside the Orange network, so it is committed rather than re-fetched.
 */
const liveCapture = fixture("info-conso");

/** Wraps hand-built markup in the shell the portal serves it in. */
function portal(body: string): string {
  return `<!DOCTYPE html><html class="h-100" lang="fr"><head><meta charSet="utf-8"/><title>Info conso</title></head><body>${body}</body></html>`;
}

/** The `Forfaits en cours de validité` section, around arbitrary bundle items. */
function forfaitsSection(items: string): string {
  return `<section class="mb-2">
      <div class="header"><div class="container-wrapper"><div class="row">
        <div class="title col color-orange">
          <h5 class="h5_orange px-0 py-1 mb-0">Forfaits en cours de validité</h5>
        </div>
      </div></div></div>
      <div class="container-wrapper content"><div class="row">${items}</div></div>
    </section>`;
}

/** The `Compte principal` section the portal puts above the forfaits. */
const comptePrincipal = `<section class="mb-2">
    <div class="header"><div class="container-wrapper"><div class="row">
      <div class="title col color-orange">
        <h5 class="h5_orange px-0 py-1 mb-0">Compte principal</h5>
      </div>
    </div></div></div>
    <div class="container-wrapper content"><div class="row"><div class="col pt-3 pb-1">
      <p>Vous êtes sur l’offre <span class="color-primary text-bolder">WiFiber</span><span class="fw-bold"></span>.</p>
      <p>Le solde de votre compte de rechargement est de <span class="color-orange text-bolder">0 Ar</span>.</p>
    </div></div></div>
  </section>`;

/** An uncapped bundle item, shaped exactly like the one in the live capture. */
function bundleItem(label: string, nature: string, consumed: string): string {
  return `<div class="col-12 col-md-6 pt-3 pb-2 bundle-item">
      <div class="single-conso-item">
      <span class="item_title title px-0 py-0">
         ${label}
      </span>
      <div class="row_content">
        <div class="col m-xs px-2 py-1 da-container card_chart">
          <div class="row da-item pt-2 pb-2">
            <div class="description-container col-8 col-sm-8 col-md-9 pl-0">
              <span class="title-da-nature title border-0">${nature}</span>
              <p class="mb-1">Vous avez consommé <span class="color-orange text-bolder text-nowrap">${consumed}</span> sur votre forfait</p>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>`;
}

/**
 * A capped bundle: `full.infoconso.js` draws a ring from the two data
 * attributes, which Wifiber Go+ SSE does not carry.
 */
function cappedBundleItem(
  label: string,
  nature: string,
  consumed: string,
  type: string,
  pcvalue: string,
): string {
  return `<div class="col-12 col-md-6 pt-3 pb-2 bundle-item">
      <div class="single-conso-item">
      <span class="item_title title px-0 py-0">${label}</span>
      <div class="row_content">
        <div class="col m-xs px-2 py-1 da-container card_chart">
          <div class="row da-item pt-2 pb-2">
            <div class="description-container col-8 col-sm-8 col-md-9 pl-0">
              <span class="title-da-nature title border-0">${nature}</span>
              <p class="mb-1">Vous avez consommé <span class="color-orange text-bolder text-nowrap">${consumed}</span> sur votre forfait</p>
            </div>
            <div class="col-4 col-sm-4 col-md-3 px-0">
              <div class="bundle-circlebar" data-bundle-type="${type}" data-bundle-pcvalue="${pcvalue}"></div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>`;
}

describe("parseOctets", () => {
  it("reads the live capture's own format on the 1000³ decimal scale", () => {
    expect(parseOctets("7.37Go")).toBe(7_370_000_000);
  });

  it("reads megaoctets", () => {
    expect(parseOctets("512Mo")).toBe(512_000_000);
  });

  it("reads a comma decimal separator, which is the French one", () => {
    expect(parseOctets("1,5Go")).toBe(1_500_000_000);
  });

  it("reads kilooctets", () => {
    expect(parseOctets("800Ko")).toBe(800_000);
  });

  it("reads bare octets", () => {
    expect(parseOctets("512o")).toBe(512);
  });

  it("reads teraoctets", () => {
    expect(parseOctets("1.2To")).toBe(1_200_000_000_000);
  });

  it("tolerates a space between the number and the unit", () => {
    expect(parseOctets(" 7.37 Go ")).toBe(7_370_000_000);
  });

  it("returns null rather than zero for text that states no volume", () => {
    expect(parseOctets("Internet")).toBeNull();
    expect(parseOctets("0 Ar")).toBeNull();
    expect(parseOctets("")).toBeNull();
  });
});

describe("parseInfoConso — the live capture", () => {
  const parsed = parseInfoConso(liveCapture);

  it("yields exactly one forfait", () => {
    expect(parsed.forfaits).toHaveLength(1);
  });

  it("reads the forfait's label and nature", () => {
    expect(parsed.forfaits[0]?.label).toBe("Wifiber Go+ SSE");
    expect(parsed.forfaits[0]?.nature).toBe("Internet");
  });

  it("reads the consumed volume as decimal octets", () => {
    // The plan documented 7.37 Go from an earlier capture the same day; this
    // committed capture states 7.96 Go, the meter having advanced since.
    expect(parsed.forfaits[0]?.consumedBytes).toBe(7_960_000_000);
  });

  it("leaves the ring fields undefined, since the page states no percentage", () => {
    expect(parsed.forfaits[0]?.bundleType).toBeUndefined();
    expect(parsed.forfaits[0]?.percent).toBeUndefined();
  });

  it("reads the account-level offer and balance", () => {
    expect(parsed.account.offer).toBe("WiFiber");
    expect(parsed.account.balanceAr).toBe(0);
  });

  it("keeps the account lines out of the forfait list", () => {
    expect(parsed.forfaits.map((forfait) => forfait.label)).toEqual([
      "Wifiber Go+ SSE",
    ]);
  });
});

describe("parseInfoConso — capped bundles", () => {
  it("reads data-bundle-type and data-bundle-pcvalue off a .bundle-circlebar", () => {
    const parsed = parseInfoConso(
      portal(
        forfaitsSection(
          cappedBundleItem(
            "Pass Internet 1Go",
            "Internet",
            "512Mo",
            "data",
            "50",
          ),
        ),
      ),
    );
    expect(parsed.forfaits).toHaveLength(1);
    expect(parsed.forfaits[0]?.bundleType).toBe("data");
    expect(parsed.forfaits[0]?.percent).toBe(50);
    expect(parsed.forfaits[0]?.consumedBytes).toBe(512_000_000);
  });

  it("leaves both fields undefined, never zero, when the attributes are absent", () => {
    const parsed = parseInfoConso(
      portal(
        forfaitsSection(bundleItem("Wifiber Go+ SSE", "Internet", "7.37Go")),
      ),
    );
    expect(parsed.forfaits[0]?.bundleType).toBeUndefined();
    expect(parsed.forfaits[0]?.percent).toBeUndefined();
    expect("percent" in (parsed.forfaits[0] ?? {})).toBe(false);
  });

  it("reads several forfaits of differing shapes in page order", () => {
    const parsed = parseInfoConso(
      portal(
        forfaitsSection(
          bundleItem("Wifiber Go+ SSE", "Internet", "7.37Go") +
            cappedBundleItem("Pass Voix", "Voix", "800Ko", "voice", "12"),
        ),
      ),
    );
    expect(parsed.forfaits.map((forfait) => forfait.label)).toEqual([
      "Wifiber Go+ SSE",
      "Pass Voix",
    ]);
    expect(parsed.forfaits[1]?.bundleType).toBe("voice");
    expect(parsed.forfaits[1]?.percent).toBe(12);
  });
});

describe("parseInfoConso — tolerance", () => {
  it("returns an empty list, not an error, when the forfaits section is absent", () => {
    const parsed = parseInfoConso(portal(comptePrincipal));
    expect(parsed.forfaits).toEqual([]);
    expect(parsed.account.offer).toBe("WiFiber");
  });

  it("returns an empty list for markup that matches no known shape", () => {
    expect(
      parseInfoConso("<html><body><h1>Erreur</h1></body></html>").forfaits,
    ).toEqual([]);
  });

  it("never throws on markup that is not a portal page at all", () => {
    for (const markup of [
      "",
      "not html at all",
      "<div><span class='bundle-item'>",
      "<<<>>><div class=",
      "<!-- only a comment -->",
    ]) {
      expect(() => parseInfoConso(markup)).not.toThrow();
      expect(parseInfoConso(markup).forfaits).toEqual([]);
    }
  });

  it("leaves the account fields undefined when the page states neither", () => {
    const parsed = parseInfoConso(portal("<p>Rien à signaler.</p>"));
    expect(parsed.account.offer).toBeUndefined();
    expect(parsed.account.balanceAr).toBeUndefined();
  });

  it("skips a bundle item that carries no label", () => {
    const parsed = parseInfoConso(
      portal(forfaitsSection(`<div class="bundle-item"><div></div></div>`)),
    );
    expect(parsed.forfaits).toEqual([]);
  });

  it("ignores bundle items outside the forfaits section", () => {
    const parsed = parseInfoConso(
      portal(bundleItem("Hors section", "Internet", "1Go")),
    );
    expect(parsed.forfaits).toEqual([]);
  });
});
