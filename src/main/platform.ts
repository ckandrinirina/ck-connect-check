/**
 * Every difference between macOS and Windows, decided in one place.
 *
 * The rest of the app asks a question here instead of testing `darwin`, and
 * every answer takes the platform as an argument, so both are testable from
 * the Mac. No Electron import: `src/config/` asks this module too.
 */

import { homedir } from "node:os";
import { posix, win32 } from "node:path";

/** Which side of the tray icon the detail panel opens on. */
export type PanelAnchor = "below-tray" | "above-tray";

export interface PlatformTraits {
  /** Whether the tray can show text beside its icon (the macOS menu bar can). */
  trayShowsTitle: boolean;
  /**
   * Below on macOS, where the menu bar is at the top; above on Windows, where
   * the taskbar usually sits at the bottom and a panel below would be off-screen.
   */
  panelAnchor: PanelAnchor;
  /** Whether there is a Dock icon to hide. */
  hasDock: boolean;
  /** Whether notifications only carry the app's name once an app user model ID is set. */
  needsAppUserModelId: boolean;
}

/** The answers for `platform`, the running one by default. */
export function platformTraits(
  platform: NodeJS.Platform = process.platform,
): PlatformTraits {
  const windows = platform === "win32";

  return {
    trayShowsTitle: !windows,
    panelAnchor: windows ? "above-tray" : "below-tray",
    hasDock: platform === "darwin",
    needsAppUserModelId: windows,
  };
}

/**
 * `segments` joined under the directory `platform` keeps per-user app data in:
 * `%APPDATA%` on Windows, Application Support on macOS, `~/.config` elsewhere.
 */
export function userDataPath(
  segments: readonly string[],
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const home = homedir();

  if (platform === "win32") {
    const appData = env.APPDATA ?? win32.join(home, "AppData", "Roaming");

    return win32.join(appData, ...segments);
  }

  if (platform === "darwin") {
    return posix.join(home, "Library", "Application Support", ...segments);
  }

  return posix.join(home, ".config", ...segments);
}

/**
 * What the password store behind Electron's secret storage is called on
 * `platform`, as a noun phrase that reads mid-sentence.
 */
export function secretStoreName(
  platform: NodeJS.Platform = process.platform,
): string {
  return platform === "win32" ? "Windows secure storage" : "the Keychain";
}
