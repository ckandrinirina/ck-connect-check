import { describe, expect, it, vi } from "vitest";

import { handleSquirrelEvent } from "../../src/main/squirrel.js";

/**
 * Where Squirrel installs a release: one root per app, `Update.exe` beside a
 * versioned folder that holds the app itself.
 */
const ROOT = "C:\\Users\\ada\\AppData\\Local\\ck-connect-check";
const EXEC_PATH = `${ROOT}\\app-1.1.0\\ck-connect-check.exe`;
const UPDATE_EXE = `${ROOT}\\Update.exe`;

/** A host whose `Update.exe` runs only when the test says it has finished. */
function fakeHost() {
  const finish: (() => void)[] = [];
  const host = {
    execPath: EXEC_PATH,
    run: vi.fn(
      (_command: string, _args: readonly string[], done: () => void) => {
        finish.push(done);
      },
    ),
    quit: vi.fn(),
  };

  return {
    host,
    finishUpdateExe: () => {
      for (const done of finish) done();
    },
  };
}

describe("handleSquirrelEvent", () => {
  it.each(["--squirrel-install", "--squirrel-updated"])(
    "on %s, creates the shortcuts through Update.exe, then quits",
    (flag) => {
      const { host, finishUpdateExe } = fakeHost();

      const handled = handleSquirrelEvent([EXEC_PATH, flag, "1.1.0"], host);

      expect(handled).toBe(true);
      expect(host.run).toHaveBeenCalledTimes(1);
      expect(host.run.mock.calls[0]?.[0]).toBe(UPDATE_EXE);
      expect(host.run.mock.calls[0]?.[1]).toEqual([
        "--createShortcut=ck-connect-check.exe",
      ]);
      // Quitting before Update.exe is done would leave the install without a shortcut.
      expect(host.quit).not.toHaveBeenCalled();

      finishUpdateExe();

      expect(host.quit).toHaveBeenCalledTimes(1);
    },
  );

  it("on --squirrel-uninstall, removes the shortcuts through Update.exe, then quits", () => {
    const { host, finishUpdateExe } = fakeHost();

    const handled = handleSquirrelEvent(
      [EXEC_PATH, "--squirrel-uninstall", "1.1.0"],
      host,
    );

    expect(handled).toBe(true);
    expect(host.run).toHaveBeenCalledTimes(1);
    expect(host.run.mock.calls[0]?.[0]).toBe(UPDATE_EXE);
    expect(host.run.mock.calls[0]?.[1]).toEqual([
      "--removeShortcut=ck-connect-check.exe",
    ]);
    expect(host.quit).not.toHaveBeenCalled();

    finishUpdateExe();

    expect(host.quit).toHaveBeenCalledTimes(1);
  });

  it("on --squirrel-obsolete, quits at once and touches no shortcut", () => {
    const { host } = fakeHost();

    const handled = handleSquirrelEvent(
      [EXEC_PATH, "--squirrel-obsolete", "1.0.0"],
      host,
    );

    expect(handled).toBe(true);
    expect(host.run).not.toHaveBeenCalled();
    expect(host.quit).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["an ordinary launch", [EXEC_PATH]],
    ["the first run after install", [EXEC_PATH, "--squirrel-firstrun"]],
  ])("leaves %s to start the app", (_label, argv) => {
    const { host } = fakeHost();

    expect(handleSquirrelEvent(argv, host)).toBe(false);
    expect(host.run).not.toHaveBeenCalled();
    expect(host.quit).not.toHaveBeenCalled();
  });
});
