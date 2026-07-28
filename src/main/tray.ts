/**
 * What the menu bar says. Pure — a snapshot and the config go in, a string
 * comes out; nothing here touches Electron, the network or the clock, so every
 * rendering case is testable without a router or a screen.
 *
 * The title is deliberately terse. macOS gives a tray item as much width as it
 * asks for, and a long title pushes every other menu bar item aside, so the
 * rendering is capped at {@link MAX_TRAY_TITLE_LENGTH} characters.
 */

import { formatBytes, formatPercent } from "../domain/format.js";
import { percentUsed, totalUsedBytes, usageState } from "../domain/quota.js";
import type { AppConfig } from "../config/defaults.js";
import type { SnapshotResult } from "../hilink/client.js";

/** The widest the title may ever be. See the note above on menu bar crowding. */
export const MAX_TRAY_TITLE_LENGTH = 12;

/** An unreachable router is a normal state, not an error — this is how it reads. */
export const OFFLINE_TRAY_TITLE = "offline";

/** Separates the used total from the percentage: `5.8G · 29%`. */
const SEPARATOR = " · ";

/**
 * Stands in for the separator once usage reaches the warn threshold:
 * `18G ⚠ 90%`. It replaces {@link SEPARATOR} rather than being added to the
 * title so the warning costs no width at all — see the note above on the cap.
 */
export const TRAY_WARN_MARKER = "⚠";

const WARN_SEPARATOR = ` ${TRAY_WARN_MARKER} `;

/**
 * Beyond this the percentage is meaningless (it means the plan limit is wrong)
 * and a longer number would break the width cap, so the display stops here.
 */
const MAX_DISPLAYED_PERCENT = 999;

/** `formatBytes` units shortened to the single letter the menu bar has room for. */
const UNIT_LETTERS: Record<string, string> = {
  B: "B",
  kB: "k",
  MB: "M",
  GB: "G",
  TB: "T",
};

/**
 * The compact tray spelling of a byte count: `5_830_718_387` → `"5.8G"`.
 *
 * It reuses {@link formatBytes} so the tray and the popover scale identically —
 * decimal (1000³), never binary — and then trims the result to tray width: one
 * decimal below ten, none above, and whole bytes are never fractional.
 */
function compactBytes(bytes: number): string {
  const [amount, unit] = formatBytes(bytes).split(" ");

  if (unit === undefined) {
    return amount;
  }

  const value = Number(amount);
  const letter = UNIT_LETTERS[unit] ?? unit;

  if (unit === "B" || value >= 10) {
    return `${Math.round(value)}${letter}`;
  }

  // `5.83` reads `5.8`, but `9.00` reads `9` — a trailing `.0` is only noise.
  return `${value.toFixed(1).replace(/\.0$/, "")}${letter}`;
}

/**
 * The menu bar title for one poll result.
 *
 * Online with a plan limit reads `"5.8G · 29%"`; online without one reads the
 * used total alone, because there is no percentage to show until the user sets
 * a limit; offline reads {@link OFFLINE_TRAY_TITLE}.
 *
 * At or above the configured warn threshold the separator becomes
 * {@link TRAY_WARN_MARKER} — `"18G ⚠ 90%"` — so the menu bar says the plan is
 * running out without saying it any wider.
 */
export function buildTrayTitle(
  result: SnapshotResult,
  config: AppConfig,
): string {
  if (!result.online) {
    return OFFLINE_TRAY_TITLE;
  }

  const { monthDownloadBytes, monthUploadBytes } = result.snapshot.month;
  const used = totalUsedBytes(monthDownloadBytes, monthUploadBytes);
  const percent = percentUsed(used, config.planLimitBytes);

  if (percent === null) {
    return compactBytes(used);
  }

  const separator =
    usageState(percent, config.warnThresholdPercent) === "ok"
      ? SEPARATOR
      : WARN_SEPARATOR;

  return `${compactBytes(used)}${separator}${formatPercent(Math.min(percent, MAX_DISPLAYED_PERCENT))}`;
}
