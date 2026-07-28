/**
 * The shape of everything the user can change, and the values the app runs on
 * before anyone changes anything.
 *
 * The plan limit lives here rather than on the router: the device reports
 * `DataLimit` as `0MB`, so we are the only place that knows the real quota.
 */

import { homedir } from "node:os";
import { join } from "node:path";

import type { AllowanceAnchor } from "../domain/allowance.js";

/** Everything the app remembers between launches. */
export interface AppConfig {
  /** Router address — hostname or IP, no scheme. */
  host: string;
  /** Seconds between polls. Never below {@link MIN_POLL_INTERVAL_SECONDS}. */
  pollIntervalSeconds: number;
  /**
   * Seconds between polls while the detail panel is on screen. Faster than
   * {@link AppConfig.pollIntervalSeconds}, because a live throughput rate is
   * only worth showing if it keeps up.
   */
  activePollIntervalSeconds: number;
  /** Percentage of the plan at which the display starts warning. */
  warnThresholdPercent: number;
  /** Monthly quota in bytes, or `null` when the user has not set one. */
  planLimitBytes: number | null;
  /**
   * Router admin username. Absent until a credential has been saved — a router
   * that needs no login never grows either credential field.
   */
  routerUsername?: string;
  /**
   * The router admin password as encrypted by the macOS Keychain, base64-encoded.
   * Never the plaintext: only `src/main/credentials.ts` can turn this back into
   * a password, and only on the machine that wrote it.
   */
  routerPasswordBlob?: string;
  /**
   * The last USSD reading, pinned to the router's counter at that instant.
   * Absent until the first sync — and the reason the exact remaining volume
   * survives a quit, since the router keeps counting while the app is closed.
   * Its dates are written to disk as ISO strings and read back as `Date`s.
   */
  allowanceAnchor?: AllowanceAnchor;
}

/** The stock HiLink address; the router answers here out of the box. */
export const DEFAULT_HOST = "192.168.8.1";

/** Half a minute is frequent enough to feel live without pestering the router. */
export const DEFAULT_POLL_INTERVAL_SECONDS = 30;

/**
 * Two seconds while the panel is open: fast enough for the rate readout and the
 * sparkline to look live, and only paid for while someone is watching.
 */
export const DEFAULT_ACTIVE_POLL_INTERVAL_SECONDS = 2;

/** Warn at 90% of the plan, matching the router's own default threshold. */
export const DEFAULT_WARN_THRESHOLD_PERCENT = 90;

/** Floor on the poll interval — below this we would hammer the router. */
export const MIN_POLL_INTERVAL_SECONDS = 5;

/**
 * Floor on the active interval. It sits below
 * {@link MIN_POLL_INTERVAL_SECONDS} on purpose: the burst only lasts as long as
 * the panel is open, and a rate readout refreshed less than once a second would
 * be unreadable anyway.
 */
export const MIN_ACTIVE_POLL_INTERVAL_SECONDS = 1;

/** Carriers bill in decimal GB (1000³), so 20 GB is 20 000 000 000 bytes. */
export const BYTES_PER_GIGABYTE = 1_000_000_000;

/** Name of the single JSON file that holds the config. There is no database. */
export const CONFIG_FILE_NAME = "config.json";

const APP_DIRECTORY_NAME = "ck-connect-check";

/** A fresh copy of the defaults; callers may mutate it freely. */
export function defaultConfig(): AppConfig {
  return {
    host: DEFAULT_HOST,
    pollIntervalSeconds: DEFAULT_POLL_INTERVAL_SECONDS,
    activePollIntervalSeconds: DEFAULT_ACTIVE_POLL_INTERVAL_SECONDS,
    warnThresholdPercent: DEFAULT_WARN_THRESHOLD_PERCENT,
    planLimitBytes: null,
  };
}

/**
 * Where the config lives for the real user. Resolved on call, never at import
 * time, and without Electron — so tests can ignore it and never touch the user
 * directory.
 */
export function defaultConfigPath(): string {
  const home = homedir();

  if (process.platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      APP_DIRECTORY_NAME,
      CONFIG_FILE_NAME,
    );
  }

  return join(home, ".config", APP_DIRECTORY_NAME, CONFIG_FILE_NAME);
}
