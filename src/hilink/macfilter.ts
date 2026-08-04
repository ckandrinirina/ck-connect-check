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

/**
 * How many MAC slots each SSID block carries. The firmware's cap, not ours.
 *
 * T-62 corrected the architecture's guess of 32 against the device: the reply
 * carries `WifiMacFilterMac0..9` and nothing beyond it. A household that fills
 * it has done nothing wrong, so reaching it is a state to state rather than a
 * write to attempt and watch fail.
 */
export const MAC_FILTER_CAP = 10;

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
 *
 * **`1`→whitelist and `2`→blacklist are inferred, never observed.** The only
 * reply anyone has captured is `test/fixtures/hilink/macfilter.xml`, which is
 * `0` on all four SSIDs, so nothing in this repository proves which integer the
 * firmware means by which mode. A live check was attempted and did not settle
 * it.
 *
 * This table is the single place either direction is decided — {@link modeOf}
 * reads through it and {@link macFilterStatus} writes through it — so the day a
 * populated reply is captured, correcting one line here corrects the reader and
 * the writer together. Getting it wrong is not a cosmetic error: writing `2`
 * while the device means whitelist would tell the router "allow only this one
 * address", cutting off every other device including the Mac this app runs on,
 * over the very connection the undo would have to travel.
 */
const MODES: Record<number, MacFilterMode> = {
  0: "off",
  1: "whitelist",
  2: "blacklist",
};

/**
 * The number to send for a mode — {@link MODES} read the other way round.
 *
 * Derived from the same table rather than written out again, so a writer and a
 * reader that disagree is not a state this file can be in.
 */
export function macFilterStatus(mode: MacFilterMode): number {
  const status = Object.entries(MODES).find(([, named]) => named === mode)?.[0];

  if (status === undefined) {
    throw new HilinkParseError(
      MAC_FILTER_ENDPOINT,
      `no <WifiMacFilterStatus> is known for the mode "${mode}"`,
    );
  }

  return Number(status);
}

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

  for (let slot = 0; slot < MAC_FILTER_CAP; slot += 1) {
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
  return collapseMacFilter(
    readBlocks(xml, MAC_FILTER_ENDPOINT, "Ssid").map(
      (fields): MacFilterSsid => ({
        index: requireNumber(fields, "Index", MAC_FILTER_ENDPOINT),
        mode: modeOf(fields),
        entries: entriesOf(fields),
      }),
    ),
  );
}

/**
 * The one answer four blocks add up to, beside the blocks themselves.
 *
 * Exported because a changed filter has to be collapsed the same way a read one
 * is: the window renders from {@link MacFilter.mode} and
 * {@link MacFilter.entries}, and a composed write whose summary disagreed with
 * its own blocks would draw a row that the next poll contradicts.
 */
export function collapseMacFilter(ssids: MacFilterSsid[]): MacFilter {
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

/**
 * The `POST` body that replaces the whole filter with the one given.
 *
 * Every block the filter was read with is carried back, because the router
 * replaces what it is sent: a body naming one SSID silently clears the other
 * three, which would unblock everyone the app was not asked about. All ten slots
 * go out too, filled or not, so the reply's own shape is reproduced rather than
 * a shorter one the firmware has never been seen to accept.
 *
 * The casing split is the device's and not a typo: `WifiMacFilterMacN` is
 * capitalised and `wifihostnameN` is not.
 */
export function macFilterRequestXml(filter: MacFilter): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<request>",
    "<Ssids>",
    ...filter.ssids.map((ssid) => ssidRequestXml(ssid)),
    "</Ssids>",
    "</request>",
  ].join("");
}

function ssidRequestXml(ssid: MacFilterSsid): string {
  const slots: string[] = [];

  for (let slot = 0; slot < MAC_FILTER_CAP; slot += 1) {
    const entry = ssid.entries[slot];

    slots.push(
      `<WifiMacFilterMac${slot}>${escapeXml(entry?.mac ?? "")}</WifiMacFilterMac${slot}>`,
      `<wifihostname${slot}>${escapeXml(entry?.name ?? "")}</wifihostname${slot}>`,
    );
  }

  return [
    "<Ssid>",
    `<Index>${String(ssid.index)}</Index>`,
    `<WifiMacFilterStatus>${String(macFilterStatus(ssid.mode))}</WifiMacFilterStatus>`,
    ...slots,
    "</Ssid>",
  ].join("");
}

/**
 * The five characters XML cannot carry raw.
 *
 * A stored host name is the one string in this body the app did not write — the
 * device named itself — so it is escaped rather than trusted to be tame.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
