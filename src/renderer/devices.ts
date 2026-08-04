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
    /**
     * The one way back, from `preload.cts`. Optional because the page has to
     * render without it — under Vitest, and in the instant before the bridge
     * lands — and a missing bridge must cost a press, never an exception.
     */
    devicesBridge?: {
      setBlocked(request: { mac: string; blocked: boolean }): void;
    };
  }
}

/**
 * What the last column says about a device's access.
 *
 * A word, not a colour and not a dot. The window ships unstyled, so a tint
 * would say nothing at all here — and once it is styled it would still say
 * nothing to a colour-blind reader or in a greyscale screenshot, which is the
 * rule the pace meter already follows.
 */
const ACCESS_BLOCKED = "Blocked";
const ACCESS_ALLOWED = "Allowed";

/**
 * What the duration column says about a device the router is not reporting.
 *
 * A blocked device stops associating, so it is in the list on the filter's word
 * alone — and it is listed precisely so it can be unblocked without having to
 * connect first, which is the one thing it cannot do.
 */
const NOT_CONNECTED = "Not connected";

/** The cells of one row, in the order `devices.html` declares its columns. */
function cellsOf(device: DeviceRow): string[] {
  return [
    device.name,
    device.ip,
    device.mac,
    device.network,
    device.present ? device.connectedFor : NOT_CONNECTED,
    device.blocked ? ACCESS_BLOCKED : ACCESS_ALLOWED,
  ];
}

/** What the control offers to do, which is always the opposite of the state. */
const BLOCK_ACTION = "Block";
const UNBLOCK_ACTION = "Unblock";

/**
 * What the user is asked before anything is sent.
 *
 * The device is named, and its MAC given beside the name: two devices can share
 * a name, and the address is what the write actually acts on — so a
 * confirmation that only said "Block MacBookPro?" could be agreed to for the
 * wrong row.
 */
function confirmationFor(device: DeviceRow, blocked: boolean): string {
  const named = `${device.name} (${device.mac})`;

  return blocked
    ? `Block ${named} from the router's Wi-Fi?`
    : `Allow ${named} back onto the router's Wi-Fi?`;
}

/**
 * Asks, and sends only if the answer was yes.
 *
 * Nothing on the row is repainted here. What the router ends up refusing is
 * settled by the write and the re-read behind it, and a row that showed the
 * block straight away would be stating something that may well have been
 * refused — the next pushed model is the only thing that moves it.
 */
function press(device: DeviceRow, blocked: boolean): void {
  if (!window.confirm(confirmationFor(device, blocked))) {
    return;
  }

  window.devicesBridge?.setBlocked({ mac: device.mac, blocked });
}

/**
 * What stands where this machine's own control would have been.
 *
 * A sentence rather than a greyed-out button. Blocking the Mac the app runs on
 * severs the connection the undo would have to travel over, and nothing in here
 * could put it back — recovery means the router's own web UI from another
 * device, or a factory reset. So the control is absent rather than disabled: a
 * disabled control is one attribute away from being pressed, and an empty cell
 * would leave the omission to be guessed at.
 */
const LOCAL_REASON = "This Mac — blocking it would cut off the app";

/**
 * The control in a row's last cell, created once and re-aimed thereafter —
 * except on this machine's own row, which is given {@link LOCAL_REASON} instead
 * and no control at all.
 *
 * The handler is assigned rather than added, because rows are kept between
 * polls: a listener added on every render would fire once per poll the row had
 * survived, turning one press into a handful of writes.
 */
function fillAction(cell: HTMLTableCellElement, device: DeviceRow): void {
  if (device.local) {
    fillLocalReason(cell);

    return;
  }

  const existing = cell.querySelector<HTMLButtonElement>("[data-block]");
  const control = existing ?? document.createElement("button");

  if (existing === null) {
    control.type = "button";
    control.dataset["block"] = "";
    cell.replaceChildren(control);
  }

  const wanted = !device.blocked;
  const label = wanted ? BLOCK_ACTION : UNBLOCK_ACTION;

  if (control.textContent !== label) {
    control.textContent = label;
  }

  control.onclick = (): void => {
    press(device, wanted);
  };
}

/**
 * States the reason in place of the control, and takes any control that was
 * there with it.
 *
 * The handler is given up before the button goes, rather than left for the
 * element to carry away: a row is kept between polls, and a detached control
 * still holding a live `onclick` is exactly the stale press this file is at
 * pains elsewhere to avoid. `textContent` replaces every child, so the button
 * cannot survive as a sibling of the words that replaced it.
 */
function fillLocalReason(cell: HTMLTableCellElement): void {
  const control = cell.querySelector<HTMLButtonElement>("[data-block]");

  if (control !== null) {
    control.onclick = null;
  }
  if (cell.textContent !== LOCAL_REASON) {
    cell.textContent = LOCAL_REASON;
  }
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

  // One more cell than there are readings: the last one holds the control.
  while (row.cells.length < values.length + 1) {
    row.append(document.createElement("td"));
  }

  // Stated on the row as well as in its cells, so a stylesheet has something to
  // hang on without the words having to go.
  row.dataset["blocked"] = String(device.blocked);
  row.dataset["present"] = String(device.present);
  row.dataset["local"] = String(device.local);

  values.forEach((value, index) => {
    const cell = row.cells[index];

    if (cell !== undefined && cell.textContent !== value) {
      cell.textContent = value;
    }
  });

  const action = row.cells[values.length];

  if (action !== undefined) {
    fillAction(action, device);
  }
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
