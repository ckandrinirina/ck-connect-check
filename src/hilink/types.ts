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

/** One complete reading of the router, assembled by the client in T-03. */
export interface RouterSnapshot {
  month: MonthStatistics;
  traffic: TrafficStatistics;
  status: RouterStatus;
  carrier: CarrierInfo;
  billing: BillingCycle;
}
