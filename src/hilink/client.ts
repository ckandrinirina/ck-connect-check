/**
 * The router client. It turns "what is the router doing right now?" into one
 * `RouterSnapshot`, or into an offline result — never into a thrown error, so
 * the menu bar can render an unreachable router as a normal state.
 *
 * Endpoints are fetched in order on a single session. A 125002 anywhere means
 * the session expired, which costs one fresh handshake and one full retry.
 */

import {
  isStaleSessionError,
  parseCurrentPlmn,
  parseMonthStatistics,
  parseSesTokInfo,
  parseStartDate,
  parseStatus,
  parseTrafficStatistics,
} from './parse.js';
import { SessionStore, sessionHeaders } from './session.js';
import type { RouterSnapshot } from './types.js';

const SES_TOK_INFO = '/api/webserver/SesTokInfo';
const MONTH_STATISTICS = '/api/monitoring/month_statistics';
const TRAFFIC_STATISTICS = '/api/monitoring/traffic-statistics';
const STATUS = '/api/monitoring/status';
const CURRENT_PLMN = '/api/net/current-plmn';
const START_DATE = '/api/monitoring/start_date';

/** Every network call carries a timeout; there is no unbounded await. */
const DEFAULT_TIMEOUT_MS = 5_000;

/** Why a poll produced no snapshot. All four render as "offline". */
export type OfflineReason = 'unreachable' | 'timeout' | 'session' | 'error';

export type SnapshotResult =
  | { online: true; snapshot: RouterSnapshot }
  | { online: false; reason: OfflineReason };

export interface RouterClientOptions {
  /** Router origin, e.g. `http://192.168.8.1`. Injected — never hard-coded here. */
  baseUrl: string;
  /** Per-request timeout in milliseconds. */
  timeoutMs?: number;
}

/** The host did not answer at all: refused, unresolved, or the link is down. */
class RouterUnreachableError extends Error {
  constructor(url: string, cause: unknown) {
    super(`${url}: router unreachable`, { cause });
    this.name = 'RouterUnreachableError';
  }
}

/** The request outlived its timeout and was aborted. */
class RouterTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`${url}: no reply within ${timeoutMs}ms`);
    this.name = 'RouterTimeoutError';
  }
}

/** The router answered, but not with a reply we can use. */
class RouterHttpError extends Error {
  constructor(url: string, status: number) {
    super(`${url}: router answered HTTP ${status}`);
    this.name = 'RouterHttpError';
  }
}

function offlineReason(error: unknown, staleReason: OfflineReason): OfflineReason {
  if (error instanceof RouterTimeoutError) {
    return 'timeout';
  }
  if (error instanceof RouterUnreachableError) {
    return 'unreachable';
  }
  if (isStaleSessionError(error)) {
    return staleReason;
  }
  return 'error';
}

export class RouterClient {
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #session: SessionStore;

  constructor(options: RouterClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#session = new SessionStore(async () =>
      parseSesTokInfo(await this.#get(SES_TOK_INFO, {})),
    );
  }

  /**
   * One complete reading of the router. Resolves to an offline result rather
   * than rejecting, whatever went wrong.
   */
  async snapshot(): Promise<SnapshotResult> {
    try {
      return { online: true, snapshot: await this.#collect() };
    } catch (error) {
      if (!isStaleSessionError(error)) {
        return { online: false, reason: offlineReason(error, 'error') };
      }
    }

    // The session expired mid-poll: one fresh handshake, one retry, no more.
    this.#session.clear();
    try {
      return { online: true, snapshot: await this.#collect() };
    } catch (error) {
      return { online: false, reason: offlineReason(error, 'session') };
    }
  }

  async #collect(): Promise<RouterSnapshot> {
    const headers = sessionHeaders(await this.#session.current());
    return {
      month: parseMonthStatistics(await this.#get(MONTH_STATISTICS, headers)),
      traffic: parseTrafficStatistics(await this.#get(TRAFFIC_STATISTICS, headers)),
      status: parseStatus(await this.#get(STATUS, headers)),
      carrier: parseCurrentPlmn(await this.#get(CURRENT_PLMN, headers)),
      billing: parseStartDate(await this.#get(START_DATE, headers)),
    };
  }

  async #get(path: string, headers: Record<string, string>): Promise<string> {
    const url = new URL(path, this.#baseUrl).toString();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok) {
        throw new RouterHttpError(url, response.status);
      }
      return await response.text();
    } catch (error) {
      if (timedOut) {
        throw new RouterTimeoutError(url, this.#timeoutMs);
      }
      if (error instanceof RouterHttpError) {
        throw error;
      }
      throw new RouterUnreachableError(url, error);
    } finally {
      clearTimeout(timer);
    }
  }
}
