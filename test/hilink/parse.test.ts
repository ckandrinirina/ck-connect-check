import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  HilinkApiError,
  HilinkParseError,
  isStaleSessionError,
  parseCurrentPlmn,
  parseMonthStatistics,
  parseSesTokInfo,
  parseStartDate,
  parseStatus,
  parseToken,
  parseTrafficStatistics,
} from "../../src/hilink/parse.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/hilink/${name}.xml`, import.meta.url)),
    "utf8",
  );
}

const staleSession = fixture("error-125002");
const malformed = fixture("malformed");

describe("parseMonthStatistics", () => {
  const parsed = parseMonthStatistics(fixture("month_statistics"));

  it("reads the recorded monthly totals as numbers", () => {
    expect(parsed.monthDownloadBytes).toBe(4427475340);
    expect(parsed.monthUploadBytes).toBe(1403243047);
  });

  it("reads the connected duration and last clear time", () => {
    expect(parsed.monthDurationSeconds).toBe(28902);
    expect(parsed.monthLastClearTime).toBe("2026-7-27");
  });

  it("types every numeric field as a number", () => {
    expect(typeof parsed.monthDownloadBytes).toBe("number");
    expect(typeof parsed.monthUploadBytes).toBe("number");
    expect(typeof parsed.monthDurationSeconds).toBe("number");
  });

  it("rejects a reply whose numeric field is missing", () => {
    const withoutDownload = fixture("month_statistics").replace(
      /<CurrentMonthDownload>.*<\/CurrentMonthDownload>/,
      "",
    );
    expect(() => parseMonthStatistics(withoutDownload)).toThrow(
      HilinkParseError,
    );
  });
});

describe("parseTrafficStatistics", () => {
  const parsed = parseTrafficStatistics(fixture("traffic-statistics"));

  it("reads the instantaneous rates as numbers", () => {
    expect(parsed.downloadRateBps).toBe(9828);
    expect(parsed.uploadRateBps).toBe(33066);
    expect(typeof parsed.downloadRateBps).toBe("number");
    expect(typeof parsed.uploadRateBps).toBe("number");
  });

  it("reads the current connection time", () => {
    expect(parsed.connectTimeSeconds).toBe(11440);
  });
});

describe("parseStatus", () => {
  const parsed = parseStatus(fixture("status"));

  it("reads signal bars against the device maximum", () => {
    expect(parsed.signalBars).toBe(5);
    expect(parsed.maxSignalBars).toBe(5);
    expect(typeof parsed.signalBars).toBe("number");
    expect(typeof parsed.maxSignalBars).toBe("number");
  });

  it("counts the connected devices", () => {
    expect(parsed.connectedDevices).toBe(2);
    expect(typeof parsed.connectedDevices).toBe("number");
  });

  it("reads the network type as the code the router states", () => {
    // Left as a number here: which generation `101` means is a question for
    // `src/domain/`, not for the boundary that reads the reply.
    expect(parsed.networkTypeCode).toBe(101);
    expect(typeof parsed.networkTypeCode).toBe("number");
  });

  it("refuses a status reply with no network type, like any missing field", () => {
    const withoutType = fixture("status").replace(
      "<CurrentNetworkTypeEx>101</CurrentNetworkTypeEx>",
      "",
    );

    expect(() => parseStatus(withoutType)).toThrow(/CurrentNetworkTypeEx/);
  });

  it("reports connection status 901 as connected", () => {
    expect(parsed.connected).toBe(true);
  });

  it("reports a disconnected status as not connected", () => {
    const disconnected = fixture("status").replace(
      "<ConnectionStatus>901</ConnectionStatus>",
      "<ConnectionStatus>902</ConnectionStatus>",
    );
    expect(parseStatus(disconnected).connected).toBe(false);
  });
});

describe("parseCurrentPlmn", () => {
  it("reads the carrier name", () => {
    expect(parseCurrentPlmn(fixture("current-plmn")).carrier).toBe("Yas");
  });

  it("treats an empty carrier name as unknown", () => {
    const empty = fixture("current-plmn").replace(
      "<FullName>Yas</FullName>",
      "<FullName></FullName>",
    );
    expect(parseCurrentPlmn(empty).carrier).toBe("");
  });

  function named(fullName: string): string {
    return fixture("current-plmn").replace(
      "<FullName>Yas</FullName>",
      `<FullName>${fullName}</FullName>`,
    );
  }

  it("resolves the name to a carrier the snapshot carries", () => {
    expect(parseCurrentPlmn(fixture("current-plmn")).id).toBe("yas");
    expect(parseCurrentPlmn(named("ORANGE MG")).id).toBe("orange");
  });

  it("keeps the original spelling beside the resolved carrier", () => {
    const parsed = parseCurrentPlmn(named("ORANGE MG"));
    expect(parsed.carrier).toBe("ORANGE MG");
    expect(parsed.id).toBe("orange");
  });

  it("retains an unrecognised name for display and calls it unknown", () => {
    const parsed = parseCurrentPlmn(named("Telma"));
    expect(parsed.carrier).toBe("Telma");
    expect(parsed.id).toBe("unknown");
  });

  it("calls an empty name unknown rather than guessing at yas", () => {
    const empty = fixture("current-plmn").replace(
      "<FullName>Yas</FullName>",
      "<FullName></FullName>",
    );
    expect(parseCurrentPlmn(empty).id).toBe("unknown");
  });

  it("reads a reply with no <FullName> as unknown without throwing", () => {
    const absent = fixture("current-plmn").replace(
      "<FullName>Yas</FullName>\n",
      "",
    );
    expect(() => parseCurrentPlmn(absent)).not.toThrow();
    expect(parseCurrentPlmn(absent).carrier).toBe("");
    expect(parseCurrentPlmn(absent).id).toBe("unknown");
  });
});

describe("parseStartDate", () => {
  const parsed = parseStartDate(fixture("start_date"));

  it("reads the billing cycle start day", () => {
    expect(parsed.startDay).toBe(1);
    expect(typeof parsed.startDay).toBe("number");
  });

  it("reads the router-held data limit of 0MB as zero bytes", () => {
    expect(parsed.routerDataLimitBytes).toBe(0);
    expect(typeof parsed.routerDataLimitBytes).toBe("number");
  });

  it("converts a non-zero data limit to bytes", () => {
    const withLimit = fixture("start_date").replace(
      "<DataLimit>0MB</DataLimit>",
      "<DataLimit>50GB</DataLimit>",
    );
    expect(parseStartDate(withLimit).routerDataLimitBytes).toBe(50_000_000_000);
  });

  it("reads the warn threshold percentage", () => {
    expect(parsed.warnThresholdPercent).toBe(90);
  });
});

describe("parseSesTokInfo", () => {
  it("reads the session cookie and verification token", () => {
    const parsed = parseSesTokInfo(fixture("ses-tok-info"));
    expect(parsed.sessionId).toMatch(/^SessionID=/);
    expect(parsed.token).toBe("CY8/MvG3W0kNqZpLdRyTbAe1");
  });
});

describe("stale session replies", () => {
  it("throws an API error carrying code 125002, not a parse error", () => {
    expect(() => parseStatus(staleSession)).toThrow(HilinkApiError);
    expect(() => parseStatus(staleSession)).not.toThrow(HilinkParseError);
  });

  it("flags the error as a stale session on every endpoint", () => {
    for (const parse of [
      parseMonthStatistics,
      parseTrafficStatistics,
      parseStatus,
      parseCurrentPlmn,
      parseStartDate,
    ]) {
      let caught: unknown;
      try {
        parse(staleSession);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(HilinkApiError);
      expect((caught as HilinkApiError).code).toBe(125002);
      expect(isStaleSessionError(caught)).toBe(true);
    }
  });

  it("does not flag another API error code as a stale session", () => {
    const otherError = staleSession.replace("125002", "100002");
    let caught: unknown;
    try {
      parseStatus(otherError);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HilinkApiError);
    expect((caught as HilinkApiError).code).toBe(100002);
    expect(isStaleSessionError(caught)).toBe(false);
  });

  it("does not flag a parse failure as a stale session", () => {
    let caught: unknown;
    try {
      parseStatus(malformed);
    } catch (error) {
      caught = error;
    }
    expect(isStaleSessionError(caught)).toBe(false);
  });
});

describe("malformed replies", () => {
  it("raises a parse error naming the endpoint", () => {
    let caught: unknown;
    try {
      parseMonthStatistics(malformed);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HilinkParseError);
    expect((caught as HilinkParseError).endpoint).toBe(
      "/api/monitoring/month_statistics",
    );
    expect((caught as HilinkParseError).message).toContain(
      "/api/monitoring/month_statistics",
    );
  });

  it("names its own endpoint on each parser", () => {
    const endpoints: Array<[(xml: string) => unknown, string]> = [
      [parseTrafficStatistics, "/api/monitoring/traffic-statistics"],
      [parseStatus, "/api/monitoring/status"],
      [parseCurrentPlmn, "/api/net/current-plmn"],
      [parseStartDate, "/api/monitoring/start_date"],
      [parseSesTokInfo, "/api/webserver/SesTokInfo"],
    ];
    for (const [parse, endpoint] of endpoints) {
      let caught: unknown;
      try {
        parse(malformed);
      } catch (error) {
        caught = error;
      }
      expect(caught).toBeInstanceOf(HilinkParseError);
      expect((caught as HilinkParseError).endpoint).toBe(endpoint);
    }
  });

  it("never returns an object with undefined fields instead of throwing", () => {
    for (const parse of [parseMonthStatistics, parseStatus, parseStartDate]) {
      let result: unknown;
      let threw = false;
      try {
        result = parse(malformed);
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      expect(result).toBeUndefined();
    }
  });

  it("rejects an empty body", () => {
    expect(() => parseStatus("")).toThrow(HilinkParseError);
  });

  it("rejects a non-numeric value in a numeric field", () => {
    const corrupted = fixture("status").replace(
      "<SignalIcon>5</SignalIcon>",
      "<SignalIcon>full</SignalIcon>",
    );
    expect(() => parseStatus(corrupted)).toThrow(HilinkParseError);
  });
});

describe("parseToken", () => {
  function tokenReply(token: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<token>${token}</token>\n</response>`;
  }

  it("takes the last 32 characters of a long <token>", () => {
    const tail = "Ab3dEf5GhIjKlM7nOpQrSt9UvWxYz1B2";
    expect(parseToken(tokenReply(`prefix1234${tail}`))).toBe(tail);
    expect(parseToken(tokenReply(`prefix1234${tail}`))).toHaveLength(32);
  });

  it("returns a shorter <token> whole", () => {
    expect(parseToken(tokenReply("ShortToken123"))).toBe("ShortToken123");
  });

  it("rejects a reply with no <token>", () => {
    expect(() =>
      parseToken('<?xml version="1.0"?><response>OK</response>'),
    ).toThrow(HilinkParseError);
  });

  it("names /api/webserver/token as the endpoint it failed on", () => {
    let caught: unknown;
    try {
      parseToken(malformed);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(HilinkParseError);
    expect((caught as HilinkParseError).endpoint).toBe("/api/webserver/token");
  });

  it("raises an API error when the router refused instead", () => {
    expect(() => parseToken(staleSession)).toThrow(HilinkApiError);
  });
});
