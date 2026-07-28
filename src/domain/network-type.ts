/**
 * What `CurrentNetworkTypeEx` means, in the words the panel shows.
 *
 * The table lives here rather than in `src/hilink/` on purpose: these are
 * carrier-agnostic constants about radio technology, not a fact about this
 * device's replies. The router boundary's job ends at turning the element into
 * a number — deciding that `101` is worth calling "4G" is a display decision,
 * and it belongs with the rest of the pure code.
 *
 * Codes are grouped by generation rather than named individually. "HSPA+" is a
 * true answer to a question nobody asked; what the header is for is telling a
 * 5-bar LTE link apart from a 5-bar 2G fallback.
 */

/** How an unrecognised code is introduced, so it reads as a code, not a name. */
const UNKNOWN_PREFIX = "Type";

/**
 * The codes this device and its family report. Anything absent falls through to
 * its own number rather than being guessed at — a Huawei firmware may report a
 * value no published table covers, and "3G" asserted about an unknown radio is
 * worse than a number that can be looked up.
 */
const NETWORK_TYPE_LABELS: Record<number, string> = {
  // Attached to nothing. Distinct from an unknown code: this one is known, and
  // what it means is that there is no link at all.
  0: "No service",

  // GSM, GPRS, EDGE.
  1: "2G",
  2: "2G",
  3: "2G",

  // CDMA — IS-95A, IS-95B, CDMA 1x.
  21: "2G",
  22: "2G",
  23: "2G",

  // WCDMA and the HSPA family, including the DC-HSPA+ codes newer firmware uses.
  41: "3G",
  42: "3G",
  43: "3G",
  44: "3G",
  45: "3G",
  46: "3G",
  61: "3G",
  62: "3G",
  63: "3G",
  64: "3G",
  65: "3G",

  // LTE — what this device reports, and what the manual check confirmed.
  101: "4G",
};

/** `"4G"`, `"No service"`, or `"Type 102"` for a code no table covers. */
export function networkTypeLabel(code: number): string {
  return NETWORK_TYPE_LABELS[code] ?? `${UNKNOWN_PREFIX} ${String(code)}`;
}
