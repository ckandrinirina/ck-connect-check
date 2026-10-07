/**
 * The Squirrel installer's lifecycle events on Windows.
 *
 * Squirrel starts the app with `--squirrel-install`, `--squirrel-updated`,
 * `--squirrel-uninstall` or `--squirrel-obsolete` and waits for it to exit. On
 * each the app does its housekeeping and quits, before any tray is built — a
 * tray icon flashing up during an install would be a second, short-lived copy
 * of the app. No Electron import: the host does the spawning and quitting.
 */

import { win32 } from "node:path";

export interface SquirrelHost {
  /** The running executable, inside `<root>\app-<version>\`. */
  execPath: string;
  /** Runs `command` and calls `done` once it has exited. */
  run(command: string, args: readonly string[], done: () => void): void;
  quit(): void;
}

/**
 * Handles a Squirrel event in `argv`, if there is one.
 *
 * Returns `true` when the app must not start: it is quitting on Squirrel's
 * behalf. `--squirrel-firstrun` is not an event to handle — the app starts.
 */
export function handleSquirrelEvent(
  argv: readonly string[],
  host: SquirrelHost,
): boolean {
  const exeName = win32.basename(host.execPath);
  const updateExe = win32.join(
    win32.dirname(host.execPath),
    "..",
    "Update.exe",
  );
  const quit = () => {
    host.quit();
  };

  if (
    argv.includes("--squirrel-install") ||
    argv.includes("--squirrel-updated")
  ) {
    host.run(updateExe, [`--createShortcut=${exeName}`], quit);
    return true;
  }

  if (argv.includes("--squirrel-uninstall")) {
    host.run(updateExe, [`--removeShortcut=${exeName}`], quit);
    return true;
  }

  if (argv.includes("--squirrel-obsolete")) {
    host.quit();
    return true;
  }

  return false;
}
