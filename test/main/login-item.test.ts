import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getLaunchAtLogin, setLaunchAtLogin } from '../../src/main/login-item.js';

/** Electron is never loaded for real here — only the login-item surface is mocked. */
const electron = vi.hoisted(() => ({
  setLoginItemSettings: vi.fn(),
  getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
}));

vi.mock('electron', () => ({
  app: {
    setLoginItemSettings: electron.setLoginItemSettings,
    getLoginItemSettings: electron.getLoginItemSettings,
  },
}));

/** A platform whose login item Electron still owns. */
const ELECTRON_MANAGED = { platform: 'linux' } as const;

describe('setLaunchAtLogin', () => {
  beforeEach(() => {
    electron.setLoginItemSettings.mockClear();
    electron.getLoginItemSettings.mockClear();
  });

  it('registers the app with the login-item API when enabled', () => {
    setLaunchAtLogin(true, ELECTRON_MANAGED);

    expect(electron.setLoginItemSettings).toHaveBeenCalledTimes(1);
    expect(electron.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
  });

  it('clears the registration when disabled', () => {
    setLaunchAtLogin(false, ELECTRON_MANAGED);

    expect(electron.setLoginItemSettings).toHaveBeenCalledTimes(1);
    expect(electron.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: false });
  });
});

describe('getLaunchAtLogin', () => {
  beforeEach(() => {
    electron.setLoginItemSettings.mockClear();
    electron.getLoginItemSettings.mockClear();
    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: false });
  });

  it('reports true while the app is registered, so a menu can show it checked', () => {
    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: true });

    expect(getLaunchAtLogin(ELECTRON_MANAGED)).toBe(true);
  });

  it('reports false while the app is not registered', () => {
    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: false });

    expect(getLaunchAtLogin(ELECTRON_MANAGED)).toBe(false);
  });

  it('reads the setting on every call rather than caching the first answer', () => {
    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: false });
    expect(getLaunchAtLogin(ELECTRON_MANAGED)).toBe(false);

    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: true });
    expect(getLaunchAtLogin(ELECTRON_MANAGED)).toBe(true);

    expect(electron.getLoginItemSettings).toHaveBeenCalledTimes(2);
  });

  it('reports false when the platform reports no login-item state at all', () => {
    // Electron's typings promise `openAtLogin`, the platform does not always deliver it.
    electron.getLoginItemSettings.mockReturnValue({} as { openAtLogin: boolean });

    expect(getLaunchAtLogin(ELECTRON_MANAGED)).toBe(false);
  });
});

describe("launch at login on Windows", () => {
  const ROOT = "C:\\Users\\ada\\AppData\\Local\\ck-connect-check";
  const INSTALLED = `${ROOT}\\app-1.1.0\\ck-connect-check.exe`;
  const STUB = `${ROOT}\\ck-connect-check.exe`;

  beforeEach(() => {
    electron.setLoginItemSettings.mockClear();
    electron.getLoginItemSettings.mockClear();
    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: false });
  });

  it("registers the installed app's launcher, which outlives the versioned folder an update removes", () => {
    setLaunchAtLogin(true, { platform: "win32", execPath: INSTALLED });

    expect(electron.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: STUB,
    });
  });

  it("never registers Squirrel's Update.exe or a versioned app folder", () => {
    setLaunchAtLogin(true, { platform: "win32", execPath: INSTALLED });

    const [settings] = electron.setLoginItemSettings.mock.calls[0] as [
      { path?: string },
    ];
    expect(settings.path).not.toMatch(/Update\.exe$/i);
    expect(settings.path).not.toMatch(/\\app-[\d.]+\\/);
  });

  it("clears the same registration it made", () => {
    setLaunchAtLogin(false, { platform: "win32", execPath: INSTALLED });

    expect(electron.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: false,
      path: STUB,
    });
  });

  it("reads back the registration for that same launcher", () => {
    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: true });

    expect(getLaunchAtLogin({ platform: "win32", execPath: INSTALLED })).toBe(
      true,
    );
    expect(electron.getLoginItemSettings).toHaveBeenCalledWith({ path: STUB });
  });

  it("registers the executable itself when it was not installed by Squirrel", () => {
    const portable = "D:\\Tools\\ck-connect-check\\ck-connect-check.exe";

    setLaunchAtLogin(true, { platform: "win32", execPath: portable });

    expect(electron.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      path: portable,
    });
  });

});

describe("launch at login on macOS", () => {
  const BUNDLE = "/Applications/ck-connect-check.app";
  const EXEC = `${BUNDLE}/Contents/MacOS/ck-connect-check`;
  const LABEL = "com.ckandrinirina.connect-check";

  let home: string;

  function target(execPath = EXEC) {
    return { platform: "darwin" as const, execPath, homeDir: home };
  }

  function agentPath(): string {
    return join(home, "Library", "LaunchAgents", `${LABEL}.plist`);
  }

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ck-login-item-"));
    electron.setLoginItemSettings.mockClear();
    electron.getLoginItemSettings.mockClear();
  });

  it("writes a LaunchAgent that opens the app bundle at login", () => {
    setLaunchAtLogin(true, target());

    const plist = readFileSync(agentPath(), "utf8");
    expect(plist).toContain(`<key>Label</key>\n  <string>${LABEL}</string>`);
    expect(plist).toMatch(/<key>RunAtLoad<\/key>\s*<true\/>/);
    expect(plist).toMatch(
      new RegExp(
        "<key>ProgramArguments</key>\\s*<array>\\s*" +
          "<string>/usr/bin/open</string>\\s*" +
          "<string>-a</string>\\s*" +
          `<string>${BUNDLE}</string>\\s*` +
          "</array>",
      ),
    );
  });

  it("creates the LaunchAgents folder when the account has none yet", () => {
    expect(existsSync(join(home, "Library"))).toBe(false);

    setLaunchAtLogin(true, target());

    expect(existsSync(agentPath())).toBe(true);
  });

  it("escapes XML characters in the bundle path", () => {
    const odd = "/Users/ada/Apps & <Tools>/ck-connect-check.app";

    setLaunchAtLogin(true, target(`${odd}/Contents/MacOS/ck-connect-check`));

    expect(readFileSync(agentPath(), "utf8")).toContain(
      "<string>/Users/ada/Apps &amp; &lt;Tools&gt;/ck-connect-check.app</string>",
    );
    expect(getLaunchAtLogin(target(`${odd}/Contents/MacOS/ck-connect-check`))).toBe(true);
  });

  it("deletes the LaunchAgent when turned off", () => {
    setLaunchAtLogin(true, target());

    setLaunchAtLogin(false, target());

    expect(existsSync(agentPath())).toBe(false);
  });

  it("turning off when nothing is registered does not throw", () => {
    expect(() => setLaunchAtLogin(false, target())).not.toThrow();
  });

  it("reads true while the LaunchAgent names the running bundle", () => {
    setLaunchAtLogin(true, target());

    expect(getLaunchAtLogin(target())).toBe(true);
  });

  it("reads false while there is no LaunchAgent", () => {
    expect(getLaunchAtLogin(target())).toBe(false);
  });

  it("reads false when the LaunchAgent names another copy of the app", () => {
    setLaunchAtLogin(true, target("/Users/ada/Downloads/ck-connect-check.app/Contents/MacOS/ck-connect-check"));

    expect(getLaunchAtLogin(target())).toBe(false);
  });

  it("reads the file on every call rather than caching the first answer", () => {
    expect(getLaunchAtLogin(target())).toBe(false);

    setLaunchAtLogin(true, target());
    expect(getLaunchAtLogin(target())).toBe(true);

    setLaunchAtLogin(false, target());
    expect(getLaunchAtLogin(target())).toBe(false);
  });

  it("never goes through Electron's login-item API, which refuses an unsigned app", () => {
    setLaunchAtLogin(true, target());
    getLaunchAtLogin(target());
    setLaunchAtLogin(false, target());

    expect(electron.setLoginItemSettings).not.toHaveBeenCalled();
    expect(electron.getLoginItemSettings).not.toHaveBeenCalled();
  });

  it("throws when the LaunchAgents folder cannot be written", () => {
    const agents = join(home, "Library", "LaunchAgents");
    mkdirSync(agents, { recursive: true });
    chmodSync(agents, 0o500);

    expect(() => setLaunchAtLogin(true, target())).toThrow();
    expect(getLaunchAtLogin(target())).toBe(false);
  });

  it("throws when a file stands where the folder should be", () => {
    writeFileSync(join(home, "Library"), "");

    expect(() => setLaunchAtLogin(true, target())).toThrow();
  });
});
