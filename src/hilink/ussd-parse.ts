/**
 * The USSD boundary. The carrier answers `#359#` in prose, so this turns each
 * reply into typed data the way the XML parsers already do — same envelope
 * scanner, same errors, same decimal unit scale, no second private constant.
 */

import { HilinkApiError, readReply, requireText, UNIT_BYTES } from "./parse.js";
import type { Allowance, UssdOption, UssdReply } from "./types.js";

const USSD_GET_ENDPOINT = "/api/ussd/get";

/** The router's code for "the carrier has not replied yet" — poll again. */
export const USSD_NOT_READY_CODE = 111019;

/** What a `/api/ussd/get` body is, before any content is read out of it. */
export type UssdErrorResult =
  | { kind: "ready" }
  | { kind: "not-ready"; code: number }
  | { kind: "error"; code: number };

/** French octet units onto the decimal scale the XML parsers already use. */
const OCTET_UNITS: Record<string, string> = {
  KO: "KB",
  MO: "MB",
  GO: "GB",
  TO: "TB",
};

/** A menu line: a digit group, a separator, then the label — `00 Page precedente`. */
const OPTION_LINE = /^(\d{1,3})[.):\-\s]\s*(\S.*)$/;

/** Accents are absent from the device's replies, so none are matched. */
const REMAINING = /il\s+vous\s+reste\s+(\d+(?:[.,]\d+)?)\s*([KMGT]o)\b/i;
const EXPIRY = /jusqu'?\s*au\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i;

function readOptions(text: string): UssdOption[] {
  const options: UssdOption[] = [];
  for (const line of text.split("\n")) {
    const match = OPTION_LINE.exec(line.trim());
    if (match === null) {
      continue;
    }
    const [, digit = "", label = ""] = match;
    if (digit !== "" && label.trim() !== "") {
      options.push({ digit, label: label.trim() });
    }
  }
  return options;
}

/** The offer name the carrier states just before the clause, e.g. `NET MONTH 200 000`. */
function readPlanLabel(text: string, clauseIndex: number): string {
  const before = text.slice(0, clauseIndex);
  const lineStart = before.lastIndexOf("\n") + 1;
  return before
    .slice(lineStart)
    .replace(/[\s,;:.-]+$/, "")
    .trim();
}

/**
 * The instant the plan stops being valid, from a `jusqu'au JJ/MM/AAAA` clause.
 *
 * The carrier means the plan runs *through* the day it names — its own
 * arithmetic proves it, since a 30-day plan bought on 27/07 reaches 25/08 only
 * when that last day is counted. So the instant returned is the midnight that
 * *ends* the stated day, which is the midnight that opens the next one. Reading
 * it as the midnight that opens the stated day would drop a day from every
 * consumer at once: the period would start a day early, a day would go missing
 * from the count remaining, and the plan would be declared dead while the
 * carrier was still serving it.
 *
 * Passing `day + 1` to `Date` rather than adding a day's milliseconds keeps the
 * rollover the platform's job — month ends, leap days and year ends all
 * included — and stays at local midnight across any daylight-saving shift.
 */
function readExpiry(text: string): Date | null {
  const match = EXPIRY.exec(text);
  if (match === null) {
    return null;
  }
  const [, day = "", month = "", year = ""] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day) + 1);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Read a `<response><content>…</content></response>` reply into text and menu options. */
export function parseUssdContent(xml: string): UssdReply {
  const fields = readReply(xml, USSD_GET_ENDPOINT);
  const text = requireText(fields, "content", USSD_GET_ENDPOINT);
  return { text, options: readOptions(text) };
}

/**
 * The final `#359#` line — an exact remaining volume and its expiry. Null, never
 * an exception, for every reply that does not state one.
 */
export function parseAllowance(reply: UssdReply): Allowance | null {
  const match = REMAINING.exec(reply.text);
  if (match === null) {
    return null;
  }
  const [, amount = "", unit = ""] = match;
  const scale = UNIT_BYTES[OCTET_UNITS[unit.toUpperCase()] ?? ""];
  if (scale === undefined) {
    return null;
  }
  const remainingBytes = Math.round(Number(amount.replace(",", ".")) * scale);
  if (!Number.isFinite(remainingBytes)) {
    return null;
  }
  return {
    planLabel: readPlanLabel(reply.text, match.index),
    remainingBytes,
    expiresAt: readExpiry(reply.text),
  };
}

/**
 * Classify a `/api/ussd/get` body without reading it: the carrier's reply is
 * pending (`111019`), some other router error, or ready to be parsed. A
 * malformed body raises the same parse error every other parser raises.
 */
export function parseUssdError(xml: string): UssdErrorResult {
  try {
    readReply(xml, USSD_GET_ENDPOINT);
  } catch (error) {
    if (error instanceof HilinkApiError) {
      return error.code === USSD_NOT_READY_CODE
        ? { kind: "not-ready", code: USSD_NOT_READY_CODE }
        : { kind: "error", code: error.code };
    }
    throw error;
  }
  return { kind: "ready" };
}
