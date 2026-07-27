/**
 * The poll loop that keeps the menu bar current.
 *
 * Two behaviours matter more than the polling itself. A single failed poll
 * keeps the last good title rather than blanking the menu bar — a router that
 * misses one reply has not changed anything the user needs to know. Only when
 * failures repeat does the title admit the router is unreachable.
 *
 * Each poll schedules the next one after it settles, rather than firing on a
 * fixed interval, so a slow reply can never stack two requests on the router.
 */

import type { AppConfig } from '../config/defaults.js';
import type { SnapshotResult } from '../hilink/client.js';
import { buildTrayTitle } from './tray.js';

/** Shown between launch and the first reading — no data yet, and no failure yet. */
export const STARTUP_TRAY_TITLE = '…';

/**
 * Consecutive failures tolerated before the title goes offline. One dropped
 * poll is noise; two in a row means the router really is not answering.
 */
export const FAILURES_BEFORE_OFFLINE = 2;

/** The slice of the router client the poller needs — a stub satisfies it in tests. */
export interface SnapshotSource {
  snapshot(): Promise<SnapshotResult>;
}

export interface UsagePollerOptions {
  client: SnapshotSource;
  config: AppConfig;
  /** Called only when the title actually changes, so the tray is not rewritten needlessly. */
  onTitle?: (title: string) => void;
}

export class UsagePoller {
  readonly #client: SnapshotSource;
  readonly #config: AppConfig;
  readonly #onTitle: ((title: string) => void) | undefined;

  #title = STARTUP_TRAY_TITLE;
  #consecutiveFailures = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running = false;

  constructor(options: UsagePollerOptions) {
    this.#client = options.client;
    this.#config = options.config;
    this.#onTitle = options.onTitle;
  }

  /** The title the menu bar should currently be showing. */
  get title(): string {
    return this.#title;
  }

  /** Polls immediately, then once per configured interval until {@link stop}. */
  start(): void {
    if (this.#running) {
      return;
    }

    this.#running = true;
    void this.#tick();
  }

  /** Cancels the pending poll; a poll already in flight publishes nothing. */
  stop(): void {
    this.#running = false;

    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }
  }

  async #tick(): Promise<void> {
    let result: SnapshotResult;

    try {
      result = await this.#client.snapshot();
    } catch {
      // The client resolves rather than rejects, but a stub or a future
      // implementation might throw; an unattended app must not die of it.
      result = { online: false, reason: 'error' };
    }

    if (!this.#running) {
      return;
    }

    this.#apply(result);
    this.#scheduleNext();
  }

  #apply(result: SnapshotResult): void {
    if (result.online) {
      this.#consecutiveFailures = 0;
      this.#setTitle(buildTrayTitle(result, this.#config));

      return;
    }

    this.#consecutiveFailures += 1;

    // Below the threshold the last good title stands: the menu bar keeps
    // showing the most recent real reading instead of going blank.
    if (this.#consecutiveFailures >= FAILURES_BEFORE_OFFLINE) {
      this.#setTitle(buildTrayTitle(result, this.#config));
    }
  }

  #setTitle(title: string): void {
    if (title === this.#title) {
      return;
    }

    this.#title = title;
    this.#onTitle?.(title);
  }

  #scheduleNext(): void {
    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#tick();
    }, this.#config.pollIntervalSeconds * 1_000);
  }
}
