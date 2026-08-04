/**
 * Which network the SIM is on, as one named value rather than a string
 * comparison repeated at each call site.
 *
 * The SIM moved from YAS to Orange MG on 2026-08-04 and everything downstream
 * branches on the answer — the exact allowance comes from a USSD dialogue on
 * YAS and from a web page on Orange — so the branch deserves a name.
 *
 * Matching is trimmed and case-insensitive. `/api/net/current-plmn` reports
 * `FullName` as `ORANGE MG` and `ShortName` as `Orange MG` for the same
 * network, so neither spelling is treated as stable.
 */

/**
 * The networks the app knows where the allowance lives for, plus the honest
 * answer for every other name.
 *
 * `unknown` is a result, not a fallback to YAS: it means the app knows the
 * router but not where the carrier's own figure is kept, which is a state to
 * render — the same bargain `network-type.js` strikes with an unmapped code.
 */
export type Carrier = "orange" | "yas" | "unknown";

/** Every spelling seen on the wire, keyed by its trimmed lower-case form. */
const CARRIERS: Record<string, Carrier> = {
  "orange mg": "orange",
  yas: "yas",
};

/**
 * `"orange"`, `"yas"`, or `"unknown"` for a name no table covers — including
 * an empty `FullName`, and a reply that carried no `FullName` at all.
 */
export function carrierFrom(fullName: string | undefined): Carrier {
  return CARRIERS[(fullName ?? "").trim().toLowerCase()] ?? "unknown";
}
