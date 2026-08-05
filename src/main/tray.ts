/**
 * What the menu bar says. Pure — a snapshot, the config and whatever the Orange
 * portal last said go in, a string comes out; nothing here touches Electron, the
 * network or the clock, so every rendering case is testable without a router or
 * a screen.
 *
 * The title is deliberately terse. macOS gives a tray item as much width as it
 * asks for, and a long title pushes every other menu bar item aside, so the
 * rendering is capped at {@link MAX_TRAY_TITLE_LENGTH} characters.
 */

import { confirmedPlanLimit } from "../config/config.js";
import { readPlanUsage } from "../domain/allowance.js";
import { formatBytes, formatPercent } from "../domain/format.js";
import { readMonthlyPace } from "../domain/pace.js";
import { systemClock, usageState, type Clock } from "../domain/quota.js";
import type { AppConfig } from "../config/defaults.js";
import type { SnapshotResult } from "../hilink/client.js";
import type { RouterSnapshot } from "../hilink/types.js";
import type { PortalStatus } from "./poller.js";

/**
 * The widest the title is built to be. See the note above on menu bar crowding.
 *
 * Every figure the two carriers can honestly produce fits it, overruns included
 * — the one exception being a cap mistyped an order of magnitude below what has
 * already been spent, where the exact share is kept and the width is what gives.
 */
export const MAX_TRAY_TITLE_LENGTH = 12;

/** An unreachable router is a normal state, not an error — this is how it reads. */
export const OFFLINE_TRAY_TITLE = "offline";

/**
 * Shown when there is no share to show — nothing synced, no plan limit set, or
 * an anchor that has gone stale. The same dash the popover uses for a missing
 * value, so the two never disagree about what "unknown" looks like.
 */
export const NO_TRAY_VALUE = "—";

/**
 * The right-click entry that reaches the device list, shared so the menu and
 * the tests agree on one spelling.
 *
 * It used to open a window of its own. It opens the panel on its Devices tab
 * now, and keeps its trailing ellipsis because the destination is still
 * somewhere else — one right-click and one item is the fastest route to the
 * list, and that has not changed even though the surface has.
 */
export const DEVICES_MENU_LABEL = "Connected devices…";

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
 * What the menu bar has to say, whichever carrier said it.
 *
 * The two halves are deliberately independent. Every carrier states a consumed
 * volume one way or another, and none of them states the cap — so a share is
 * the half that can go missing, and the volume is the half that survives.
 */
interface TrayReading {
  usedBytes: number;
  /** Share of the plan used, or null when no cap has been set. */
  percent: number | null;
}

/**
 * The YAS reading: the plan the user bought, less what the carrier says is
 * left. Null wherever the popover's dial is null — nothing synced, no cap, or
 * an anchor the router's counter has contradicted.
 */
function anchoredReading(
  config: AppConfig,
  month: RouterSnapshot["month"],
  clock: Clock,
): TrayReading | null {
  const reading = readPlanUsage(
    config.allowanceAnchor,
    month,
    // The same rule the dial follows: a cap a sync has contradicted counts as
    // no cap, so the menu bar never quotes a share the panel has withdrawn.
    confirmedPlanLimit(config),
    clock,
  );
  const percent = reading?.percentUsed ?? null;

  if (percent === null || reading?.usedBytes == null) {
    return null;
  }

  return { usedBytes: reading.usedBytes, percent };
}

/**
 * The Orange reading: the volume the portal says has been spent, and its share
 * of the typed cap. Null only when there is no figure at all — the portal has
 * never answered, the page listed no data forfait, or the forfait it listed
 * stated no volume.
 *
 * A cap-less reading is *not* null. Orange states consumption outright, so the
 * volume stands on its own, and a menu bar showing it says more than a dash.
 * There is no fallback to the router's month counter for the missing half
 * either: the two count different traffic — 51.1 Go against the portal's 7.37
 * on the same day — and a share built from both would be confidently wrong.
 */
function portalReading(
  portal: PortalStatus | undefined,
  config: AppConfig,
  clock: Clock,
): TrayReading | null {
  const consumedBytes = portal?.reading?.forfait?.consumedBytes ?? null;

  if (consumedBytes === null) {
    return null;
  }

  // The same reading the panel's dial is drawn from, so the two cannot disagree.
  const reading = readMonthlyPace({
    consumedBytes,
    planLimitBytes: confirmedPlanLimit(config),
    clock,
  });

  return {
    usedBytes: reading.usedBytes,
    percent: reading.usedShare === null ? null : reading.usedShare * 100,
  };
}

/**
 * One reading, spelled for the menu bar. With a share it reads `"8Go · 40%"`;
 * without one the volume is the whole title, because a percentage of nothing is
 * the invention the dash exists to refuse.
 */
function render(reading: TrayReading, warnThresholdPercent: number): string {
  const used = compactBytes(reading.usedBytes);

  if (reading.percent === null) {
    return used;
  }

  const separator =
    usageState(reading.percent, warnThresholdPercent) === "ok"
      ? SEPARATOR
      : WARN_SEPARATOR;

  return `${used}${separator}${formatPercent(reading.percent)}`;
}

/**
 * The menu bar title for one poll result.
 *
 * The figures come from the same reading the popover's half is built from — the
 * anchor on YAS, the portal page on Orange — so the menu bar and the panel can
 * never quote different figures. `"8Go · 40%"` reads as "8 Go of the plan gone,
 * which is 40% of it"; offline reads {@link OFFLINE_TRAY_TITLE}.
 *
 * With no figure behind it at all the title is {@link NO_TRAY_VALUE}. There is
 * deliberately no fallback to the router's own month counter: a menu bar quoting
 * a figure the panel has withdrawn is worse than one saying nothing, and the
 * panel explains the gap when it is opened.
 *
 * At or above the configured warn threshold the separator becomes
 * {@link TRAY_WARN_MARKER} — `"18Go ⚠ 90%"` — so the menu bar says the plan is
 * running out without saying it any wider.
 */
export function buildTrayTitle(
  result: SnapshotResult,
  config: AppConfig,
  clock: Clock = systemClock,
  /** Where the Orange portal stands. Ignored on every other network. */
  portal?: PortalStatus,
): string {
  if (!result.online) {
    return OFFLINE_TRAY_TITLE;
  }

  // The same branch the panel makes, and a fact about the SIM rather than a
  // display decision: on Orange the figure comes from a page fetched on the
  // poll, and everywhere else from the anchor a dialogue left behind.
  const reading =
    result.snapshot.carrier.id === "orange"
      ? portalReading(portal, config, clock)
      : anchoredReading(config, result.snapshot.month, clock);

  return reading === null
    ? NO_TRAY_VALUE
    : render(reading, config.warnThresholdPercent);
}
