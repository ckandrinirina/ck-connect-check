/**
 * Whether macOS starts the app at login.
 *
 * Electron already owns the mechanism — `app.setLoginItemSettings` writes the
 * launch agent, `app.getLoginItemSettings` reads it back — so this module is a
 * two-function wrapper over it. Its job is to keep that Electron surface out of
 * the rest of the app: the popover asks for a boolean and sets a boolean, and
 * nothing else needs to know that a login item is a system-level registration.
 *
 * The setting deliberately has no local copy. macOS is the only record — the
 * user can remove the item from System Settings without the app running — so
 * every read goes back to the platform rather than to a cached flag.
 */

import { app } from 'electron';

/**
 * Registers ({@code true}) or unregisters ({@code false}) the app as a login item.
 *
 * Passing `false` clears the registration; macOS keeps no other state, so this
 * is the whole of "do not launch at login".
 */
export function setLaunchAtLogin(enabled: boolean): void {
  app.setLoginItemSettings({ openAtLogin: enabled });
}

/**
 * Whether the app is currently registered to launch at login.
 *
 * Read fresh on every call so a menu item rendered from it always reflects what
 * System Settings says. Electron's typings promise `openAtLogin`, but not every
 * platform fills it in, so anything other than an explicit `true` reads as off.
 */
export function getLaunchAtLogin(): boolean {
  return app.getLoginItemSettings().openAtLogin === true;
}
