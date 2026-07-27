import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SnapshotResult } from '../../src/hilink/client.js';
import type { RouterSnapshot } from '../../src/hilink/types.js';
import { startMenuBarApp } from '../../src/main/main.js';

/** Electron is never loaded for real here — only the surface `main.ts` touches. */
const electron = vi.hoisted(() => ({
  dockHide: vi.fn(),
  setTitle: vi.fn(),
  buildFromTemplate: vi.fn((template: unknown) => ({ template })),
}));

vi.mock('electron', () => {
  class Tray {
    setTitle = electron.setTitle;
    setToolTip = vi.fn();
    setContextMenu = vi.fn();
    destroy = vi.fn();
    on = vi.fn();
  }

  return {
    app: {
      dock: { hide: electron.dockHide },
      on: vi.fn(),
      whenReady: vi.fn(() => Promise.resolve()),
      quit: vi.fn(),
    },
    Menu: { buildFromTemplate: electron.buildFromTemplate },
    Tray,
    nativeImage: { createEmpty: vi.fn(() => ({ empty: true })) },
  };
});

function snapshot(usedBytes: number): RouterSnapshot {
  return {
    month: {
      monthDownloadBytes: usedBytes,
      monthUploadBytes: 0,
      monthDurationSeconds: 27_960,
      monthLastClearTime: '2026-7-27',
    },
    traffic: { downloadRateBps: 0, uploadRateBps: 0, connectTimeSeconds: 27_960 },
    status: { connected: true, signalBars: 4, maxSignalBars: 5, connectedDevices: 3 },
    carrier: { carrier: 'Yas' },
    billing: { startDay: 1, routerDataLimitBytes: 0, warnThresholdPercent: 90 },
  };
}

const READING: SnapshotResult = { online: true, snapshot: snapshot(5_830_718_387) };

/** A config path that does not exist — `loadConfig` falls back to the defaults. */
const MISSING_CONFIG = join(tmpdir(), 'ck-connect-check-absent', 'config.json');

describe('startMenuBarApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    electron.dockHide.mockClear();
    electron.setTitle.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the Dock icon so the app exists only in the menu bar', () => {
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: { snapshot: () => Promise.resolve(READING) },
    });

    expect(electron.dockHide).toHaveBeenCalledTimes(1);
    app.stop();
  });

  it('shows the poller title in the menu bar as readings arrive', async () => {
    const app = startMenuBarApp({
      configPath: MISSING_CONFIG,
      client: { snapshot: () => Promise.resolve(READING) },
    });

    await vi.advanceTimersByTimeAsync(0);

    // No plan limit in the default config, so the used total stands alone.
    expect(electron.setTitle).toHaveBeenCalledWith('5.8G');
    app.stop();
  });
});
