/**
 * The devices window's renderer. Like the panel's, it does one thing: put the
 * strings it is handed into the DOM. There is no arithmetic here, no knowledge
 * of the router, and no ordering — the model arrives already spelled and
 * already sorted.
 *
 * Rows are keyed by MAC, so a poll landing every 30 seconds updates the row a
 * device already has instead of building the table again. The MAC is the only
 * field that can key on: a name may be absent or duplicated and an IP is a
 * lease that moves.
 *
 * The main process pushes updates by calling {@link Window.applyDevicesModel}.
 */

import type { DeviceRow, DevicesModel } from "../main/devices-window.js";

declare global {
  interface Window {
    /** The one entry point the main process calls. */
    applyDevicesModel(model: DevicesModel): void;
  }
}

/** The cells of one row, in the order `devices.html` declares its columns. */
function cellsOf(device: DeviceRow): string[] {
  return [
    device.name,
    device.ip,
    device.mac,
    device.network,
    device.connectedFor,
  ];
}

/** The row elements already on the page, by the MAC each one belongs to. */
let rowsByMac = new Map<string, HTMLTableRowElement>();

/**
 * Brings one row up to date, creating its cells the first time.
 *
 * `textContent`, never `innerHTML`: a device names itself, and its name is the
 * one string on this page that the user did not write.
 */
function fill(row: HTMLTableRowElement, device: DeviceRow): void {
  const values = cellsOf(device);

  while (row.cells.length < values.length) {
    row.append(document.createElement("td"));
  }

  values.forEach((value, index) => {
    const cell = row.cells[index];

    if (cell !== undefined && cell.textContent !== value) {
      cell.textContent = value;
    }
  });
}

/**
 * Writes the list into the table body, reusing the row each device already
 * has. A device that left takes exactly its own row with it, and one that
 * arrived lands in the position the model gives it without the rows around it
 * being replaced.
 */
function renderRows(devices: readonly DeviceRow[]): void {
  const body = document.querySelector("[data-devices]");

  if (body === null) {
    return;
  }

  const next = new Map<string, HTMLTableRowElement>();
  const ordered = devices.map((device) => {
    const row = rowsByMac.get(device.mac) ?? document.createElement("tr");

    fill(row, device);
    next.set(device.mac, row);

    return row;
  });

  rowsByMac = next;
  body.replaceChildren(...ordered);
}

/** Shows or hides one of the page's fixed regions. */
function show(selector: string, visible: boolean): void {
  const element = document.querySelector<HTMLElement>(selector);

  if (element !== null) {
    element.hidden = !visible;
  }
}

/**
 * Puts a pushed model on screen.
 *
 * Three states, and the point of the middle one is that it is not the last: a
 * router that is not answering has not said that nothing is connected to it, so
 * "no devices" is only ever printed when the router itself said so.
 */
export function renderDevices(model: DevicesModel): void {
  if (model.state === "listed") {
    renderRows(model.devices);
  }

  const state =
    model.state === "offline"
      ? "offline"
      : model.devices.length === 0
        ? "empty"
        : "listed";

  // Deliberately not `data-devices`, which is the table body's own marker: the
  // page would then have two elements answering to the selector that finds the
  // rows, and the first one is the document itself.
  document.documentElement.dataset["devicesState"] = state;
  show("[data-devices-table]", state === "listed");
  show("[data-devices-empty]", state === "empty");
  show("[data-devices-offline]", state === "offline");
}

window.applyDevicesModel = renderDevices;

// Nothing has been pushed yet, so nothing is known: the page waits for the
// router rather than claiming an empty household.
renderDevices({ state: "offline" });
