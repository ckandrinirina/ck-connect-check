/**
 * Typed shape of everything the HiLink router tells us. XML never escapes
 * `src/hilink/` — these are the objects the rest of the app sees.
 */

/** `/api/webserver/SesTokInfo` — the handshake every other call depends on. */
export interface SessionCredentials {
  /** Sent verbatim as the `Cookie` header, e.g. `SessionID=…`. */
  sessionId: string;
  /** Sent as the `__RequestVerificationToken` header. */
  token: string;
}

/**
 * Why a call produced nothing usable. The first four all render as "offline";
 * the last two are the router refusing a credential it did receive.
 */
export type OfflineReason = "unreachable" | "timeout" | "session" | "error";

/** The account used to sign in to the router. Never logged, never serialised. */
export interface RouterCredential {
  username: string;
  /** Plaintext, held only long enough to be scrambled. */
  password: string;
}

/**
 * Why a login did not produce an authenticated session: either the router
 * refused the credential, or we never got a usable answer out of it.
 */
export type LoginFailure =
  OfflineReason | "wrong-credential" | "account-locked";

export type LoginResult = { ok: true } | { ok: false; reason: LoginFailure };

/** `/api/monitoring/month_statistics` — usage since the billing cycle started. */
export interface MonthStatistics {
  monthDownloadBytes: number;
  monthUploadBytes: number;
  monthDurationSeconds: number;
  /** Router-reported clear date, e.g. `2026-7-27`. Advisory only — see T-04. */
  monthLastClearTime: string;
}

/** `/api/monitoring/traffic-statistics` — instantaneous throughput. */
export interface TrafficStatistics {
  downloadRateBps: number;
  uploadRateBps: number;
  connectTimeSeconds: number;
}

/** `/api/monitoring/status` — link state and signal. */
export interface RouterStatus {
  connected: boolean;
  signalBars: number;
  maxSignalBars: number;
  connectedDevices: number;
  /**
   * `CurrentNetworkTypeEx` — the radio the router is attached to, as the bare
   * code it states. `101` is LTE on this device. What that is worth calling is
   * decided in `../domain/network-type.js`; the boundary only reads it.
   */
  networkTypeCode: number;
}

/** `/api/net/current-plmn` — the network we are attached to. */
export interface CarrierInfo {
  /** Empty string when the router reports no carrier name. */
  carrier: string;
}

/** `/api/monitoring/start_date` — billing cycle settings held by the router. */
export interface BillingCycle {
  /** Day of month the cycle restarts, 1–31. */
  startDay: number;
  /** Router-held quota in bytes. Reads 0 on this device — the real limit is in config. */
  routerDataLimitBytes: number;
  /** Percentage at which the router itself would warn. */
  warnThresholdPercent: number;
}

/** One numbered line of a carrier USSD menu, e.g. `00 Page precedente`. */
export interface UssdOption {
  /** Kept as written — `00` is not the number 0. */
  digit: string;
  label: string;
}

/** `/api/ussd/get` — one carrier reply: its whole text, plus any menu it offers. */
export interface UssdReply {
  /** The `<content>` verbatim, trimmed. Carries the option lines too. */
  text: string;
  /** Empty when the reply offers no menu — never null. */
  options: UssdOption[];
}

/** The exact remaining volume a `#359#` dialogue ends on. */
export interface Allowance {
  /** Offer name the carrier states, e.g. `NET MONTH 200 000`. */
  planLabel: string;
  remainingBytes: number;
  /** Null when the reply states a volume but no expiry date. */
  expiresAt: Date | null;
}

/** One complete reading of the router, assembled by the client in T-03. */
export interface RouterSnapshot {
  month: MonthStatistics;
  traffic: TrafficStatistics;
  status: RouterStatus;
  carrier: CarrierInfo;
  billing: BillingCycle;
}
