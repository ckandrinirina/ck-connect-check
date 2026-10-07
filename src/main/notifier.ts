/**
 * Forfait notifications: runs the alert decision on each poll and turns what it
 * says is due into macOS notifications.
 *
 * Electron never appears here — the notification is built by an injected
 * factory, so tests count what would have been shown without showing anything.
 * What has been sent is written to `config.json`, keyed by the period end, so a
 * relaunch at login repeats none of it.
 */

import { confirmedPlanLimit, saveConfig } from "../config/config.js";
import type { AppConfig } from "../config/defaults.js";
import {
  NOTHING_ANNOUNCED,
  alertPeriodEnd,
  decideAlerts,
  type AlertNotification,
  type AlertReading,
  type AnnouncedAlerts,
} from "../domain/alerts.js";
import { readPlanUsage } from "../domain/allowance.js";
import { formatBytes, formatPercent } from "../domain/format.js";
import { readMonthlyPace } from "../domain/pace.js";
import { systemClock, type Clock } from "../domain/quota.js";
import type { RouterSnapshot } from "../hilink/types.js";
import type { PortalStatus } from "./poller.js";
import type { Popover } from "./popover.js";

/** What one notification says. */
export interface NotificationContent {
  title: string;
  body: string;
}

/** The slice of Electron's `Notification` used here. */
export interface ShownNotification {
  on(event: "click" | "close", listener: () => void): void;
  show(): void;
}

export type NotificationFactory = (
  content: NotificationContent,
) => ShownNotification;

/** The figures the decision runs on. */
export interface AlertSituation {
  reading: AlertReading;
  periodEnd: Date | null;
}

export interface NotifierOptions {
  /** The live config; its announced record is updated in place. */
  config: AppConfig;
  configPath: string;
  createNotification: NotificationFactory;
  /** Where a click lands. */
  panel: Pick<Popover, "showTab" | "show">;
  clock?: Clock;
  warn?: (message: string) => void;
}

export interface Notifier {
  /** One poll tick: decide, notify what is due, record it. */
  check(situation: AlertSituation): void;
}

export interface AlertSituationInput {
  config: AppConfig;
  /** The last reading the router gave, if any. */
  snapshot: RouterSnapshot | undefined;
  portal: PortalStatus;
  clock?: Clock;
}

/**
 * The figures the alert decision needs, read the way the panel reads them: on
 * Orange from the portal against the calendar month, elsewhere from the anchor
 * carried forward and its expiry.
 */
export function alertSituation(input: AlertSituationInput): AlertSituation {
  const { config, snapshot } = input;
  const clock = input.clock ?? systemClock;
  const planLimitBytes = confirmedPlanLimit(config);
  const carrier = snapshot?.carrier.id ?? "unknown";

  if (carrier === "orange") {
    const consumedBytes = input.portal.reading?.forfait?.consumedBytes;

    return {
      reading: {
        remainingBytes:
          consumedBytes === undefined
            ? null
            : readMonthlyPace({ consumedBytes, planLimitBytes, clock })
                .remainingBytes,
        planLimitBytes,
      },
      periodEnd: alertPeriodEnd({ carrier }, clock),
    };
  }

  const usage =
    snapshot === undefined
      ? null
      : readPlanUsage(
          config.allowanceAnchor,
          snapshot.month,
          planLimitBytes,
          clock,
        );

  return {
    reading: { remainingBytes: usage?.remainingBytes ?? null, planLimitBytes },
    periodEnd:
      carrier === "yas"
        ? alertPeriodEnd(
            { carrier, expiresAt: config.allowanceAnchor?.expiresAt ?? null },
            clock,
          )
        : null,
  };
}

function contentFor(
  notification: AlertNotification,
  reading: AlertReading,
): NotificationContent {
  if (notification.kind === "low") {
    // The decision only calls a forfait low when both figures are known.
    const remaining = reading.remainingBytes ?? 0;
    const cap = reading.planLimitBytes ?? 0;

    return {
      title: "Forfait running low",
      body: `${formatBytes(remaining)} left — ${formatPercent((remaining / cap) * 100)} of the plan.`,
    };
  }

  const { count, unit } = notification.before;

  return {
    title: "Forfait ending soon",
    body: `${String(count)} ${unit} left on the forfait.`,
  };
}

/** An empty set is the same whatever period it names — nothing to write. */
function sameAnnounced(a: AnnouncedAlerts, b: AnnouncedAlerts): boolean {
  if (a.ids.length === 0 && b.ids.length === 0) return true;

  return JSON.stringify(a) === JSON.stringify(b);
}

export function createNotifier(options: NotifierOptions): Notifier {
  const { config, configPath, createNotification, panel } = options;
  const clock = options.clock ?? systemClock;
  const warn =
    options.warn ??
    ((message: string) => {
      console.warn(message);
    });

  // Held until clicked or closed: macOS drops the click of a notification
  // whose object has been garbage-collected.
  const live = new Set<ShownNotification>();

  function show(content: NotificationContent): void {
    try {
      const notification = createNotification(content);
      const release = (): void => {
        live.delete(notification);
      };

      notification.on("click", () => {
        release();
        panel.showTab("usage");
        panel.show();
      });
      notification.on("close", release);
      notification.show();
      live.add(notification);
    } catch (error) {
      warn(
        `could not show the "${content.title}" notification: ${String(error)}`,
      );
    }
  }

  return {
    check(situation) {
      const before = config.announcedAlerts ?? NOTHING_ANNOUNCED;
      const decision = decideAlerts({
        reading: situation.reading,
        periodEnd: situation.periodEnd,
        announced: before,
        clock,
      });

      for (const notification of decision.notifications) {
        show(contentFor(notification, situation.reading));
      }

      if (!sameAnnounced(decision.announced, before)) {
        config.announcedAlerts = decision.announced;

        try {
          saveConfig(configPath, config);
        } catch (error) {
          warn(`could not record the announced alerts: ${String(error)}`);
        }
      }
    },
  };
}
