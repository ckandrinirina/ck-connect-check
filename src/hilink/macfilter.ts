/**
 * The WLAN MAC-filter boundary. `GET /api/wlan/multi-macfilter-settings` is
 * where the router states what it is already refusing, and T-62 captured the
 * reply: four `<Ssid>` blocks, each with a status and ten MAC slots. Like every
 * other reply, it needs the stored password — an unauthenticated read answers
 * `100003`.
 *
 * This layer converts and nothing more. The router's status *number* becomes a
 * named mode here, because a bare `2` crossing into the app would be a wire
 * value that every caller would have to re-interpret; whether a given device is
 * blocked is a question about the mode and the list together, and that belongs
 * to `../domain/`.
 *
 * Two shapes come out of one reply, because two callers need different things:
 * a collapsed {@link MacFilter.mode} and {@link MacFilter.entries} for reading,
 * and {@link MacFilter.ssids} kept intact for the write T-68 adds — the router
 * replaces the whole filter with what it is sent, so a write that omits three
 * SSIDs silently clears them.
 */

import { readBlocks, requireNumber, HilinkParseError } from "./parse.js";

export const MAC_FILTER_ENDPOINT = "/api/wlan/multi-macfilter-settings";

/** How many MAC slots each SSID block carries. The firmware's cap, not ours. */
const SLOTS_PER_SSID = 10;

/**
 * What the filter is doing with its list.
 *
 * A blacklist blocks the addresses it names; a whitelist blocks everything it
 * does *not* name, so the same list means opposite things under the two. `off`
 * is the state the router ships in and the one every fresh install meets: the
 * list is still remembered, and it governs nothing.
 */
export type MacFilterMode = "off" | "whitelist" | "blacklist";

/**
 * `WifiMacFilterStatus`, as the device spells it. The web UI offers the same
 * three choices — disabled, allow-listed-only, deny-listed — in this order.
 */
const MODES: Record<number, MacFilterMode> = {
  0: "off",
  1: "whitelist",
  2: "blacklist",
};

/**
 * One address the filter holds, with the name the router stored beside it.
 *
 * The name matters because a filtered device need not be connected: when the
 * host list has nothing to say about an address, this is the only word anyone
 * has for it.
 */
export interface MacFilterEntry {
  /** Upper-cased on the way in, exactly as the host list's MAC is. */
  mac: string;
  /** `wifihostnameN` as sent. Empty when the router stored no name. */
  name: string;
}

/** One SSID's own block, kept whole so a write can carry all four back. */
export interface MacFilterSsid {
  index: number;
  mode: MacFilterMode;
  entries: MacFilterEntry[];
}

/** The filter as one answer, plus the per-SSID blocks it was collapsed from. */
export interface MacFilter {
  /**
   * The filter's mode for the app's purposes. `off` only when every SSID is
   * off; otherwise the mode of the first SSID that is not, since the app writes
   * all four alike and a hand-configured device with mixed modes is still
   * filtering something.
   */
  mode: MacFilterMode;
  /** Every address any SSID holds, in reading order, each listed once. */
  entries: MacFilterEntry[];
  ssids: MacFilterSsid[];
}

/**
 * The filter before one has ever been read. It is off and holds nothing, which
 * is both the router's state at rest and the only honest assumption to render
 * under: a device is never shown as blocked on the strength of a guess.
 */
export const MAC_FILTER_OFF: MacFilter = {
  mode: "off",
  entries: [],
  ssids: [],
};

function modeOf(fields: Map<string, string>): MacFilterMode {
  const status = requireNumber(
    fields,
    "WifiMacFilterStatus",
    MAC_FILTER_ENDPOINT,
  );
  const mode = MODES[status];

  if (mode === undefined) {
    throw new HilinkParseError(
      MAC_FILTER_ENDPOINT,
      `<WifiMacFilterStatus> is not a filter mode: "${status}"`,
    );
  }

  return mode;
}

/**
 * The filled slots of one block.
 *
 * The casing split is the router's own and not a typo: `WifiMacFilterMacN` is
 * capitalised, `wifihostnameN` is not. An empty slot is skipped rather than
 * becoming a blank address — the firmware always sends all ten.
 */
function entriesOf(fields: Map<string, string>): MacFilterEntry[] {
  const entries: MacFilterEntry[] = [];

  for (let slot = 0; slot < SLOTS_PER_SSID; slot += 1) {
    const mac = fields.get(`WifiMacFilterMac${slot}`) ?? "";

    if (mac.trim() !== "") {
      entries.push({
        mac: mac.trim().toUpperCase(),
        name: fields.get(`wifihostname${slot}`) ?? "",
      });
    }
  }

  return entries;
}

/**
 * Parse a `multi-macfilter-settings` reply into the filter it describes.
 *
 * A reply with no SSID block at all is an off filter holding nothing, not a
 * failure: the app must be able to render "nothing is blocked" from a router
 * that says so in the fewest possible words.
 *
 * @throws {HilinkApiError} the router refused the request, e.g. `100003`
 *   without a session.
 * @throws {HilinkParseError} the reply was unreadable, or a block carried a
 *   status this firmware has not been seen to send.
 */
export function parseMacFilter(xml: string): MacFilter {
  const ssids = readBlocks(xml, MAC_FILTER_ENDPOINT, "Ssid").map(
    (fields): MacFilterSsid => ({
      index: requireNumber(fields, "Index", MAC_FILTER_ENDPOINT),
      mode: modeOf(fields),
      entries: entriesOf(fields),
    }),
  );

  const byMac = new Map<string, MacFilterEntry>();

  for (const ssid of ssids) {
    for (const entry of ssid.entries) {
      if (!byMac.has(entry.mac)) {
        byMac.set(entry.mac, entry);
      }
    }
  }

  return {
    mode: ssids.find((ssid) => ssid.mode !== "off")?.mode ?? "off",
    entries: [...byMac.values()],
    ssids,
  };
}
