/**
 * Whether the system starts the app at login.
 *
 * Electron already owns the mechanism — `app.setLoginItemSettings` writes the
 * launch agent, `app.getLoginItemSettings` reads it back — so this module is a
 * two-function wrapper over it. Its job is to keep that Electron surface out of
 * the rest of the app: the popover asks for a boolean and sets a boolean, and
 * nothing else needs to know that a login item is a system-level registration.
 *
 * Except on macOS: Electron registers through SMAppService there, which
 * silently refuses an unsigned bundle, and this app ships unsigned — so the
 * login item is the app's own LaunchAgent in `~/Library/LaunchAgents`.
 *
 * The setting deliberately has no local copy. The system is the only record —
 * the user can remove the item without the app running — so every read goes
 * back to the platform rather than to a cached flag.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

import { app } from "electron";

import { APP_ID } from "../app-info.js";
import { platformTraits } from "./platform.js";

/** Which install the registration is for. Injected so Windows is testable from the Mac. */
export interface LoginItemTarget {
  platform?: NodeJS.Platform | undefined;
  execPath?: string;
  /** Where `~` is on macOS. Injected so tests never touch the real LaunchAgents folder. */
  homeDir?: string | undefined;
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

/** The `.app` holding `execPath`, or `execPath` itself outside a bundle (a dev run). */
function bundlePath(execPath: string): string {
  return /^(.+\.app)\/Contents\/MacOS\/[^/]+$/.exec(execPath)?.[1] ?? execPath;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function launchAgentPath(homeDir = homedir()): string {
  return posix.join(homeDir, "Library", "LaunchAgents", `${APP_ID}.plist`);
}

/** The `<string>` that names the bundle; also what a read looks for. */
function bundleArgument(execPath: string): string {
  return `<string>${escapeXml(bundlePath(execPath))}</string>`;
}

/**
 * A LaunchAgent that has `open` start the bundle at login. `open -a` rather
 * than the executable, so macOS launches it as an app (one instance, Gatekeeper
 * approval kept) exactly as a double-click would.
 */
function launchAgentPlist(execPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${APP_ID}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/open</string>
    <string>-a</string>
    ${bundleArgument(execPath)}
  </array>
  <key>RunAtLoad</key>
  <true/>
</dict>
</plist>
`;
}

/**
 * Registers ({@code true}) or unregisters ({@code false}) the app as a login item.
 *
 * Passing `false` clears the registration; the system keeps no other state, so
 * this is the whole of "do not launch at login". Throws when the LaunchAgent
 * cannot be written.
 */
export function setLaunchAtLogin(
  enabled: boolean,
  target: LoginItemTarget = {},
): void {
  if (platformTraits(target.platform).loginItemByLaunchAgent) {
    const path = launchAgentPath(target.homeDir);

    if (enabled) {
      mkdirSync(posix.dirname(path), { recursive: true });
      writeFileSync(path, launchAgentPlist(target.execPath ?? process.execPath));
    } else {
      rmSync(path, { force: true });
    }

    return;
  }

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
  if (platformTraits(target.platform).loginItemByLaunchAgent) {
    try {
      return readFileSync(launchAgentPath(target.homeDir), "utf8").includes(
        bundleArgument(target.execPath ?? process.execPath),
      );
    } catch {
      return false;
    }
  }

  const path = registrationPath(target);

  const settings =
    path.path === undefined
      ? app.getLoginItemSettings()
      : app.getLoginItemSettings(path);

  return settings.openAtLogin === true;
}
