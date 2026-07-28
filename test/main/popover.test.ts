import type { Rectangle, Tray } from 'electron';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultConfig } from '../../src/config/defaults.js';
import { bindTrayToPopover, createPopover } from '../../src/main/popover.js';
import { buildPopoverModel } from '../../src/main/view-model.js';

/**
 * Electron is never loaded for real. The fake window records the constructor
 * options and the handlers `popover.ts` registers, so window shape and
 * open/close behaviour can both be asserted without a screen.
 */
const electron = vi.hoisted(() => ({
  windows: [] as FakeWindow[],
}));

interface FakeWindow {
  options: Record<string, unknown>;
  visible: boolean;
  destroyed: boolean;
  handlers: Map<string, () => void>;
  loadFile: ReturnType<typeof vi.fn>;
  setPosition: ReturnType<typeof vi.fn>;
  webContents: {
    executeJavaScript: ReturnType<typeof vi.fn>;
    on: (event: string, handler: () => void) => void;
    handlers: Map<string, () => void>;
  };
  on(event: string, handler: () => void): void;
  show(): void;
  hide(): void;
  isVisible(): boolean;
  isDestroyed(): boolean;
  destroy(): void;
}

vi.mock('electron', () => {
  class BrowserWindow {
    options: Record<string, unknown>;
    visible = false;
    destroyed = false;
    handlers = new Map<string, () => void>();
    loadFile = vi.fn(() => Promise.resolve());
    setPosition = vi.fn();
    webContents = {
      handlers: new Map<string, () => void>(),
      executeJavaScript: vi.fn(() => Promise.resolve()),
      on(event: string, handler: () => void) {
        this.handlers.set(event, handler);
      },
    };

    constructor(options: Record<string, unknown>) {
      this.options = options;
      electron.windows.push(this as unknown as FakeWindow);
    }

    on(event: string, handler: () => void) {
      this.handlers.set(event, handler);
    }

    show() {
      this.visible = true;
    }

    hide() {
      this.visible = false;
    }

    isVisible() {
      return this.visible;
    }

    isDestroyed() {
      return this.destroyed;
    }

    destroy() {
      this.destroyed = true;
      this.visible = false;
    }
  }

  return { BrowserWindow };
});

const TRAY_BOUNDS: Rectangle = { x: 900, y: 0, width: 40, height: 24 };

/** A stand-in for the real `Tray`; only the `click` subscription is exercised. */
function fakeTray(): { tray: Tray; click(bounds: Rectangle): void } {
  let listener: ((event: unknown, bounds: Rectangle) => void) | null = null;

  return {
    tray: {
      on(event: string, handler: (event: unknown, bounds: Rectangle) => void) {
        if (event === 'click') {
          listener = handler;
        }
        return this;
      },
    } as unknown as Tray,
    click(bounds: Rectangle) {
      listener?.({}, bounds);
    },
  };
}

function lastWindow(): FakeWindow {
  const window = electron.windows.at(-1);

  if (window === undefined) {
    throw new Error('no popover window was created');
  }

  return window;
}

describe('createPopover', () => {
  beforeEach(() => {
    electron.windows.length = 0;
  });

  it('creates the window frameless, non-resizable and out of the app switcher', () => {
    const popover = createPopover({ htmlPath: '/tmp/index.html' });
    popover.show(TRAY_BOUNDS);

    expect(lastWindow().options).toMatchObject({
      frame: false,
      resizable: false,
      skipTaskbar: true,
    });

    popover.destroy();
  });

  it('does not open a window until it is first shown', () => {
    const popover = createPopover({ htmlPath: '/tmp/index.html' });

    expect(electron.windows).toHaveLength(0);

    popover.destroy();
  });

  it('opens on the first tray click and closes on the second', () => {
    const popover = createPopover({ htmlPath: '/tmp/index.html' });
    const { tray, click } = fakeTray();
    bindTrayToPopover(tray, popover);

    click(TRAY_BOUNDS);
    expect(popover.isOpen()).toBe(true);

    click(TRAY_BOUNDS);
    expect(popover.isOpen()).toBe(false);

    click(TRAY_BOUNDS);
    expect(popover.isOpen()).toBe(true);

    popover.destroy();
  });

  it('closes when the window loses focus', () => {
    const popover = createPopover({ htmlPath: '/tmp/index.html' });
    popover.show(TRAY_BOUNDS);

    const blur = lastWindow().handlers.get('blur');
    expect(blur).toBeTypeOf('function');

    blur?.();
    expect(popover.isOpen()).toBe(false);

    popover.destroy();
  });

  it('positions itself under the tray item it was clicked from', () => {
    const popover = createPopover({ htmlPath: '/tmp/index.html', width: 320 });
    popover.show(TRAY_BOUNDS);

    // Centred on the tray item, hanging just below the menu bar.
    expect(lastWindow().setPosition).toHaveBeenCalledWith(760, 24, false);

    popover.destroy();
  });

  it('hands the current model to the page rather than letting it compute anything', () => {
    const popover = createPopover({ htmlPath: '/tmp/index.html' });
    popover.setModel(buildPopoverModel({ result: null, lastReading: null, config: defaultConfig() }));
    popover.show(TRAY_BOUNDS);

    const window = lastWindow();
    window.webContents.handlers.get('did-finish-load')?.();

    const [script] = window.webContents.executeJavaScript.mock.calls.at(-1) as [string];
    expect(script).toContain('applyPopoverModel');
    expect(script).toContain('"stale":true');

    popover.destroy();
  });

  it('releases the window when destroyed', () => {
    const popover = createPopover({ htmlPath: '/tmp/index.html' });
    popover.show(TRAY_BOUNDS);
    const window = lastWindow();

    popover.destroy();

    expect(window.isDestroyed()).toBe(true);
    expect(popover.isOpen()).toBe(false);
  });
});
