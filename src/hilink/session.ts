/**
 * The router session. One handshake serves every later poll; the device expires
 * sessions silently and says so only through error 125002, so `clear()` is the
 * single way a stale session is retired.
 *
 * Two sessions can be held at once. The anonymous handshake pair is what the
 * monitoring endpoints need and what a login has to be scrambled against; a
 * successful login supersedes it with its own session and rolling token, which
 * every request from then on carries instead.
 */

import type { SessionCredentials } from "./types.js";

/** Fetches a fresh `SesInfo`/`TokInfo` pair from the router. */
export type Handshake = () => Promise<SessionCredentials>;

/** The headers every authenticated HiLink request has to carry. */
export function sessionHeaders(
  credentials: SessionCredentials,
): Record<string, string> {
  return {
    Cookie: credentials.sessionId,
    __RequestVerificationToken: credentials.token,
  };
}

export class SessionStore {
  readonly #handshake: Handshake;
  #credentials: SessionCredentials | undefined;
  #authenticated: SessionCredentials | undefined;

  constructor(handshake: Handshake) {
    this.#handshake = handshake;
  }

  /**
   * The anonymous handshake pair, fetching one when there is none held. This is
   * the token a login scrambles against — never the rolling one.
   */
  async handshake(): Promise<SessionCredentials> {
    this.#credentials ??= await this.#handshake();
    return this.#credentials;
  }

  /**
   * The credentials a request should carry: the authenticated session once a
   * login has succeeded, otherwise the anonymous handshake pair.
   */
  async current(): Promise<SessionCredentials> {
    return this.#authenticated ?? (await this.handshake());
  }

  /** True once a login has handed back a session. */
  get isAuthenticated(): boolean {
    return this.#authenticated !== undefined;
  }

  /** Record the session and rolling token a successful login returned. */
  authenticate(credentials: SessionCredentials): void {
    this.#authenticated = credentials;
  }

  /**
   * Move the session `current()` hands out on to the token a reply just issued.
   * The token is spent by every `POST`, so it is a moving value rather than a
   * property of the session — the cookie it belongs to is left untouched.
   *
   * A blank token is ignored: a reply that carried no usable one must never
   * replace the one still working.
   */
  advanceToken(token: string): void {
    const next = token.trim();
    if (next === "") {
      return;
    }
    const held = this.#authenticated ?? this.#credentials;
    if (held === undefined) {
      return;
    }
    const advanced = { ...held, token: next };
    if (this.#authenticated === held) {
      this.#authenticated = advanced;
    } else {
      this.#credentials = advanced;
    }
  }

  /** Drop both held sessions so the next `current()` handshakes again. */
  clear(): void {
    this.#credentials = undefined;
    this.#authenticated = undefined;
  }
}
