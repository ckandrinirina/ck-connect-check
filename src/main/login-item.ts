/**
 * Whether the system starts the app at login.
 *
 * Electron already owns the mechanism — `app.setLoginItemSettings` writes the
 * launch agent, `app.getLoginItemSettings` reads it back — so this module is a
 * two-function wrapper over it. Its job is to keep that Electron surface out of
 * the rest of the app: the popover asks for a boolean and sets a boolean, and
 * nothing else needs to know that a login item is a system-level registration.
 *
 * The setting deliberately has no local copy. The system is the only record —
 * the user can remove the item without the app running — so every read goes
 * back to the platform rather than to a cached flag.
 */

import { win32 } from "node:path";

import { app } from "electron";

import { platformTraits } from "./platform.js";

/** Which install the registration is for. Injected so Windows is testable from the Mac. */
export interface LoginItemTarget {
  platform?: NodeJS.Platform | undefined;
  execPath?: string;
}

/**
 * The executable a Windows login item should start.
 *
 * Squirrel runs the app from `<root>\app-<version>\`, a folder the next update
 * deletes, and keeps a stub of the same name at `<root>\` that always starts
 * the current version — so a registration of the running executable would
 * break on the first update, and the stub's never does.
 */
function launcherPath(execPath: string): string {
  const versionFolder = win32.dirname(execPath);

  if (!/^app-\d/.test(win32.basename(versionFolder))) {
    return execPath;
  }

  return win32.join(win32.dirname(versionFolder), win32.basename(execPath));
}

/** `{ path }` on Windows, where the registration names an executable; nothing elsewhere. */
function registrationPath({
  platform,
  execPath = process.execPath,
}: LoginItemTarget): { path?: string } {
  return platformTraits(platform).installedBySquirrel
    ? { path: launcherPath(execPath) }
    : {};
}

/**
 * Registers ({@code true}) or unregisters ({@code false}) the app as a login item.
 *
 * Passing `false` clears the registration; the system keeps no other state, so
 * this is the whole of "do not launch at login".
 */
export function setLaunchAtLogin(
  enabled: boolean,
  target: LoginItemTarget = {},
): void {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    ...registrationPath(target),
  });
}

/**
 * Whether the app is currently registered to launch at login.
 *
 * Read fresh on every call so a menu item rendered from it always reflects what
 * the system says. Electron's typings promise `openAtLogin`, but not every
 * platform fills it in, so anything other than an explicit `true` reads as off.
 */
export function getLaunchAtLogin(target: LoginItemTarget = {}): boolean {
  const path = registrationPath(target);

  const settings =
    path.path === undefined
      ? app.getLoginItemSettings()
      : app.getLoginItemSettings(path);

  return settings.openAtLogin === true;
}
