/**
 * The router client. It turns "what is the router doing right now?" into one
 * `RouterSnapshot`, or into an offline result — never into a thrown error, so
 * the menu bar can render an unreachable router as a normal state.
 *
 * Endpoints are fetched in order on a single session. A 125002 anywhere means
 * the session expired, which costs one fresh handshake and one full retry.
 *
 * The monitoring endpoints need no login, so `snapshot()` works with no
 * credential at all. `login()` adds an authenticated session alongside that
 * anonymous one, which the protected `POST` endpoints need.
 */

import {
  LOGIN_ENDPOINT,
  LOGOUT_ENDPOINT,
  ROLLING_TOKEN_HEADER,
  SESSION_COOKIE_HEADER,
  TOKEN_HEADERS,
  loginRefusal,
  loginRequestXml,
  logoutRequestXml,
  readLoginReply,
} from "./login.js";
import {
  HilinkApiError,
  SPENT_TOKEN_CODE,
  isStaleSessionError,
  parseCurrentPlmn,
  parseMonthStatistics,
  parseSesTokInfo,
  parseStartDate,
  parseStatus,
  parseToken,
  parseTrafficStatistics,
  readReply,
} from "./parse.js";
import { SessionStore, sessionHeaders } from "./session.js";
import {
  UssdDialogue,
  type AllowanceResult,
  type UssdFailure,
  type UssdOptions,
} from "./ussd.js";
import type {
  LoginResult,
  OfflineReason,
  RouterCredential,
  RouterSnapshot,
} from "./types.js";

const SES_TOK_INFO = "/api/webserver/SesTokInfo";
const TOKEN = "/api/webserver/token";
const MONTH_STATISTICS = "/api/monitoring/month_statistics";
const TRAFFIC_STATISTICS = "/api/monitoring/traffic-statistics";
const STATUS = "/api/monitoring/status";
const CURRENT_PLMN = "/api/net/current-plmn";
const START_DATE = "/api/monitoring/start_date";

/** Every network call carries a timeout; there is no unbounded await. */
const DEFAULT_TIMEOUT_MS = 5_000;

/** What HiLink expects on a `POST`, even though the body is XML. */
const POST_CONTENT_TYPE = "application/x-www-form-urlencoded; charset=UTF-8";

/** Why a poll produced no snapshot. All four render as "offline". */
export type { OfflineReason } from "./types.js";

/** The USSD dialogue's own result and failure vocabulary — see `./ussd.ts`. */
export type {
  AllowanceResult,
  RouterRefusal,
  UssdFailure,
  UssdOptions,
} from "./ussd.js";

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
    this.name = "RouterUnreachableError";
  }
}

/** The request outlived its timeout and was aborted. */
class RouterTimeoutError extends Error {
  constructor(url: string, timeoutMs: number) {
    super(`${url}: no reply within ${timeoutMs}ms`);
    this.name = "RouterTimeoutError";
  }
}

/** The router answered, but not with a reply we can use. */
class RouterHttpError extends Error {
  /** The path, not the full URL — the host is noise in anything user-facing. */
  readonly endpoint: string;
  readonly status: number;

  constructor(url: string, endpoint: string, status: number) {
    super(`${url}: router answered HTTP ${status}`);
    this.name = "RouterHttpError";
    this.endpoint = endpoint;
    this.status = status;
  }
}

/** One reply, body and headers — logins read their new session off the headers. */
interface RouterResponse {
  body: string;
  headers: Headers;
}

/** The token a reply rotated to, from whichever header carried it. */
function rotatedToken(headers: Headers): string | undefined {
  for (const name of TOKEN_HEADERS) {
    const value = headers.get(name);
    if (value !== null && value.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

/**
 * True when a reply is the router saying the token had already been spent. The
 * body is read rather than raised on, because a `POST` reply is parsed by its
 * caller — this is the one code the transport itself has to act on.
 */
function isSpentTokenReply(body: string, endpoint: string): boolean {
  try {
    readReply(body, endpoint);
    return false;
  } catch (error) {
    return error instanceof HilinkApiError && error.code === SPENT_TOKEN_CODE;
  }
}

function offlineReason(
  error: unknown,
  staleReason: OfflineReason,
): OfflineReason {
  if (error instanceof RouterTimeoutError) {
    return "timeout";
  }
  if (error instanceof RouterUnreachableError) {
    return "unreachable";
  }
  if (isStaleSessionError(error)) {
    return staleReason;
  }
  return "error";
}

/**
 * The same mapping for the USSD dialogue, except that an HTTP refusal keeps its
 * status and its path. A dialogue is driven by an explicit press and reports
 * back to the user, so "it was refused" has to be able to say what by.
 */
function ussdTransportFailure(error: unknown): UssdFailure {
  if (error instanceof RouterHttpError) {
    return {
      kind: "error",
      source: "http",
      code: error.status,
      endpoint: error.endpoint,
    };
  }

  return offlineReason(error, "session");
}

export class RouterClient {
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #session: SessionStore;
  readonly #ussd: UssdDialogue;

  constructor(options: RouterClientOptions) {
    this.#baseUrl = options.baseUrl;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.#session = new SessionStore(async () =>
      parseSesTokInfo(await this.#get(SES_TOK_INFO, {})),
    );
    this.#ussd = new UssdDialogue({
      get: async (path) =>
        await this.#get(path, sessionHeaders(await this.#session.current())),
      post: async (path, body) => await this.#write(path, body),
      transportReason: ussdTransportFailure,
    });
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
        return { online: false, reason: offlineReason(error, "error") };
      }
    }

    // The session expired mid-poll: one fresh handshake, one retry, no more.
    this.#session.clear();
    try {
      return { online: true, snapshot: await this.#collect() };
    } catch (error) {
      return { online: false, reason: offlineReason(error, "session") };
    }
  }

  /**
   * Sign in, so the protected `POST` endpoints stop answering 100003. Resolves
   * to a failed result rather than rejecting — including for a wrong password.
   *
   * Exactly one `POST /api/user/login` goes out per call: the router locks the
   * account after five consecutive failures, so nothing here retries.
   */
  async login(credential: RouterCredential): Promise<LoginResult> {
    try {
      const handshake = await this.#session.handshake();
      const response = await this.#post(
        LOGIN_ENDPOINT,
        sessionHeaders(handshake),
        loginRequestXml(credential, handshake.token),
      );
      this.#session.authenticate(
        readLoginReply(response.body, {
          setCookie: response.headers.get(SESSION_COOKIE_HEADER) ?? undefined,
          rollingToken: response.headers.get(ROLLING_TOKEN_HEADER) ?? undefined,
        }),
      );
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: loginRefusal(error) ?? offlineReason(error, "session"),
      };
    }
  }

  /**
   * Sign out and forget the authenticated session. The local session is dropped
   * whatever the router answers — a logout it refuses still leaves us signed out.
   */
  async logout(): Promise<void> {
    if (!this.#session.isAuthenticated) {
      return;
    }
    try {
      await this.#write(LOGOUT_ENDPOINT, logoutRequestXml());
    } catch {
      // A refused or unanswered logout changes nothing: the session goes anyway.
    } finally {
      this.#session.clear();
    }
  }

  /**
   * Ask the carrier for the exact remaining allowance over USSD. Resolves to a
   * reason rather than rejecting, exactly like {@link RouterClient.snapshot}.
   *
   * Only ever driven by an explicit Sync press: a dialogue takes tens of seconds
   * and holds carrier-side state, so the poll loop must never call this.
   */
  async readAllowance(options: UssdOptions = {}): Promise<AllowanceResult> {
    return await this.#ussd.readAllowance(options);
  }

  async #collect(): Promise<RouterSnapshot> {
    const headers = sessionHeaders(await this.#session.current());
    return {
      month: parseMonthStatistics(await this.#get(MONTH_STATISTICS, headers)),
      traffic: parseTrafficStatistics(
        await this.#get(TRAFFIC_STATISTICS, headers),
      ),
      status: parseStatus(await this.#get(STATUS, headers)),
      carrier: parseCurrentPlmn(await this.#get(CURRENT_PLMN, headers)),
      billing: parseStartDate(await this.#get(START_DATE, headers)),
    };
  }

  async #get(path: string, headers: Record<string, string>): Promise<string> {
    return (await this.#request(path, { method: "GET", headers })).body;
  }

  /**
   * A `POST` on the session `current()` hands out, retried once when the router
   * answers 125003 — the token had already been spent, which is the normal state
   * of affairs for the second write of a dialogue.
   *
   * The retry refreshes the token and nothing else. Signing in again would be
   * the wrong repair for a spent token and the right way to walk the account
   * into its five-failure lockout, so no path here logs in.
   */
  async #write(path: string, body: string): Promise<string> {
    const send = async (): Promise<string> =>
      (
        await this.#post(
          path,
          sessionHeaders(await this.#session.current()),
          body,
        )
      ).body;

    const reply = await send();
    if (!isSpentTokenReply(reply, path)) {
      return reply;
    }
    await this.#refreshToken();
    return await send();
  }

  /**
   * Ask the router which token it is expecting. Only reached when a reply
   * carried none and a write was refused for it, so nothing here is on the
   * ordinary path.
   */
  async #refreshToken(): Promise<void> {
    const headers = sessionHeaders(await this.#session.current());
    this.#session.advanceToken(parseToken(await this.#get(TOKEN, headers)));
  }

  async #post(
    path: string,
    headers: Record<string, string>,
    body: string,
  ): Promise<RouterResponse> {
    return await this.#request(path, {
      method: "POST",
      headers: { ...headers, "Content-Type": POST_CONTENT_TYPE },
      body,
    });
  }

  async #request(path: string, init: RequestInit): Promise<RouterResponse> {
    const url = new URL(path, this.#baseUrl).toString();
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: controller.signal });
      if (!response.ok) {
        throw new RouterHttpError(url, path, response.status);
      }
      // The token moves with every reply that carries one, so the next write
      // sends the current one rather than the one the login was handed.
      const rotated = rotatedToken(response.headers);
      if (rotated !== undefined) {
        this.#session.advanceToken(rotated);
      }
      return { body: await response.text(), headers: response.headers };
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
