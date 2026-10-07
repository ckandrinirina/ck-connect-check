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

describe('setLaunchAtLogin', () => {
  beforeEach(() => {
    electron.setLoginItemSettings.mockClear();
    electron.getLoginItemSettings.mockClear();
  });

  it('registers the app with the login-item API when enabled', () => {
    setLaunchAtLogin(true);

    expect(electron.setLoginItemSettings).toHaveBeenCalledTimes(1);
    expect(electron.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true });
  });

  it('clears the registration when disabled', () => {
    setLaunchAtLogin(false);

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

    expect(getLaunchAtLogin()).toBe(true);
  });

  it('reports false while the app is not registered', () => {
    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: false });

    expect(getLaunchAtLogin()).toBe(false);
  });

  it('reads the setting on every call rather than caching the first answer', () => {
    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: false });
    expect(getLaunchAtLogin()).toBe(false);

    electron.getLoginItemSettings.mockReturnValue({ openAtLogin: true });
    expect(getLaunchAtLogin()).toBe(true);

    expect(electron.getLoginItemSettings).toHaveBeenCalledTimes(2);
  });

  it('reports false when the platform reports no login-item state at all', () => {
    // Electron's typings promise `openAtLogin`, the platform does not always deliver it.
    electron.getLoginItemSettings.mockReturnValue({} as { openAtLogin: boolean });

    expect(getLaunchAtLogin()).toBe(false);
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

  it("leaves macOS on the bare registration it has always used", () => {
    setLaunchAtLogin(true, {
      platform: "darwin",
      execPath: "/Applications/ck-connect-check.app/Contents/MacOS/ck-connect-check",
    });

    expect(electron.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
    });
  });
});
