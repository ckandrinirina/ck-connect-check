/**
 * Reading and writing the one JSON file the app persists.
 *
 * Every path is injected: nothing here reaches for the user directory on its
 * own, so tests run entirely inside a temp folder. A config that cannot be read
 * is never fatal — the app falls back to the defaults and reports what was
 * wrong, because an unattended menu bar app must not die on a bad file.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import {
  BYTES_PER_GIGABYTE,
  DEFAULT_HOST,
  DEFAULT_POLL_INTERVAL_SECONDS,
  DEFAULT_WARN_THRESHOLD_PERCENT,
  MIN_POLL_INTERVAL_SECONDS,
  defaultConfig,
} from './defaults.js';
import type { AppConfig } from './defaults.js';

/** A config value the app refuses to run on. `field` names the culprit. */
export class ConfigValidationError extends Error {
  readonly field: string;

  constructor(field: string, detail: string) {
    super(`${field}: ${detail}`);
    this.name = 'ConfigValidationError';
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
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ConfigValidationError(field, `expected a number, got ${formatValue(value)}`);
  }

  return value;
}

function formatValue(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';

  return typeof value;
}

/**
 * Converts a plan limit expressed in decimal GB to bytes, rejecting anything
 * that is not a plain non-negative number.
 */
export function gigabytesToBytes(gigabytes: number): number {
  const value = requireNumber(gigabytes, 'planLimitGb');

  if (value < 0) {
    throw new ConfigValidationError('planLimitGb', 'must not be negative');
  }

  return Math.round(value * BYTES_PER_GIGABYTE);
}

function readHost(raw: Record<string, unknown>): string {
  if (raw.host === undefined) return DEFAULT_HOST;

  if (typeof raw.host !== 'string' || raw.host.trim() === '') {
    throw new ConfigValidationError('host', 'must be a non-empty router address');
  }

  return raw.host.trim();
}

function readPollInterval(raw: Record<string, unknown>): number {
  if (raw.pollIntervalSeconds === undefined) return DEFAULT_POLL_INTERVAL_SECONDS;

  const seconds = requireNumber(raw.pollIntervalSeconds, 'pollIntervalSeconds');

  if (seconds < MIN_POLL_INTERVAL_SECONDS) {
    throw new ConfigValidationError(
      'pollIntervalSeconds',
      `must be at least ${MIN_POLL_INTERVAL_SECONDS} seconds so the router is not hammered`,
    );
  }

  return seconds;
}

function readWarnThreshold(raw: Record<string, unknown>): number {
  if (raw.warnThresholdPercent === undefined) return DEFAULT_WARN_THRESHOLD_PERCENT;

  const percent = requireNumber(raw.warnThresholdPercent, 'warnThresholdPercent');

  if (percent < MIN_WARN_THRESHOLD_PERCENT || percent > MAX_WARN_THRESHOLD_PERCENT) {
    throw new ConfigValidationError(
      'warnThresholdPercent',
      `must be between ${MIN_WARN_THRESHOLD_PERCENT} and ${MAX_WARN_THRESHOLD_PERCENT}`,
    );
  }

  return percent;
}

function readPlanLimit(raw: Record<string, unknown>): number | null {
  if (raw.planLimitBytes === undefined || raw.planLimitBytes === null) return null;

  const bytes = requireNumber(raw.planLimitBytes, 'planLimitBytes');

  if (bytes < 0) {
    throw new ConfigValidationError('planLimitBytes', 'must not be negative');
  }

  return bytes;
}

/**
 * Validates arbitrary parsed JSON into an {@link AppConfig}, filling absent
 * fields from the defaults. Throws {@link ConfigValidationError} on a value
 * that is present but wrong.
 */
export function parseConfig(raw: unknown): AppConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigValidationError('config', `expected a JSON object, got ${formatValue(raw)}`);
  }

  const record = raw as Record<string, unknown>;

  return {
    host: readHost(record),
    pollIntervalSeconds: readPollInterval(record),
    warnThresholdPercent: readWarnThreshold(record),
    planLimitBytes: readPlanLimit(record),
  };
}

function isMissingFile(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
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
    text = readFileSync(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) return { config: defaultConfig() };

    return { config: defaultConfig(), problem: `could not read ${path}: ${messageOf(error)}` };
  }

  try {
    return { config: parseConfig(JSON.parse(text)) };
  } catch (error) {
    return { config: defaultConfig(), problem: `ignoring ${path}: ${messageOf(error)}` };
  }
}

/**
 * Writes `config` to `path`, creating the containing directory if needed. The
 * config is validated first, so an invalid one never reaches disk.
 */
export function saveConfig(path: string, config: AppConfig): void {
  const validated = parseConfig(config);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(validated, null, 2)}\n`, 'utf8');
}
