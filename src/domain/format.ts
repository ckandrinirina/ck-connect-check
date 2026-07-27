/**
 * Display formatters. Pure — no I/O, no Electron, no network.
 *
 * Sizes are decimal (1000³), never binary: carriers bill in decimal GB and the
 * number on screen has to match the number on the plan.
 */

const BYTE_UNITS = ['B', 'kB', 'MB', 'GB', 'TB'] as const;
const RATE_UNITS = ['B/s', 'KB/s', 'MB/s', 'GB/s'] as const;

/** Shown wherever a value is unknown — an unset plan limit, mostly. */
const NO_VALUE = '—';

function scale(value: number, units: readonly string[]): { value: number; unit: string } {
  let scaled = value;
  let index = 0;
  while (Math.abs(scaled) >= 1000 && index < units.length - 1) {
    scaled /= 1000;
    index += 1;
  }
  return { value: scaled, unit: units[index] };
}

/** `4427475340` → `"4.43 GB"`, `1024` → `"1.02 kB"`. Whole bytes below a kilobyte. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) {
    return NO_VALUE;
  }
  const { value, unit } = scale(bytes, BYTE_UNITS);
  return `${value.toFixed(unit === 'B' ? 0 : 2)} ${unit}`;
}

/** Bytes per second → `"2.3 KB/s"`; a zero rate reads `"0 B/s"`, not `"0.0 B/s"`. */
export function formatRate(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond)) {
    return NO_VALUE;
  }
  const { value, unit } = scale(bytesPerSecond, RATE_UNITS);
  return `${value.toFixed(unit === 'B/s' ? 0 : 1)} ${unit}`;
}

/** Seconds → `"7h 46m"`, falling back to `"46m"` then `"45s"` for short spans. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds)) {
    return NO_VALUE;
  }
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${total}s`;
}

/**
 * Rounds the exact percentage from `quota.ts` for display only — `29.153…`
 * reads `"29%"`. `null` (no plan limit configured) reads as a dash, and a
 * value above 100 is shown as-is rather than clamped.
 */
export function formatPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) {
    return NO_VALUE;
  }
  return `${Math.round(percent)}%`;
}
