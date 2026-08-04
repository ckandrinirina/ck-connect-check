/**
 * The fetch half of the Orange boundary. One `GET` on
 * `http://123.orange.mg/info-conso/` — no session, no token, no password: the
 * network recognises the subscriber and answers, or it does not answer at all.
 *
 * Two rules the router client already follows apply here unchanged. Every
 * network call carries an explicit timeout, so nothing here can stall the poll
 * loop; and an unreachable portal is a *state*, not an error, because the page
 * only answers on the Orange network and a laptop on café Wi-Fi is an ordinary
 * situation rather than a fault.
 *
 * A third state is this page's own. A captive-portal middlebox sits in front of
 * it — the live reply carries `X-Header: intercepting the request` — and a
 * middlebox is exactly the kind of thing that hands back someone else's `200`.
 * A page that arrives but states no forfait is therefore *unreadable*, kept
 * apart from *unreachable*, so the app never reports "no plan" when the truth
 * is "wrong network".
 */

import { parseInfoConso } from "./parse.js";
import type { OrangeInfoConso } from "./types.js";

/** The portal's own address. Overridable per call; never reached in tests. */
export const PORTAL_BASE_URL = "http://123.orange.mg";

/** The one page this boundary reads. */
export const INFO_CONSO_PATH = "/info-conso/";

/** Every network call carries a timeout; there is no unbounded await. */
const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * One attempt at reading the portal.
 *
 * `unreachable` is the off-network state, whichever way the portal failed to
 * answer: `offline` for a refused connection or a name that does not resolve,
 * `timeout` for a reply that never came, `http` for an answer that was not a
 * `200` — which keeps its status, since that is the one thing worth showing.
 *
 * `unreadable` means the opposite: something answered `200` and it was not the
 * subscriber's page.
 */
export type OrangePortalResult =
  | { state: "read"; page: OrangeInfoConso }
  | { state: "unreachable"; reason: "offline" | "timeout" }
  | { state: "unreachable"; reason: "http"; status: number }
  | { state: "unreadable" };

export interface OrangePortalOptions {
  /** Portal origin. Defaults to {@link PORTAL_BASE_URL}; injected by tests. */
  baseUrl?: string;
  /** Request timeout in milliseconds. */
  timeoutMs?: number;
}

/**
 * Read the portal once. Resolves to a state rather than rejecting, whatever
 * went wrong — nothing thrown here can reach the poll loop.
 */
export async function readInfoConso(
  options: OrangePortalOptions = {},
): Promise<OrangePortalResult> {
  const baseUrl = options.baseUrl ?? PORTAL_BASE_URL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = new URL(INFO_CONSO_PATH, baseUrl).toString();

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  let html: string;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      return { state: "unreachable", reason: "http", status: response.status };
    }
    html = await response.text();
  } catch {
    return {
      state: "unreachable",
      reason: timedOut ? "timeout" : "offline",
    };
  } finally {
    clearTimeout(timer);
  }

  // The parse is total, so a page that says nothing yields no forfait rather
  // than an exception — which is precisely the middlebox's `200`.
  const page = parseInfoConso(html);
  return page.forfaits.length === 0
    ? { state: "unreadable" }
    : { state: "read", page };
}
