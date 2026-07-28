/**
 * Signing in to the router. Everything the `password_type: 4` scheme needs lives
 * here, so the plaintext password touches exactly one function and is never
 * stored, formatted into a message, or logged anywhere.
 *
 * The scheme, as probed on this device (see `docs/ARCHITECTURE.md`):
 *
 *   hashedPassword = base64(sha256hex(password))
 *   Password       = base64(sha256hex(username + hashedPassword + TokInfo))
 *
 * The `TokInfo` folded in is the *handshake* token. The reply then issues a fresh
 * session and a rolling token, and every later request must use those instead.
 */

import { createHash } from "node:crypto";

import { HilinkApiError, HilinkParseError, readReply } from "./parse.js";
import type {
  LoginFailure,
  RouterCredential,
  SessionCredentials,
} from "./types.js";

export const LOGIN_ENDPOINT = "/api/user/login";
export const LOGOUT_ENDPOINT = "/api/user/logout";

/** The scrambling scheme this router reports through `password_type`. */
const PASSWORD_TYPE_SHA256 = 4;

/** The router refused the credential. */
const WRONG_CREDENTIAL_CODE = 108006;

/** Five consecutive failures in, the router locks the account for a while. */
const ACCOUNT_LOCKED_CODE = 108007;

/** The response headers a login reply carries its new session in. */
export const SESSION_COOKIE_HEADER = "set-cookie";
export const ROLLING_TOKEN_HEADER = "__RequestVerificationTokenone";

/**
 * Every header a reply is known to rotate the verification token in, most
 * specific first. Ordinary replies use the bare name; a login reply uses the
 * numbered pair, of which `…one` is the one to send. The token is spent by each
 * `POST`, so whichever of these arrives supersedes the one being held.
 */
export const TOKEN_HEADERS: readonly string[] = [
  "__RequestVerificationToken",
  ROLLING_TOKEN_HEADER,
  "__RequestVerificationTokentwo",
];

/** The two response headers `readLoginReply` needs, lifted out of `fetch`. */
export interface LoginReplyHeaders {
  /** Raw `Set-Cookie`, attributes and all. */
  setCookie: string | undefined;
  /** Raw `__RequestVerificationTokenone`. */
  rollingToken: string | undefined;
}

function sha256hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function base64(value: string): string {
  return Buffer.from(value, "utf8").toString("base64");
}

/**
 * The value the `<Password>` element carries. Takes the plaintext password and
 * returns only the digest — the argument is never retained or reported.
 */
export function scramblePassword(
  user: string,
  password: string,
  token: string,
): string {
  const hashedPassword = base64(sha256hex(password));
  return base64(sha256hex(user + hashedPassword + token));
}

const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) => XML_ESCAPES[character] ?? character,
  );
}

/**
 * The `/api/user/login` request body. Only the scrambled password reaches it —
 * the plaintext never appears in anything that could be inspected or logged.
 */
export function loginRequestXml(
  credential: RouterCredential,
  token: string,
): string {
  const password = scramblePassword(
    credential.username,
    credential.password,
    token,
  );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<request>" +
    `<Username>${escapeXml(credential.username)}</Username>` +
    `<Password>${password}</Password>` +
    `<password_type>${PASSWORD_TYPE_SHA256}</password_type>` +
    "</request>"
  );
}

/** The `/api/user/logout` request body. */
export function logoutRequestXml(): string {
  return '<?xml version="1.0" encoding="UTF-8"?><request><Logout>1</Logout></request>';
}

/** `SessionID=…; Path=/; HttpOnly` → `SessionID=…`, the form the Cookie header wants. */
function sessionIdFromCookie(setCookie: string): string | undefined {
  const pair = setCookie.split(";")[0]?.trim() ?? "";
  return pair.startsWith("SessionID=") && pair.length > "SessionID=".length
    ? pair
    : undefined;
}

/**
 * The session a successful login hands back. Throws `HilinkApiError` when the
 * router refused instead — including 108006 and 108007.
 */
export function readLoginReply(
  xml: string,
  headers: LoginReplyHeaders,
): SessionCredentials {
  readReply(xml, LOGIN_ENDPOINT);

  const sessionId =
    headers.setCookie === undefined
      ? undefined
      : sessionIdFromCookie(headers.setCookie);
  if (sessionId === undefined) {
    throw new HilinkParseError(
      LOGIN_ENDPOINT,
      "login reply carried no SessionID cookie",
    );
  }

  const token = headers.rollingToken?.trim();
  if (token === undefined || token === "") {
    throw new HilinkParseError(
      LOGIN_ENDPOINT,
      `login reply carried no ${ROLLING_TOKEN_HEADER} header`,
    );
  }

  return { sessionId, token };
}

/**
 * The router's own refusal, or `undefined` when the failure was something else
 * (unreachable, timed out, unreadable) and should be reported as offline.
 */
export function loginRefusal(error: unknown): LoginFailure | undefined {
  if (!(error instanceof HilinkApiError)) {
    return undefined;
  }
  switch (error.code) {
    case WRONG_CREDENTIAL_CODE:
      return "wrong-credential";
    case ACCOUNT_LOCKED_CODE:
      return "account-locked";
    default:
      return undefined;
  }
}
