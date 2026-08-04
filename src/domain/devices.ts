/**
 * How the connected devices read. Pure — no Electron, no network — for the same
 * reason the network-type table beside it is: these are presentation rules over
 * plain data, not part of the router boundary's job.
 *
 * The medium label this module was planned around is deliberately absent. T-62
 * established that `host-list` carries no band, frequency or connection-medium
 * element, and `AssociatedSsid` cannot stand in for one because all four SSIDs
 * share a name on this device. A table here would map nothing and have no
 * caller, so there is none — see T-64's Notes in `tasks/PLAN.md`.
 */

import type { Device } from "../hilink/devices.js";

import { formatDuration } from "./format.js";

/**
 * What to call a device on screen.
 *
 * The router reports an empty `HostName` for plenty of hosts, and the fallback
 * is the MAC rather than a word like "Unknown": a shared placeholder makes every
 * nameless device look like the same one, which is exactly the question the list
 * exists to answer.
 */
export function deviceDisplayName(device: Device): string {
  const name = device.name.trim();
  return name === "" ? device.mac : name;
}

/** How long the device has been associated, in the app's shared duration format. */
export function deviceAssociatedFor(device: Device): string {
  return formatDuration(device.associatedSeconds);
}

/**
 * Order two devices for the list: by the name shown, then by MAC.
 *
 * The comparison is over raw code units rather than `localeCompare`, and the
 * MAC — which T-63 guarantees is unique and upper-cased — is the final
 * tiebreaker. Both matter because the panel refreshes on a timer: an order that
 * shifted with an ICU build, or that left two same-named devices free to swap,
 * would reshuffle the list under the user's click.
 *
 * There is no active-before-inactive rule, because there is no inactive set:
 * `host-list` reports only the hosts currently associated.
 */
export function compareDevices(first: Device, second: Device): number {
  const a = deviceDisplayName(first).toLowerCase();
  const b = deviceDisplayName(second).toLowerCase();

  if (a !== b) {
    return a < b ? -1 : 1;
  }
  if (first.mac === second.mac) {
    return 0;
  }
  return first.mac < second.mac ? -1 : 1;
}

/** The devices in display order. The caller's array is left as it was. */
export function sortDevices(devices: readonly Device[]): Device[] {
  return [...devices].sort(compareDevices);
}
