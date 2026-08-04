/**
 * The poll loop that keeps the menu bar current.
 *
 * Two behaviours matter more than the polling itself. A single failed poll
 * keeps the last good title rather than blanking the menu bar — a router that
 * misses one reply has not changed anything the user needs to know. Only when
 * failures repeat does the title admit the router is unreachable.
 *
 * Each poll schedules the next one after it settles, rather than firing on a
 * fixed interval, so a slow reply can never stack two requests on the router.
 *
 * There are two cadences rather than one. A menu bar title is happy with a
 * reading every half minute; the rate readout behind it is not, so
 * {@link UsagePoller.setActive} switches to a much shorter interval for as long
 * as the panel is open.
 *
 * On Orange there is a second source alongside the router, and it runs on its
 * own timer rather than as part of the poll: the selfcare portal answers a page
 * of about 38 KB, which is not something to ask for every two seconds because
 * someone opened the panel. So it keeps the slow interval whatever the router
 * is doing, and the last reading stands in between — consumption moves in
 * minutes, and the fast cadence exists for the throughput sparkline, which
 * comes from the router.
 *
 * The two sources fail independently, and are reported that way. A router that
 * has stopped answering says nothing about a portal that is still answering,
 * and a portal that is out of reach usually means the machine is on some other
 * network, where the router is perfectly fine.
 */

import type { AppConfig } from "../config/defaults.js";
import { readPlanUsage } from "../domain/allowance.js";
import type { Carrier } from "../domain/carrier.js";
import {
  systemClock,
  usageState,
  type Clock,
  type UsageState,
} from "../domain/quota.js";
import type { HostListResult, SnapshotResult } from "../hilink/client.js";
import type { OrangePortalResult } from "../orange/portal.js";
import { selectForfait } from "../orange/select.js";
import type { OrangeForfait } from "../orange/types.js";
import { buildTrayTitle } from "./tray.js";

/** Shown between launch and the first reading — no data yet, and no failure yet. */
export const STARTUP_TRAY_TITLE = "…";

/**
 * Consecutive failures tolerated before the title goes offline. One dropped
 * poll is noise; two in a row means the router really is not answering.
 */
export const FAILURES_BEFORE_OFFLINE = 2;

/** The slice of the router client the poller needs — a stub satisfies it in tests. */
export interface SnapshotSource {
  snapshot(): Promise<SnapshotResult>;
}

/** The slice of the Orange boundary the poller needs — a stub satisfies it in tests. */
export interface PortalSource {
  read(): Promise<OrangePortalResult>;
}

/** The slice of the router the device list needs — a stub satisfies it in tests. */
export interface HostListSource {
  hosts(): Promise<HostListResult>;
}

/**
 * One reading of the Orange portal, already narrowed to the forfait the meter
 * measures. The selection is made here rather than in the panel so that every
 * poll measures the same plan, and so the panel is handed a figure rather than
 * a page.
 */
export interface PortalReading {
  /** The forfait being measured, or null when the page listed no data plan. */
  forfait: OrangeForfait | null;
  /** Everything the user could plausibly be offered instead, in page order. */
  candidates: OrangeForfait[];
  /** Whether {@link PortalReading.forfait} is the user's remembered choice. */
  remembered: boolean;
  /** When it was read — the panel measures the figure's age from here. */
  at: Date;
}

/**
 * Where the portal stands, kept apart from where the router stands.
 *
 * {@link PortalStatus.reading} survives a failed fetch on purpose: the last
 * figure the carrier gave is still the best answer there is, and losing it
 * every time a laptop moves to another network would make the allowance blink
 * rather than age.
 */
export interface PortalStatus {
  /** The last successful reading, reused between fetches. Null before the first. */
  reading: PortalReading | null;
  /** Whether the most recent attempt answered. False before the first, too. */
  live: boolean;
}

export interface UsagePollerOptions {
  client: SnapshotSource;
  config: AppConfig;
  /**
   * The Orange portal. Absent means no portal is ever read — which is what
   * every test that is not about Orange wants, and what the app itself does
   * until a SIM reports the network.
   */
  portal?: PortalSource;
  /** Called after every settled portal fetch, so the panel can be re-pushed. */
  onPortal?: (status: PortalStatus) => void;
  /**
   * The connected devices. Absent means the list is never read — which is what
   * every test that is not about devices wants.
   */
  hosts?: HostListSource;
  /**
   * Whether anything is looking at the device list — the devices window being
   * open, in the app. Read on every tick rather than set once, for the reason
   * the panel's visibility is: a window can be closed without telling us.
   *
   * False, and absent, both mean no host-list request is made at all. The list
   * costs a request the monitoring endpoints do not, and a window nobody has
   * open is not worth one.
   */
  wantsDevices?: () => boolean;
  /** Called after every settled device read, so the window can be re-pushed. */
  onDevices?: (result: HostListResult) => void;
  /** Injected so a reading's age is testable without a real clock. */
  clock?: Clock;
  /** Called only when the title actually changes, so the tray is not rewritten needlessly. */
  onTitle?: (title: string) => void;
  /**
   * Called only when the usage state actually changes — edge-triggered, exactly
   * like {@link UsagePollerOptions.onTitle}. Crossing into `"warn"` or `"over"`
   * fires once; staying there fires nothing, so a notification is never repeated
   * on every poll.
   */
  onState?: (state: UsageState) => void;
}

export class UsagePoller {
  readonly #client: SnapshotSource;
  readonly #config: AppConfig;
  readonly #onTitle: ((title: string) => void) | undefined;
  readonly #onState: ((state: UsageState) => void) | undefined;
  readonly #portalSource: PortalSource | undefined;
  readonly #onPortal: ((status: PortalStatus) => void) | undefined;
  readonly #hosts: HostListSource | undefined;
  readonly #wantsDevices: (() => boolean) | undefined;
  readonly #onDevices: ((result: HostListResult) => void) | undefined;
  readonly #clock: Clock;

  #title = STARTUP_TRAY_TITLE;
  /** Retained between polls — the previous state is what makes the callback edge-triggered. */
  #state: UsageState = "unknown";
  #consecutiveFailures = 0;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #running = false;
  /** True while the panel is on screen — the only thing that picks the interval. */
  #active = false;

  /** The portal's own standing, which the router's does not decide. */
  #portal: PortalStatus = { reading: null, live: false };
  /** The portal's own timer, deliberately never the poll's. */
  #portalTimer: ReturnType<typeof setTimeout> | null = null;
  /** True while a page is on the wire, so two fetches cannot overlap. */
  #portalInFlight = false;

  constructor(options: UsagePollerOptions) {
    this.#client = options.client;
    this.#config = options.config;
    this.#onTitle = options.onTitle;
    this.#onState = options.onState;
    this.#portalSource = options.portal;
    this.#onPortal = options.onPortal;
    this.#hosts = options.hosts;
    this.#wantsDevices = options.wantsDevices;
    this.#onDevices = options.onDevices;
    this.#clock = options.clock ?? systemClock;
  }

  /** The title the menu bar should currently be showing. */
  get title(): string {
    return this.#title;
  }

  /**
   * How the latest reading sits against the plan. An unreachable router leaves
   * it alone: a router that stopped answering has not changed how much data was
   * used before it stopped.
   */
  get state(): UsageState {
    return this.#state;
  }

  /**
   * The carrier's own figure on Orange, and whether the portal answered last
   * time. Empty on every other network — there is no portal to read.
   */
  get portal(): PortalStatus {
    return this.#portal;
  }

  /** Polls immediately, then once per configured interval until {@link stop}. */
  start(): void {
    if (this.#running) {
      return;
    }

    this.#running = true;
    void this.#tick();
  }

  /**
   * Switches between the two cadences: the active one while the detail panel is
   * open, the resting one while it is shut.
   *
   * Opening also reads immediately, because a panel that appears showing
   * figures up to a full idle interval old is not showing live data. The
   * pending timer is dropped in favour of that read, and only a timer — never a
   * request already on the wire — is ever replaced, so two polls still cannot
   * overlap. Repeating the same mode is a no-op, so a second open costs no
   * extra request.
   */
  setActive(active: boolean): void {
    if (active === this.#active) {
      return;
    }

    this.#active = active;

    if (!this.#running || this.#timer === null) {
      // Nothing is scheduled: either the poller is stopped, or a poll is in
      // flight and will schedule the next one at the new interval itself.
      return;
    }

    clearTimeout(this.#timer);
    this.#timer = null;

    if (active) {
      void this.#tick();

      return;
    }

    this.#scheduleNext();
  }

  /** Cancels the pending poll; a poll already in flight publishes nothing. */
  stop(): void {
    this.#running = false;

    if (this.#timer !== null) {
      clearTimeout(this.#timer);
      this.#timer = null;
    }

    this.#stopPortal();
  }

  async #tick(): Promise<void> {
    let result: SnapshotResult;

    try {
      result = await this.#client.snapshot();
    } catch {
      // The client resolves rather than rejects, but a stub or a future
      // implementation might throw; an unattended app must not die of it.
      result = { online: false, reason: "error" };
    }

    if (!this.#running) {
      return;
    }

    this.#apply(result);

    // Awaited inside the tick rather than left running beside it, so the device
    // request can no more stack on the router than a second poll can. Nothing
    // is awaited at all when no window wants the list, so a poll that reads
    // only the router keeps exactly the shape it had.
    if (this.#wantsDevices?.() === true) {
      await this.#readDevices(result);

      if (!this.#running) {
        return;
      }
    }

    this.#scheduleNext();
  }

  /**
   * The connected devices, for as long as something is looking at them.
   *
   * Everything here is subordinate to the poll that has just landed: the
   * snapshot is applied before this runs, so a host list that fails — or throws
   * — cannot touch the title, the usage state or the panel's figures. The
   * window is told instead, which is the whole difference between a list that
   * is unavailable and a router with nothing connected to it.
   *
   * Only ever called with a window open — {@link UsagePoller.#tick} makes that
   * decision, so that a closed window costs not even the await.
   */
  async #readDevices(result: SnapshotResult): Promise<void> {
    if (!result.online) {
      // The router just failed to answer five endpoints; asking it a sixth is a
      // request nobody needs, and an unreachable router has not said that
      // nothing is connected to it.
      this.#onDevices?.({ online: false, reason: result.reason });

      return;
    }

    if (this.#hosts === undefined) {
      return;
    }

    let listed: HostListResult;

    try {
      listed = await this.#hosts.hosts();
    } catch {
      // The client resolves rather than rejects, but a stub or a future
      // implementation might throw; an unattended app must not die of it.
      listed = { online: false, reason: "error" };
    }

    if (!this.#running) {
      return;
    }

    // Published exactly as the router answered. What the list is *called* and
    // what order it reads in are display rules, and they live with the model
    // the window is built from.
    this.#onDevices?.(listed);
  }

  #apply(result: SnapshotResult): void {
    if (result.online) {
      this.#consecutiveFailures = 0;
      // Which allowance source is the right one is a fact about the SIM, and
      // the router states it on an endpoint the poll already reads.
      this.#followCarrier(result.snapshot.carrier.id);
      // The portal goes with it: on Orange it holds the only figure there is,
      // and the title would otherwise be a dash on the one network this app was
      // extended for. It is read here rather than pushed from the portal loop
      // so the menu bar is written from one place, on the poll's own cadence.
      this.#setTitle(
        buildTrayTitle(result, this.#config, this.#clock, this.#portal),
      );

      // The same reading the title and the panel's dial are built from, so the
      // notification can never fire against a figure neither of them shows.
      const reading = readPlanUsage(
        this.#config.allowanceAnchor,
        result.snapshot.month,
        this.#config.planLimitBytes,
      );

      this.#setState(
        usageState(
          reading?.percentUsed ?? null,
          this.#config.warnThresholdPercent,
        ),
      );

      return;
    }

    this.#consecutiveFailures += 1;

    // Below the threshold the last good title stands: the menu bar keeps
    // showing the most recent real reading instead of going blank.
    if (this.#consecutiveFailures >= FAILURES_BEFORE_OFFLINE) {
      this.#setTitle(buildTrayTitle(result, this.#config));
    }
  }

  #setTitle(title: string): void {
    if (title === this.#title) {
      return;
    }

    this.#title = title;
    this.#onTitle?.(title);
  }

  #setState(state: UsageState): void {
    if (state === this.#state) {
      return;
    }

    this.#state = state;
    this.#onState?.(state);
  }

  #scheduleNext(): void {
    const seconds = this.#active
      ? this.#config.activePollIntervalSeconds
      : this.#config.pollIntervalSeconds;

    this.#timer = setTimeout(() => {
      this.#timer = null;
      void this.#tick();
    }, seconds * 1_000);
  }

  /**
   * Starts or stops the portal loop for the network the SIM is on.
   *
   * Orange is the only carrier with a portal; on YAS the figure comes from a
   * dialogue nobody polls, and on a network the app cannot place there is no
   * allowance source at all. A SIM swapped back therefore stops the loop rather
   * than leaving it fetching a page for a subscriber who has moved.
   */
  #followCarrier(carrier: Carrier): void {
    if (carrier === "orange") {
      this.#startPortal();

      return;
    }

    this.#stopPortal();
  }

  /** Begins the portal loop, unless one is already running. */
  #startPortal(): void {
    if (
      this.#portalSource === undefined ||
      this.#portalTimer !== null ||
      this.#portalInFlight
    ) {
      return;
    }

    void this.#portalTick();
  }

  #stopPortal(): void {
    if (this.#portalTimer !== null) {
      clearTimeout(this.#portalTimer);
      this.#portalTimer = null;
    }
  }

  /**
   * One fetch, then the next one an idle interval later — never an active one.
   * That is the whole cadence rule: the panel opening is a reason to ask the
   * router more often and never a reason to ask for the portal's page again.
   */
  async #portalTick(): Promise<void> {
    const source = this.#portalSource;

    if (source === undefined) {
      return;
    }

    let result: OrangePortalResult;

    this.#portalInFlight = true;

    try {
      result = await source.read();
    } catch {
      // The boundary resolves rather than rejects, but an unattended app must
      // not die of a stub or a future implementation that throws.
      result = { state: "unreachable", reason: "offline" };
    } finally {
      this.#portalInFlight = false;
    }

    if (!this.#running) {
      return;
    }

    this.#applyPortal(result);

    this.#portalTimer = setTimeout(() => {
      this.#portalTimer = null;
      void this.#portalTick();
    }, this.#config.pollIntervalSeconds * 1_000);
  }

  /**
   * A page that arrived replaces the reading; anything else leaves the last one
   * standing and only says the portal is not answering. Both are published, so
   * the panel can age a figure it is still showing.
   */
  #applyPortal(result: OrangePortalResult): void {
    if (result.state !== "read") {
      this.#portal = { reading: this.#portal.reading, live: false };
      this.#onPortal?.(this.#portal);

      return;
    }

    const selection = selectForfait(
      result.page.forfaits,
      this.#config.orangeForfaitLabel,
    );

    this.#portal = {
      reading: {
        forfait: selection.selected,
        candidates: selection.candidates,
        remembered: selection.remembered,
        at: this.#clock.now(),
      },
      live: true,
    };
    this.#onPortal?.(this.#portal);
  }
}
