/**
 * The router session. One handshake serves every later poll; the device expires
 * sessions silently and says so only through error 125002, so `clear()` is the
 * single way a stale session is retired.
 */

import type { SessionCredentials } from './types.js';

/** Fetches a fresh `SesInfo`/`TokInfo` pair from the router. */
export type Handshake = () => Promise<SessionCredentials>;

/** The headers every authenticated HiLink request has to carry. */
export function sessionHeaders(credentials: SessionCredentials): Record<string, string> {
  return {
    Cookie: credentials.sessionId,
    __RequestVerificationToken: credentials.token,
  };
}

export class SessionStore {
  readonly #handshake: Handshake;
  #credentials: SessionCredentials | undefined;

  constructor(handshake: Handshake) {
    this.#handshake = handshake;
  }

  /** The current credentials, handshaking only when there are none held. */
  async current(): Promise<SessionCredentials> {
    this.#credentials ??= await this.#handshake();
    return this.#credentials;
  }

  /** Drop the held session so the next `current()` handshakes again. */
  clear(): void {
    this.#credentials = undefined;
  }
}
