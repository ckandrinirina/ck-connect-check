/**
 * The LAN-device boundary. `GET /api/wlan/host-list` is the only device source
 * this firmware offers — T-62 probed `/api/lan/HostInfo`, `/api/lan/hostinfo`
 * and `/api/wlan/station-information` and all three answer `100002` even on an
 * authenticated session. It also needs a session: without one the router
 * answers `100003`, so devices cannot ride the ordinary unauthenticated poll.
 *
 * This layer turns the reply into a typed `Device[]` and nothing more. Naming
 * rules, ordering and blocked state belong to `../domain/` and the view.
 */

import { readBlocks, requireNumber, requireText } from "./parse.js";

/**
 * One host the router reports.
 *
 * The fields are exactly what `host-list` sends. There is deliberately no
 * connection medium, band or active flag: the capture carries no such element,
 * and `test/hilink/device-fixtures.test.ts` asserts their absence. Inventing
 * them here would put a value in the UI that no router ever stated.
 */
export interface Device {
  /**
   * The identity. Upper-cased on the way in so a router that varies its
   * spelling cannot present one device twice — a name may be absent or
   * duplicated, and an IP is a lease that moves, so nothing else can key on.
   */
  mac: string;
  ip: string;
  /** `HostName` as sent. Empty when the router named the host nothing. */
  name: string;
  /**
   * `AssociatedSsid`, kept verbatim. Not a band: all four SSIDs share one name
   * on this device, so it cannot say which radio a host is on.
   */
  ssid: string;
  associatedSeconds: number;
}

export const HOST_LIST_ENDPOINT = "/api/wlan/host-list";

/**
 * Parse a `host-list` reply into one device per host.
 *
 * An empty list is an empty array, not a failure — nothing being connected is a
 * state to render. Two entries sharing a MAC collapse to one, the later
 * winning, because that is the router's freshest word on that device.
 *
 * @throws {HilinkApiError} the router refused the request, e.g. `100003`
 *   without a session.
 * @throws {HilinkParseError} the reply was unreadable, or a host was missing a
 *   field it cannot do without.
 */
export function parseHostList(xml: string): Device[] {
  const byMac = new Map<string, Device>();

  for (const fields of readBlocks(xml, HOST_LIST_ENDPOINT, "Host")) {
    const mac = requireText(fields, "MacAddress", HOST_LIST_ENDPOINT);
    const device: Device = {
      mac: mac.toUpperCase(),
      ip: requireText(fields, "IpAddress", HOST_LIST_ENDPOINT),
      name: fields.get("HostName") ?? "",
      ssid: fields.get("AssociatedSsid") ?? "",
      associatedSeconds: requireNumber(
        fields,
        "AssociatedTime",
        HOST_LIST_ENDPOINT,
      ),
    };
    byMac.set(device.mac, device);
  }

  return [...byMac.values()];
}
