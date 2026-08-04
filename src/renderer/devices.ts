/**
 * The devices window's renderer. Like the panel's, it does one thing: put the
 * strings it is handed into the DOM. There is no arithmetic here and no
 * knowledge of the router.
 *
 * The page ships the table and its column headers; this fills the body. The
 * shell renders an empty list on load, through the same path a full one will
 * take, so the window is never a table that only exists once data arrives.
 */

/** One line of the table, already spelled the way it appears on screen. */
export interface DeviceRow {
  name: string;
  ipAddress: string;
  macAddress: string;
}

/** The cells of one row, in the order `devices.html` declares its columns. */
function cellsOf(device: DeviceRow): string[] {
  return [device.name, device.ipAddress, device.macAddress];
}

function rowFor(device: DeviceRow): HTMLTableRowElement {
  const row = document.createElement("tr");

  for (const value of cellsOf(device)) {
    const cell = document.createElement("td");
    // `textContent`, never `innerHTML`: a device names itself, and a name is
    // the one string on this page that the user did not write.
    cell.textContent = value;
    row.append(cell);
  }

  return row;
}

/**
 * Replaces every row with the list given. An empty list leaves an empty body
 * rather than a placeholder row — the table says how many devices there are by
 * showing exactly that many.
 */
export function renderDevices(devices: readonly DeviceRow[]): void {
  const body = document.querySelector("[data-devices]");

  if (body === null) {
    return;
  }

  body.replaceChildren(...devices.map(rowFor));
}

// Nothing has been pushed yet, so the list starts empty. T-66 gives it a source.
renderDevices([]);
