/**
 * Reading and writing the one JSON file the app persists.
 *
 * Every path is injected: nothing here reaches for the user directory on its
 * own, so tests run entirely inside a temp folder. A config that cannot be read
 * is never fatal — the app falls back to the defaults and reports what was
 * wrong, because an unattended menu bar app must not die on a bad file.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  BYTES_PER_GIGABYTE,
  DEFAULT_ACTIVE_POLL_INTERVAL_SECONDS,
  DEFAULT_HOST,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_SYNC_STALE_AFTER_MINUTES,
  DEFAULT_WARN_THRESHOLD_PERCENT,
  MIN_ACTIVE_POLL_INTERVAL_SECONDS,
  MIN_POLL_INTERVAL_SECONDS,
  defaultConfig,
} from "./defaults.js";
import type { AppConfig } from "./defaults.js";
import type { AllowanceAnchor } from "../domain/allowance.js";

/** A config value the app refuses to run on. `field` names the culprit. */
export class ConfigValidationError extends Error {
  readonly field: string;

  constructor(field: string, detail: string) {
    super(`${field}: ${detail}`);
    this.name = "ConfigValidationError";
    this.field = field;
  }
}

/** What {@link loadConfig} hands back: always a usable config, plus any complaint. */
export interface LoadedConfig {
  config: AppConfig;
  /** Set only when the stored file was unreadable or invalid. */
  problem?: string;
}

const MAX_WARN_THRESHOLD_PERCENT = 100;
const MIN_WARN_THRESHOLD_PERCENT = 1;

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ConfigValidationError(
      field,
      `expected a number, got ${formatValue(value)}`,
    );
  }

  return value;
}

function formatValue(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return "null";

  return typeof value;
}

/**
 * Converts a plan limit expressed in decimal GB to bytes, rejecting anything
 * that is not a plain non-negative number.
 */
export function gigabytesToBytes(gigabytes: number): number {
  const value = requireNumber(gigabytes, "planLimitGb");

  if (value < 0) {
    throw new ConfigValidationError("planLimitGb", "must not be negative");
  }

  return Math.round(value * BYTES_PER_GIGABYTE);
}

/**
 * Why a typed plan size could not be used. Kept as a token rather than a
 * sentence: the words the user reads are decided in `main/view-model.ts`, with
 * every other string the panel shows.
 */
export type PlanLimitRefusal = "blank" | "not-a-number" | "not-positive";

export type PlanLimitEntry =
  { ok: true; bytes: number } | { ok: false; reason: PlanLimitRefusal };

/**
 * A plan size as the user typed it into the panel — `"150"`, `"1.5"` — read as
 * decimal Go and converted to bytes here, at the boundary. The renderer sends
 * the characters and nothing else; this is the only place that knows a Go is
 * 1000³ bytes.
 *
 * Zero is refused even though {@link gigabytesToBytes} accepts it: zero is a
 * storable value but not a plan anyone bought, and a dial measured against it
 * has nothing to divide by.
 */
export function readPlanLimitEntry(text: string): PlanLimitEntry {
  const trimmed = text.trim();

  if (trimmed === "") {
    return { ok: false, reason: "blank" };
  }

  const value = Number(trimmed);

  if (!Number.isFinite(value)) {
    return { ok: false, reason: "not-a-number" };
  }

  if (value <= 0) {
    return { ok: false, reason: "not-positive" };
  }

  return { ok: true, bytes: gigabytesToBytes(value) };
}

/**
 * The inverse, for the field itself: `150_000_000_000` → `"150"`. Bare digits
 * rather than a formatted size, because it goes back into an input the user
 * edits — the unit belongs on the label beside it.
 */
export function planLimitInGigaoctets(bytes: number): string {
  return String(Number((bytes / BYTES_PER_GIGABYTE).toFixed(3)));
}

function readHost(raw: Record<string, unknown>): string {
  if (raw.host === undefined) return DEFAULT_HOST;

  if (typeof raw.host !== "string" || raw.host.trim() === "") {
    throw new ConfigValidationError(
      "host",
      "must be a non-empty router address",
    );
  }

  return raw.host.trim();
}

function readPollInterval(raw: Record<string, unknown>): number {
  if (raw.pollIntervalSeconds === undefined)
    return DEFAULT_POLL_INTERVAL_SECONDS;

  const seconds = requireNumber(raw.pollIntervalSeconds, "pollIntervalSeconds");

  if (seconds < MIN_POLL_INTERVAL_SECONDS) {
    throw new ConfigValidationError(
      "pollIntervalSeconds",
      `must be at least ${MIN_POLL_INTERVAL_SECONDS} seconds so the router is not hammered`,
    );
  }

  return seconds;
}

/**
 * The interval used while the panel is open. Bounded below by its own floor
 * rather than {@link MIN_POLL_INTERVAL_SECONDS} — being faster than the idle
 * interval is the entire point — and above by the idle interval itself, since
 * an "active" interval slower than the resting one is a typo, not a setting.
 */
function readActivePollInterval(
  raw: Record<string, unknown>,
  idleSeconds: number,
): number {
  if (raw.activePollIntervalSeconds === undefined)
    return DEFAULT_ACTIVE_POLL_INTERVAL_SECONDS;

  const seconds = requireNumber(
    raw.activePollIntervalSeconds,
    "activePollIntervalSeconds",
  );

  if (seconds < MIN_ACTIVE_POLL_INTERVAL_SECONDS) {
    throw new ConfigValidationError(
      "activePollIntervalSeconds",
      `must be at least ${MIN_ACTIVE_POLL_INTERVAL_SECONDS} second so the router is not hammered`,
    );
  }

  if (seconds > idleSeconds) {
    throw new ConfigValidationError(
      "activePollIntervalSeconds",
      `must not be slower than pollIntervalSeconds (${idleSeconds} seconds)`,
    );
  }

  return seconds;
}

function readWarnThreshold(raw: Record<string, unknown>): number {
  if (raw.warnThresholdPercent === undefined)
    return DEFAULT_WARN_THRESHOLD_PERCENT;

  const percent = requireNumber(
    raw.warnThresholdPercent,
    "warnThresholdPercent",
  );

  if (
    percent < MIN_WARN_THRESHOLD_PERCENT ||
    percent > MAX_WARN_THRESHOLD_PERCENT
  ) {
    throw new ConfigValidationError(
      "warnThresholdPercent",
      `must be between ${MIN_WARN_THRESHOLD_PERCENT} and ${MAX_WARN_THRESHOLD_PERCENT}`,
    );
  }

  return percent;
}

function readPlanLimit(raw: Record<string, unknown>): number | null {
  if (raw.planLimitBytes === undefined || raw.planLimitBytes === null)
    return null;

  const bytes = requireNumber(raw.planLimitBytes, "planLimitBytes");

  if (bytes < 0) {
    throw new ConfigValidationError("planLimitBytes", "must not be negative");
  }

  return bytes;
}

/**
 * How long the plan runs for, in whole days.
 *
 * Falls back to `null` rather than throwing, for the reason
 * {@link readSyncStaleAfter} does: an unusable period is the same as no period,
 * the pace band is already defined to be absent without one, and a typo here
 * must not cost the stored allowance anchor. Zero, a negative, and a fraction of
 * a day are all periods nothing can be divided by.
 */
function readPlanDays(raw: Record<string, unknown>): number | null {
  const days = raw.planDays;

  if (typeof days !== "number" || !Number.isInteger(days) || days <= 0) {
    return null;
  }

  return days;
}

/**
 * Whether the stored cap still describes the plan the carrier is reporting.
 *
 * Falls back to `true` rather than throwing, and for a reason opposite to
 * {@link readPlanDays}': the safe direction here is *not* asking. Anything but
 * a boolean is a file nobody wrote deliberately, and a panel demanding
 * confirmation of a cap the user never changed is the worse of the two
 * failures. It also means every config written before this field existed loads
 * unflagged.
 */
function readPlanCapConfirmed(raw: Record<string, unknown>): boolean {
  return typeof raw.planCapConfirmed === "boolean"
    ? raw.planCapConfirmed
    : true;
}

/**
 * The cap the app may actually measure against: the stored one, or none at all
 * while a sync has left it unconfirmed.
 *
 * The single rule the dial and the menu bar title both read, so neither can
 * quote a share the other has withdrawn. An unconfirmed cap reads as no cap,
 * which every consumer already knows how to render — the tier 1 pace stays,
 * the dial and the share do not.
 */
export function confirmedPlanLimit(config: AppConfig): number | null {
  // Only an explicit `false` withdraws the cap, mirroring
  // {@link readPlanCapConfirmed}'s own fallback: a config assembled without the
  // field is one written before it existed, not one a sync has contradicted.
  return config.planCapConfirmed === false ? null : config.planLimitBytes;
}

/**
 * Why a typed plan length could not be used. A token, not a sentence — the
 * words the user reads are decided in `main/view-model.ts`, beside every other
 * string the panel shows.
 */
export type PlanDaysRefusal =
  "blank" | "not-a-number" | "not-positive" | "not-whole";

export type PlanDaysEntry =
  { ok: true; days: number } | { ok: false; reason: PlanDaysRefusal };

/**
 * A plan length as the user typed it into the panel — `"30"`. Read here, at the
 * boundary, so the renderer sends the characters and works nothing out.
 *
 * A fraction is refused rather than rounded: the carrier sells whole days, and
 * a rounded period would silently disagree with the expiry date the pace is
 * measured back from.
 */
export function readPlanDaysEntry(text: string): PlanDaysEntry {
  const trimmed = text.trim();

  if (trimmed === "") {
    return { ok: false, reason: "blank" };
  }

  const value = Number(trimmed);

  if (!Number.isFinite(value)) {
    return { ok: false, reason: "not-a-number" };
  }

  if (value <= 0) {
    return { ok: false, reason: "not-positive" };
  }

  if (!Number.isInteger(value)) {
    return { ok: false, reason: "not-whole" };
  }

  return { ok: true, days: value };
}

/**
 * How stale a carrier reading may get before the app re-anchors it.
 *
 * The only setting that falls back rather than throwing. Every other bounded
 * value takes the whole config down with it, which is right for a router
 * address but wrong here: a hand-typed `0` would discard the stored allowance
 * anchor along with it, and recovering that costs a full USSD dialogue and a
 * login against a device that locks after five refusals. A window nobody can
 * use is simply the default window.
 */
function readSyncStaleAfter(raw: Record<string, unknown>): number {
  const minutes = raw.syncStaleAfterMinutes;

  if (
    typeof minutes !== "number" ||
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    return DEFAULT_SYNC_STALE_AFTER_MINUTES;
  }

  return minutes;
}

/**
 * Reads one of the two credential fields. Both are optional — every config file
 * written before the router needed a login is still valid — but a field that is
 * present has to be a real non-empty string, since a blank blob or username is
 * indistinguishable from a corrupted one.
 */
function readCredentialField(
  raw: Record<string, unknown>,
  field: "routerUsername" | "routerPasswordBlob",
): string | undefined {
  const value = raw[field];

  if (value === undefined) return undefined;

  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigValidationError(
      field,
      `must be a non-empty string, got ${formatValue(value)}`,
    );
  }

  return value;
}

function requireNonNegative(value: unknown, field: string): number {
  const bytes = requireNumber(value, field);

  if (bytes < 0) {
    throw new ConfigValidationError(field, "must not be negative");
  }

  return bytes;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ConfigValidationError(
      field,
      `expected a string, got ${formatValue(value)}`,
    );
  }

  return value;
}

/**
 * A date as it survives a round trip: a `Date` on the way in from a live
 * config, an ISO string on the way back off disk. Anything that does not parse
 * is rejected rather than silently becoming an Invalid Date, which would make
 * every expiry comparison read as false.
 */
function requireDate(value: unknown, field: string): Date {
  const date =
    value instanceof Date ? value : new Date(requireString(value, field));

  if (Number.isNaN(date.getTime())) {
    throw new ConfigValidationError(
      field,
      `expected a date, got ${formatValue(value)}`,
    );
  }

  return date;
}

/**
 * Reads the anchored allowance. Absent is the normal state — every config file
 * written before the first sync is still valid — but a stored anchor has to be
 * complete: a half-read one would carry the wrong volume forward for days.
 */
function readAllowanceAnchor(
  raw: Record<string, unknown>,
): AllowanceAnchor | undefined {
  const value = raw.allowanceAnchor;

  if (value === undefined || value === null) return undefined;

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ConfigValidationError(
      "allowanceAnchor",
      `expected an object, got ${formatValue(value)}`,
    );
  }

  const anchor = value as Record<string, unknown>;
  const expiresAt = anchor.expiresAt;

  return {
    planLabel: requireString(anchor.planLabel, "allowanceAnchor.planLabel"),
    remainingBytes: requireNonNegative(
      anchor.remainingBytes,
      "allowanceAnchor.remainingBytes",
    ),
    expiresAt:
      expiresAt === null || expiresAt === undefined
        ? null
        : requireDate(expiresAt, "allowanceAnchor.expiresAt"),
    routerMonthBytes: requireNonNegative(
      anchor.routerMonthBytes,
      "allowanceAnchor.routerMonthBytes",
    ),
    routerClearTime: requireString(
      anchor.routerClearTime,
      "allowanceAnchor.routerClearTime",
    ),
    syncedAt: requireDate(anchor.syncedAt, "allowanceAnchor.syncedAt"),
  };
}

/**
 * Validates arbitrary parsed JSON into an {@link AppConfig}, filling absent
 * fields from the defaults. Throws {@link ConfigValidationError} on a value
 * that is present but wrong.
 */
export function parseConfig(raw: unknown): AppConfig {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new ConfigValidationError(
      "config",
      `expected a JSON object, got ${formatValue(raw)}`,
    );
  }

  const record = raw as Record<string, unknown>;
  const pollIntervalSeconds = readPollInterval(record);
  const routerUsername = readCredentialField(record, "routerUsername");
  const routerPasswordBlob = readCredentialField(record, "routerPasswordBlob");
  // `planTotalBytes` is read by nothing: it held a high-water plan total that
  // the dial no longer measures against. Files the app wrote still carry it, so
  // it is dropped on the way through rather than rejected.
  const allowanceAnchor = readAllowanceAnchor(record);

  return {
    host: readHost(record),
    pollIntervalSeconds,
    activePollIntervalSeconds: readActivePollInterval(
      record,
      pollIntervalSeconds,
    ),
    warnThresholdPercent: readWarnThreshold(record),
    planLimitBytes: readPlanLimit(record),
    planDays: readPlanDays(record),
    planCapConfirmed: readPlanCapConfirmed(record),
    syncStaleAfterMinutes: readSyncStaleAfter(record),
    ...(routerUsername === undefined ? {} : { routerUsername }),
    ...(routerPasswordBlob === undefined ? {} : { routerPasswordBlob }),
    ...(allowanceAnchor === undefined ? {} : { allowanceAnchor }),
  };
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === "ENOENT";
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Loads the config at `path`. A missing file is normal and yields the defaults
 * silently; an unreadable or invalid one yields the defaults plus a `problem`
 * describing what went wrong.
 */
export function loadConfig(path: string): LoadedConfig {
  let text: string;

  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    if (isMissingFile(error)) return { config: defaultConfig() };

    return {
      config: defaultConfig(),
      problem: `could not read ${path}: ${messageOf(error)}`,
    };
  }

  try {
    return { config: parseConfig(JSON.parse(text)) };
  } catch (error) {
    return {
      config: defaultConfig(),
      problem: `ignoring ${path}: ${messageOf(error)}`,
    };
  }
}

/**
 * Writes `config` to `path`, creating the containing directory if needed. The
 * config is validated first, so an invalid one never reaches disk.
 */
export function saveConfig(path: string, config: AppConfig): void {
  const validated = parseConfig(config);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
}
