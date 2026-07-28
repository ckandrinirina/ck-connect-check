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
