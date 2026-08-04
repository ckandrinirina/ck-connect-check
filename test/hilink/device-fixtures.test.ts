/**
 * Guards the LAN-device captures recorded from the router in T-62.
 *
 * These fixtures are the evidence behind the **LAN device API** subsection of
 * `docs/ARCHITECTURE.md`, and everything from T-63 onwards parses them. A
 * truncated or hand-written capture would let a wrong parser look correct, so
 * each one is checked here for being present, well-formed, and still carrying
 * the properties the document draws its conclusions from.
 *
 * Several assertions here are deliberately negative — no `Active` element, no
 * band, exactly ten filter slots. Those absences are the findings; if a later
 * firmware changes one, this suite is what says so.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/hilink/${name}.xml`, import.meta.url)),
    "utf8",
  );
}

const hostList = fixture("host-list");
const hostInfo = fixture("host-info");
const macFilter = fixture("macfilter");

/**
 * The markup alone. Each fixture opens with a comment recording where it came
 * from and what was redacted, and those notes name elements in prose — so any
 * assertion that counts or looks for structure has to read past them.
 */
const withoutNotes = (xml: string): string =>
  xml.replace(/<!--[\s\S]*?-->/g, "");

const hostListBody = withoutNotes(hostList);
const hostInfoBody = withoutNotes(hostInfo);
const macFilterBody = withoutNotes(macFilter);

describe.each([
  ["host-list", hostList],
  ["host-info", hostInfo],
  ["macfilter", macFilter],
])("%s.xml", (_name, xml) => {
  it("is a non-empty XML document", () => {
    expect(xml.trimStart()).toMatch(/^<\?xml /);
    expect(xml.length).toBeGreaterThan(50);
  });

  it("is well-formed, so a truncated capture cannot pass", () => {
    expect(() => parseXml(xml)).not.toThrow();
  });

  it("records what it is and when it was redacted", () => {
    expect(xml).toContain("T-62");
    expect(xml).toMatch(/REDACTED|Nothing is redacted/);
  });
});

describe("host-list.xml — the only device source this firmware offers", () => {
  it("holds the four captured hosts", () => {
    expect(hostListBody.match(/<Host>/g)).toHaveLength(4);
  });

  it("carries every field the document names, verbatim", () => {
    for (const field of [
      "ID",
      "MacAddress",
      "IpAddress",
      "HostName",
      "AssociatedTime",
      "AssociatedSsid",
    ]) {
      expect(hostListBody).toContain(`<${field}>`);
    }
  });

  it("carries no Active element — the document must not claim one", () => {
    expect(hostListBody).not.toMatch(/<Active>/);
  });

  it("carries no band or connection-medium element", () => {
    expect(hostListBody).not.toMatch(/<(Frequency|Band|wifiMode|ConnectionType)>/i);
  });

  it("keeps the empty HostName that T-64 has to name", () => {
    expect(hostListBody).toContain("<HostName></HostName>");
  });

  it("is redacted — no personal name, no unredacted SSID serial", () => {
    expect(hostListBody).toContain("HUAWEI-B310-XXXX");
    expect(hostList).not.toMatch(/ranarimiarintsoa/i);
    expect(hostList).not.toMatch(/\b\d{10,}\b/);
    expect(hostList.toLowerCase()).not.toContain("password");
  });
});

describe("host-info.xml — evidence the endpoint is absent", () => {
  it("is the router's 100002 refusal, not a host list", () => {
    expect(hostInfoBody).toContain("<error>");
    expect(hostInfoBody).toContain("<code>100002</code>");
    expect(hostInfoBody).not.toContain("<Hosts>");
  });
});

describe("macfilter.xml — the filter at rest", () => {
  it("is off on every SSID", () => {
    const statuses = macFilterBody.match(/<WifiMacFilterStatus>(\d+)</g) ?? [];
    expect(statuses).toHaveLength(4);
    expect(new Set(statuses)).toEqual(new Set(["<WifiMacFilterStatus>0<"]));
  });

  it("is per-SSID, with four blocks indexed 0..3", () => {
    expect(macFilterBody.match(/<Ssid>/g)).toHaveLength(4);
    for (const index of [0, 1, 2, 3]) {
      expect(macFilterBody).toContain(`<Index>${index}</Index>`);
    }
  });

  it("caps each SSID at ten entries, not the 32 that was assumed", () => {
    const firstSsid = /<Ssid>[\s\S]*?<\/Ssid>/.exec(macFilterBody)?.[0] ?? "";
    const slots = firstSsid.match(/<WifiMacFilterMac(\d+)>/g) ?? [];
    expect(slots).toHaveLength(10);
    expect(firstSsid).toContain("<WifiMacFilterMac9>");
    expect(firstSsid).not.toContain("<WifiMacFilterMac10>");
  });

  it("keeps the router's own casing split, which a write must reproduce", () => {
    expect(macFilterBody).toContain("<WifiMacFilterMac0>");
    expect(macFilterBody).toContain("<wifihostname0>");
    expect(macFilterBody).not.toContain("<WifiHostName0>");
  });
});

/**
 * A deliberately strict, dependency-free well-formedness check: tags must nest
 * and close in order. Enough to catch a truncated or half-copied capture, which
 * is the only failure this fixture set can realistically have.
 *
 * Comments are stripped first — the fixtures document their own redactions, and
 * those notes mention element names that are not markup.
 */
function parseXml(xml: string): void {
  const body = xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?xml[^?]*\?>/g, "");
  const stack: string[] = [];
  const tag = /<(\/?)([A-Za-z_][\w.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;

  let match: RegExpExecArray | null;
  let seen = 0;
  while ((match = tag.exec(body)) !== null) {
    const [, closing, name, , selfClosing] = match;
    seen += 1;

    if (selfClosing === "/") continue;
    if (closing === "/") {
      const open = stack.pop();
      if (open !== name) {
        throw new Error(`expected </${open ?? "nothing"}>, found </${name}>`);
      }
    } else {
      stack.push(name);
    }
  }

  if (stack.length > 0) {
    throw new Error(`unclosed element(s): ${stack.join(", ")}`);
  }
  if (seen === 0) {
    throw new Error("no elements found");
  }
}
