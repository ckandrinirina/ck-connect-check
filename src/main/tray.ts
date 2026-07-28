/**
 * What the menu bar says. Pure — a snapshot and the config go in, a string
 * comes out; nothing here touches Electron, the network or the clock, so every
 * rendering case is testable without a router or a screen.
 *
 * The title is deliberately terse. macOS gives a tray item as much width as it
 * asks for, and a long title pushes every other menu bar item aside, so the
 * rendering is capped at {@link MAX_TRAY_TITLE_LENGTH} characters.
 */

import { readPlanUsage } from "../domain/allowance.js";
import { formatBytes, formatPercent } from "../domain/format.js";
import { systemClock, usageState, type Clock } from "../domain/quota.js";
import type { AppConfig } from "../config/defaults.js";
import type { SnapshotResult } from "../hilink/client.js";

/** The widest the title may ever be. See the note above on menu bar crowding. */
export const MAX_TRAY_TITLE_LENGTH = 12;

/** An unreachable router is a normal state, not an error — this is how it reads. */
export const OFFLINE_TRAY_TITLE = "offline";

/**
 * Shown when there is no share to show — nothing synced, no plan limit set, or
 * an anchor that has gone stale. The same dash the popover uses for a missing
 * value, so the two never disagree about what "unknown" looks like.
 */
export const NO_TRAY_VALUE = "—";

/** Separates the used total from the percentage: `5.8G · 29%`. */
const SEPARATOR = " · ";

/**
 * Stands in for the separator once usage reaches the warn threshold:
 * `18G ⚠ 90%`. It replaces {@link SEPARATOR} rather than being added to the
 * title so the warning costs no width at all — see the note above on the cap.
 */
export const TRAY_WARN_MARKER = "⚠";

const WARN_SEPARATOR = ` ${TRAY_WARN_MARKER} `;

/** The octet unit that alone is never rendered with a decimal. */
const BASE_BYTE_UNIT = "o";

/**
 * The compact tray spelling of a byte count: `5_830_718_387` → `"5.8Go"`.
 *
 * It reuses {@link formatBytes} so the tray and the popover scale identically —
 * decimal (1000³), never binary, in octets — and then trims the result to tray
 * width: one decimal below ten, none above, and whole octets are never
 * fractional. The unit itself is kept whole rather than abbreviated further:
 * `"999Go ⚠ 100%"` is the widest title this can produce, and that is exactly
 * {@link MAX_TRAY_TITLE_LENGTH} characters.
 */
function compactBytes(bytes: number): string {
  const [amount, unit] = formatBytes(bytes).split(" ");

  if (unit === undefined) {
    return amount;
  }

  const value = Number(amount);

  if (unit === BASE_BYTE_UNIT || value >= 10) {
    return `${Math.round(value)}${unit}`;
  }

  // `5.83` reads `5.8`, but `9.00` reads `9` — a trailing `.0` is only noise.
  return `${value.toFixed(1).replace(/\.0$/, "")}${unit}`;
}

/**
 * The menu bar title for one poll result.
 *
 * Both halves come from the same reading the popover's dial does — the plan the
 * user bought, less what the carrier says is left — so the menu bar and the
 * panel can never quote different figures. `"8Go · 40%"` reads as "8 Go of the
 * plan gone, which is 40% of it"; offline reads {@link OFFLINE_TRAY_TITLE}.
 *
 * With nothing synced, no plan limit set, or an anchor gone stale, the title is
 * {@link NO_TRAY_VALUE}. There is deliberately no fallback to the router's own
 * month counter: a menu bar quoting a figure the panel has withdrawn is worse
 * than one saying nothing, and the panel explains the gap when it is opened.
 *
 * At or above the configured warn threshold the separator becomes
 * {@link TRAY_WARN_MARKER} — `"18Go ⚠ 90%"` — so the menu bar says the plan is
 * running out without saying it any wider.
 */
export function buildTrayTitle(
  result: SnapshotResult,
  config: AppConfig,
  clock: Clock = systemClock,
): string {
  if (!result.online) {
    return OFFLINE_TRAY_TITLE;
  }

  const reading = readPlanUsage(
    config.allowanceAnchor,
    result.snapshot.month,
    config.planLimitBytes,
    clock,
  );
  const percent = reading?.percentUsed ?? null;

  if (percent === null || reading?.usedBytes == null) {
    return NO_TRAY_VALUE;
  }

  const separator =
    usageState(percent, config.warnThresholdPercent) === "ok"
      ? SEPARATOR
      : WARN_SEPARATOR;

  return `${compactBytes(reading.usedBytes)}${separator}${formatPercent(percent)}`;
}
