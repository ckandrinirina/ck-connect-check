/**
 * How the connected devices read. Pure — no Electron, no network — for the same
 * reason the network-type table beside it is: these are presentation rules over
 * plain data, not part of the router boundary's job.
 *
 * The blocked verdict lives here too, and it is a rule rather than a lookup: a
 * blacklist containing a MAC blocks it, a whitelist containing the same MAC
 * allows it and blocks everything else, and a filter that is off blocks nothing
 * whatever it remembers. Only the mode and the list together answer "is this
 * device blocked?", so no caller is ever handed the list to test on its own.
 *
 * The medium label this module was planned around is deliberately absent. T-62
 * established that `host-list` carries no band, frequency or connection-medium
 * element, and `AssociatedSsid` cannot stand in for one because all four SSIDs
 * share a name on this device. A table here would map nothing and have no
 * caller, so there is none — see T-64's Notes in `tasks/PLAN.md`.
 */

import type { Device } from "../hilink/devices.js";
import type { MacFilter } from "../hilink/macfilter.js";

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

/**
 * One MAC address reduced to what identifies it, so two spellings of the same
 * device cannot read as two devices.
 *
 * The router is not consistent with itself: the host list sends
 * `A2:00:5E:00:00:01` and a filter slot may hold the same address hyphenated or
 * in lower case, and a membership test on the raw strings would then answer
 * "not blocked" for a device that plainly is. Only the separators and the case
 * are dropped — nothing else about the string is interpreted.
 */
export function normaliseMac(mac: string): string {
  return mac.replace(/[\s:.-]/g, "").toUpperCase();
}

/**
 * Whether the router is refusing this address, read from the mode and the list
 * **together**.
 *
 * Membership alone cannot answer it. A blacklist containing a MAC blocks it; a
 * whitelist containing the same MAC allows it and blocks everything else; and
 * with the filter off the list still exists and governs nothing. Those are three
 * different answers to one question about the same list, which is why this is a
 * predicate over the filter rather than a lookup in it.
 */
export function isDeviceBlocked(filter: MacFilter, mac: string): boolean {
  if (filter.mode === "off") {
    return false;
  }

  const wanted = normaliseMac(mac);
  const listed = filter.entries.some(
    (entry) => normaliseMac(entry.mac) === wanted,
  );

  return filter.mode === "blacklist" ? listed : !listed;
}

/** A device as the window states it: what it is, and how it stands. */
export interface ListedDevice {
  device: Device;
  blocked: boolean;
  /** Whether the router reports it as associated right now. */
  present: boolean;
}

/** A filtered address the router says nothing else about, as a device. */
function absentDevice(mac: string, name: string): Device {
  return {
    // Upper-cased, exactly as `parseHostList` upper-cases the MAC it reads, so
    // one device cannot present itself twice through two spellings.
    mac: mac.toUpperCase(),
    // Nothing is claimed that the router did not state. It is not connected, so
    // it has no lease, no SSID and no association time.
    ip: "",
    name,
    ssid: "",
    associatedSeconds: 0,
  };
}

/**
 * Every device the window has to show for one reading of the host list and one
 * reading of the filter, in the list's stable order.
 *
 * The two sources do not cover the same devices. A blocked device stops
 * associating and drops out of the host list, so an address the filter blocks
 * and the router no longer reports is added here as an absent device — without
 * a row it could only be unblocked by connecting first, which is the one thing
 * a blocked device cannot do.
 *
 * A filtered address that does **not** read as blocked adds no row: with the
 * filter off, or under a whitelist, its entries name devices that are merely
 * remembered or merely permitted, and a ghost row for one of those answers no
 * question the window was asked.
 */
export function listDevices(
  devices: readonly Device[],
  filter: MacFilter,
): ListedDevice[] {
  const present = new Set(devices.map((device) => normaliseMac(device.mac)));
  const listed: ListedDevice[] = devices.map((device) => ({
    device,
    blocked: isDeviceBlocked(filter, device.mac),
    present: true,
  }));

  for (const entry of filter.entries) {
    if (present.has(normaliseMac(entry.mac))) {
      continue;
    }
    if (!isDeviceBlocked(filter, entry.mac)) {
      continue;
    }

    listed.push({
      device: absentDevice(entry.mac, entry.name),
      blocked: true,
      present: false,
    });
  }

  return listed.sort((first, second) =>
    compareDevices(first.device, second.device),
  );
}
