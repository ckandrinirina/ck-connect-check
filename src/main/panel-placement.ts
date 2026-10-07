/**
 * Where the detail panel opens, given the tray icon it was clicked from.
 *
 * Pure and Electron-free, so every taskbar edge is testable from the Mac:
 * `popover.ts` asks the screen for the work area and hands it in.
 */

import { platformTraits } from "./platform.js";

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelPlacement {
  /** The running platform when omitted. */
  platform?: NodeJS.Platform;
  trayBounds: Bounds;
  panelSize: { width: number; height: number };
  /** The display's area minus the menu bar, Dock or taskbar. */
  workArea: Bounds;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Centred on the tray icon, below it or above it as the platform anchors the
 * panel, then pulled fully inside the work area — a taskbar on a side or the
 * top edge would otherwise leave part of the panel off-screen.
 */
export function placePanel({
  platform,
  trayBounds,
  panelSize,
  workArea,
}: PanelPlacement): { x: number; y: number } {
  const x = trayBounds.x + trayBounds.width / 2 - panelSize.width / 2;
  const y =
    platformTraits(platform).panelAnchor === "above-tray"
      ? trayBounds.y - panelSize.height
      : trayBounds.y + trayBounds.height;

  return {
    x: Math.round(
      clamp(x, workArea.x, workArea.x + workArea.width - panelSize.width),
    ),
    y: Math.round(
      clamp(y, workArea.y, workArea.y + workArea.height - panelSize.height),
    ),
  };
}
