/**
 * The popover's renderer. It does exactly one thing: put the strings the main
 * process hands it into the DOM.
 *
 * There is no arithmetic here, no formatting and no knowledge of bytes — every
 * value arrives from `buildPopoverModel` already spelled the way it appears on
 * screen. The exceptions are geometry: the dial's sweep, which is multiplied by
 * that ring's circumference; the sparklines' samples, plotted against the
 * model's own peak; and the signal level, scaled onto however many bars the
 * header draws. Only the renderer knows how big its shapes are, so only the
 * renderer can turn a share into a coordinate — but the scale still comes from
 * the model rather than being derived here.
 *
 * The main process pushes updates by calling {@link Window.applyPopoverModel}.
 * One global entry point rather than an IPC channel: there is a single message,
 * it only ever flows main → renderer, and a preload bridge would be more
 * machinery than that deserves.
 */

import type {
  DeviceRefusal,
  DeviceRow,
  DevicesModel,
  PopoverModel,
} from "../main/view-model.js";

/**
 * The two messages the page can send. Exposed by `src/renderer/preload.cts`,
 * which is the only thing in the renderer that can reach the main process —
 * the page itself has no `require`, no network and no Electron.
 *
 * Optional because the page has to render without it: under jsdom, and for a
 * split second before the bridge is installed, the panel is a display and
 * nothing more.
 */
export interface PopoverBridge {
  /** Ask the main process to run the carrier dialogue. */
  sync(): void;
  /** Hand the entered credential to the Keychain, through the main process. */
  savePassword(credential: { username: string; password: string }): void;
  /**
   * Hand the plan size to the main process exactly as typed. The renderer does
   * not read it, convert it or judge it — that is all decided the other side.
   */
  setPlanLimit(value: string): void;
  /** Hand the plan length over on exactly the same terms. */
  setPlanDays(value: string): void;
  /**
   * Name the forfait the meter should measure from here on. The label is the
   * carrier's own, passed through untouched: it is what the config stores and
   * what the next portal read matches against.
   */
  chooseForfait(label: string): void;
  /**
   * Ask the main process to block or unblock one device. The press has already
   * been confirmed here; what it costs the router is decided the other side,
   * and the payload is validated there rather than trusted.
   */
  setBlocked(request: { mac: string; blocked: boolean }): void;
  /**
   * Say which pane is showing. Which one it is stays the page's own state —
   * this only tells the main process, which needs it to decide whether the
   * authenticated device list is worth a request this tick.
   */
  setTab(name: string): void;
}

declare global {
  interface Window {
    /** Called by `src/main/popover.ts` after every poll, and once on load. */
    applyPopoverModel(model: PopoverModel): void;
    /**
     * Called by `src/main/popover.ts` on every open, to put the page back on
     * its main view. The window is hidden rather than destroyed between opens,
     * so settings left showing would still be showing the next time the tray
     * item is clicked — and the figures are what the panel is opened for.
     */
    resetPopoverView(): void;
    /**
     * Called with whatever the last host list and the last MAC filter add up
     * to. Separate from {@link Window.applyPopoverModel} because it arrives on
     * its own schedule: the figures land every couple of seconds and the list
     * only while the Devices tab is the one showing.
     */
    applyDevicesModel(model: DevicesModel): void;
    /**
     * Called by `src/main/popover.ts` when something outside the page asks for
     * a pane — the tray's devices entry, which used to open a window of its
     * own. A press on the strip does not come through here; that is the page's
     * own business and stays it.
     */
    showPopoverTab(name: string): void;
    popoverBridge?: PopoverBridge;
  }
}

/** Flattens the model onto the `data-field` names used in `index.html`. */
function fieldsOf(model: PopoverModel): Record<string, string> {
  return {
    carrier: model.carrier,
    networkType: model.networkType,
    freshness: model.freshness.label,
    monthTotal: model.monthTotal,
    downloadRate: model.downloadRate,
    uploadRate: model.uploadRate,
    connectedDevices: model.connectedDevices,
    planLimitUnit: model.planLimit.unit,
    planLimitError: model.planLimit.error,
    planDaysUnit: model.planDays.unit,
    planDaysError: model.planDays.error,
    planCapMessage: model.planCapPrompt?.message ?? "",
    paceSustainable: model.pace?.sustainable ?? "",
    paceAverage: model.pace?.meter?.average ?? "",
    paceAfforded: model.pace?.meter?.afforded ?? "",
    paceHint: model.pace?.hint ?? "",
    percent: model.progress.label,
    prompt: model.progress.prompt,
    allowanceRemaining: model.allowance.remaining,
    allowanceCaption: model.allowance.remainingCaption,
    allowancePlan: model.allowance.planLabel,
    allowanceExpires: model.allowance.expires,
    allowanceDaysLeft: model.allowance.daysUntilExpiry,
    allowanceSynced: model.allowance.syncedAgo,
    allowanceNote: model.allowance.note,
    forfaitNote: model.forfait?.note ?? "",
    syncStatus: model.sync.status,
    notice: model.notice,
  };
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

/**
 * The dial's geometry, in the user units of its `viewBox` — a square canvas so
 * the ring stays circular whatever size the stylesheet gives it.
 */
const DIAL_SIZE = 100;
const DIAL_CENTRE = DIAL_SIZE / 2;
const DIAL_RADIUS = 42;
const DIAL_CIRCUMFERENCE = 2 * Math.PI * DIAL_RADIUS;

function ring(role: "track" | "arc"): SVGCircleElement {
  const circle = document.createElementNS(SVG_NAMESPACE, "circle");

  circle.setAttribute("class", `dial-${role}`);
  circle.setAttribute("cx", String(DIAL_CENTRE));
  circle.setAttribute("cy", String(DIAL_CENTRE));
  circle.setAttribute("r", String(DIAL_RADIUS));

  return circle;
}

/**
 * The dial's arc, built once and reused. Redrawing means writing a new dash
 * length onto the same circle — an SVG rebuilt on every poll would throw away
 * the CSS transition that makes the ring grow rather than jump.
 */
function dialArc(host: HTMLElement): SVGCircleElement {
  const existing = host.querySelector<SVGCircleElement>("[data-arc]");

  if (existing !== null) {
    return existing;
  }

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");

  svg.setAttribute("class", "dial-ring");
  svg.setAttribute("viewBox", `0 0 ${DIAL_SIZE} ${DIAL_SIZE}`);
  // The dial speaks through its own aria-label; the shapes inside it are noise.
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const arc = ring("arc");

  arc.setAttribute("data-arc", "");
  // Twelve o'clock, clockwise — a dial the user reads like a clock face.
  arc.setAttribute("transform", `rotate(-90 ${DIAL_CENTRE} ${DIAL_CENTRE})`);

  svg.append(ring("track"), arc);
  host.prepend(svg);

  return arc;
}

/** Draws `sweep` (0 to 1) of the ring, leaving the rest of it as gap. */
function drawArc(arc: SVGCircleElement, sweep: number): void {
  const drawn = sweep * DIAL_CIRCUMFERENCE;

  arc.setAttribute(
    "stroke-dasharray",
    `${drawn.toFixed(3)} ${DIAL_CIRCUMFERENCE.toFixed(3)}`,
  );
}

/**
 * A sparkline's geometry, in the user units of its `viewBox`. The box is
 * stretched to whatever width and height the stylesheet gives it
 * (`preserveAspectRatio="none"`), so these numbers are a coordinate space
 * rather than a size — only their ratios matter.
 */
const SPARK_WIDTH = 100;
const SPARK_HEIGHT = 24;
/** Half a stroke's worth of room, so a crest and a trough are not clipped. */
const SPARK_INSET = 2;
const SPARK_BASELINE = SPARK_HEIGHT - SPARK_INSET;
const SPARK_SPAN = SPARK_BASELINE - SPARK_INSET;

/**
 * Two samples is the least a line can be drawn from. One sample is a dot and
 * none is nothing, and both would read as a chart that had gone wrong rather
 * than as a chart with nothing in it yet.
 */
const SPARK_MINIMUM_SAMPLES = 2;

/**
 * A sparkline's polyline, built once and reused — the same bargain the dial
 * makes. Rewriting `points` on the existing line is also what keeps a second
 * model from stacking its samples on top of the first one's.
 */
function sparkLine(host: HTMLElement): SVGPolylineElement {
  const existing = host.querySelector<SVGPolylineElement>("[data-line]");

  if (existing !== null) {
    return existing;
  }

  const svg = document.createElementNS(SVG_NAMESPACE, "svg");

  svg.setAttribute("class", "spark-chart");
  svg.setAttribute("viewBox", `0 0 ${SPARK_WIDTH} ${SPARK_HEIGHT}`);
  // The box is a coordinate space, not a shape: let it stretch to the panel.
  svg.setAttribute("preserveAspectRatio", "none");
  // The rate beside the line says what the line says; the shapes are decoration.
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  const base = document.createElementNS(SVG_NAMESPACE, "line");

  base.setAttribute("class", "spark-base");
  base.setAttribute("x1", "0");
  base.setAttribute("x2", String(SPARK_WIDTH));
  base.setAttribute("y1", String(SPARK_BASELINE));
  base.setAttribute("y2", String(SPARK_BASELINE));

  const line = document.createElementNS(SVG_NAMESPACE, "polyline");

  line.setAttribute("class", "spark-line");
  line.setAttribute("data-line", "");
  // The stroke keeps its width however far the box is stretched sideways.
  line.setAttribute("vector-effect", "non-scaling-stroke");

  svg.append(base, line);
  host.append(svg);

  return line;
}

/**
 * Plots `values` against `peak` — the scale both series share, so a download
 * and an upload drawn side by side are the same height for the same rate.
 *
 * Two divisions, neither of which can be by zero: the caller only plots two
 * samples or more, and a peak of zero is an idle connection rather than a
 * scale, so every sample sits on the baseline and the line reads flat.
 */
function pointsFor(values: readonly number[], peak: number): string {
  const last = values.length - 1;

  return values
    .map((value, index) => {
      const x = (index / last) * SPARK_WIDTH;
      const y = SPARK_BASELINE - (peak > 0 ? value / peak : 0) * SPARK_SPAN;

      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

/** Redraws one sparkline, or empties it when there is not yet a line to draw. */
function drawSpark(
  series: "download" | "upload",
  values: readonly number[],
  peak: number,
): void {
  const host = document.querySelector<HTMLElement>(`[data-spark="${series}"]`);

  if (host === null) {
    return;
  }

  const enough = values.length >= SPARK_MINIMUM_SAMPLES;

  host.dataset["empty"] = String(!enough);
  sparkLine(host).setAttribute("points", enough ? pointsFor(values, peak) : "");
}

/**
 * How many bars the header draws. Fixed here rather than taken from the router:
 * the panel's own shape is a renderer fact, and a device that counted to seven
 * would otherwise redraw the header. The router's level is scaled onto it, the
 * same bargain the dial's sweep makes with the ring's circumference.
 */
const SIGNAL_BAR_COUNT = 4;

/**
 * Fills the bars to the level the model reports.
 *
 * A maximum of zero is the router having said nothing yet rather than a
 * connection at its worst, so it fills none instead of dividing by it.
 */
function applySignal(model: PopoverModel): void {
  const host = document.querySelector<HTMLElement>("[data-signal]");

  if (host === null) {
    return;
  }

  host.setAttribute("aria-label", model.signalDescription);

  const filled =
    model.maxSignalBars > 0
      ? Math.round((model.signalBars / model.maxSignalBars) * SIGNAL_BAR_COUNT)
      : 0;

  host.querySelectorAll<HTMLElement>(".signal-bar").forEach((bar, index) => {
    bar.dataset["filled"] = String(index < filled);
  });
}

function syncButton(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("[data-sync]");
}

function passwordPrompt(): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>("[data-password-prompt]");
}

function fieldValue(selector: string): string {
  return document.querySelector<HTMLInputElement>(selector)?.value ?? "";
}

/*
 * Both form lookups name the element type as well as the attribute. The model's
 * two state flags land on `<html>` as `data-plan-limit` and `data-plan-days`,
 * so a bare attribute selector matches the root element first and the form
 * never gets its listener — the submit only arrived at all because it bubbles.
 */
function planLimitForm(): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>("form[data-plan-limit]");
}

function planLimitInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("[data-plan-limit-input]");
}

function planDaysForm(): HTMLFormElement | null {
  return document.querySelector<HTMLFormElement>("form[data-plan-days]");
}

function planDaysInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("[data-plan-days-input]");
}

function planCapPrompt(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-plan-cap-prompt]");
}

function mainView(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-main-view]");
}

function settingsView(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-settings-view]");
}

function settingsToggle(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("[data-settings-toggle]");
}

/**
 * Shows one of the panel's two views and hides the other.
 *
 * The pressed state is on the toggle rather than on a variable here: the button
 * has to say which view it is offering anyway, so keeping the answer anywhere
 * else would be a second copy of it that could disagree.
 */
function showSettings(open: boolean): void {
  const toggle = settingsToggle();

  if (toggle !== null) {
    toggle.setAttribute("aria-pressed", String(open));
  }

  const main = mainView();

  if (main !== null) {
    main.hidden = open;
  }

  const settings = settingsView();

  if (settings !== null) {
    settings.hidden = !open;
  }
}

function settingsAreOpen(): boolean {
  return settingsToggle()?.getAttribute("aria-pressed") === "true";
}

/**
 * The panel's two panes, in the order the strip draws them. The order is the
 * arrow keys' order, so it lives here rather than being read back off the DOM.
 */
const TAB_NAMES = ["usage", "devices"] as const;

type TabName = (typeof TAB_NAMES)[number];

function isTabName(value: string | undefined): value is TabName {
  return TAB_NAMES.some((name) => name === value);
}

/**
 * Which pane is showing, as the root element holds it.
 *
 * The root attribute is the state and this reads it back, rather than a
 * variable here that a reloaded page would leave disagreeing with the markup.
 * Usage when the attribute says nothing: the tray title already states the
 * usage figure, so it is the pane the panel is opened for.
 */
function currentTab(): TabName {
  const held = document.documentElement.dataset["tab"];

  return isTabName(held) ? held : "usage";
}

function tabControl(name: TabName): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>(
    `[role="tab"][data-tab="${name}"]`,
  );
}

function tabPane(name: TabName): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-pane="${name}"]`);
}

/**
 * Draws the strip and the panes from whichever tab is currently selected.
 *
 * Everything here is derived from the one root attribute — which pane is
 * hidden, which tab reads as selected, and which of them is in the tab order.
 * Nothing is created: both panes ship in the markup and a switch only writes
 * attributes onto them, so a device row keeps its identity across a press.
 *
 * Called on every model and on every open, for the reason `bindControls` is: a
 * reload — and every test that loads the markup afresh — replaces the page
 * beneath this module, and the freshly loaded panes would otherwise show
 * whatever the static markup last said rather than the tab the user left on.
 */
function applyTabs(): void {
  const selected = currentTab();

  document.documentElement.dataset["tab"] = selected;

  for (const name of TAB_NAMES) {
    const control = tabControl(name);

    if (control !== null) {
      control.setAttribute("aria-selected", String(name === selected));
      // Roving tabindex: Tab reaches the strip once and the arrows move within
      // it, rather than every tab being its own stop on the way to the panel.
      control.tabIndex = name === selected ? 0 : -1;
    }

    const pane = tabPane(name);

    if (pane !== null) {
      pane.hidden = name !== selected;
    }
  }
}

/**
 * Selects a pane, and puts the focus where a keyboard user left it.
 *
 * The main process is told, because the pane decides whether the poll asks the
 * router for its device list at all — an authenticated request that costs a
 * login, and one a panel showing Usage has no use for. It is told from here
 * rather than from `applyTabs`, which runs on every model: the tab changes when
 * someone changes it, and a message a couple of times a second would be a
 * channel repeating itself for nothing.
 */
function showTab(name: TabName, focus = false): void {
  document.documentElement.dataset["tab"] = name;
  applyTabs();
  window.popoverBridge?.setTab(name);

  if (focus) {
    tabControl(name)?.focus();
  }
}

/**
 * Where an arrow, Home or End press lands, or null when the key is not the
 * strip's own. Wraps at both ends: two tabs and no wrap would make one arrow
 * key dead on each of them.
 */
function tabAfterKey(key: string, from: TabName): TabName | null {
  const index = TAB_NAMES.indexOf(from);
  const count = TAB_NAMES.length;

  switch (key) {
    case "ArrowRight":
      return TAB_NAMES[(index + 1) % count] ?? null;
    case "ArrowLeft":
      return TAB_NAMES[(index - 1 + count) % count] ?? null;
    case "Home":
      return TAB_NAMES[0] ?? null;
    case "End":
      return TAB_NAMES[count - 1] ?? null;
    default:
      return null;
  }
}

/**
 * Hangs the strip's listeners off each tab, once each.
 *
 * One listener per control rather than one on the strip: the panes are what
 * the strip contains once T-73 fills them, and a delegated handler would then
 * have to tell a tab press from a press on a device row inside a pane.
 */
function bindTabs(): void {
  for (const name of TAB_NAMES) {
    const control = tabControl(name);

    if (control === null || control.dataset["bound"] === "true") {
      continue;
    }

    control.dataset["bound"] = "true";
    control.addEventListener("click", () => {
      showTab(name);
    });
    control.addEventListener("keydown", (event) => {
      const next = tabAfterKey(event.key, name);

      if (next === null) {
        return;
      }

      // The arrows belong to the strip once it has the focus; letting them
      // also scroll the panel would move two things with one press.
      event.preventDefault();
      showTab(next, true);
    });
  }
}

function planCapConfirm(): HTMLButtonElement | null {
  return document.querySelector<HTMLButtonElement>("[data-plan-cap-confirm]");
}

/**
 * Hangs the two listeners off the page, once each.
 *
 * Called on every model rather than once at load: the panel is rendered from a
 * static page, but a test — and a reload — replaces that page wholesale, and a
 * listener on a discarded element is a button that silently stops working. The
 * marker on the element itself is what keeps a second call from doubling up,
 * so one press stays one message however many models have arrived since.
 */
function bindControls(): void {
  bindTabs();

  const button = syncButton();

  if (button !== null && button.dataset["bound"] !== "true") {
    button.dataset["bound"] = "true";
    button.addEventListener("click", () => {
      // Belt and braces: a disabled button dispatches no click, and a dialogue
      // already running would refuse a second one anyway.
      if (!button.disabled) {
        window.popoverBridge?.sync();
      }
    });
  }

  const prompt = passwordPrompt();

  if (prompt !== null && prompt.dataset["bound"] !== "true") {
    prompt.dataset["bound"] = "true";
    prompt.addEventListener("submit", (event) => {
      // The page must never navigate: it is the app, not a document.
      event.preventDefault();

      const password = document.querySelector<HTMLInputElement>(
        "[data-password-password]",
      );

      window.popoverBridge?.savePassword({
        username: fieldValue("[data-password-username]").trim(),
        password: password?.value ?? "",
      });

      // The plaintext leaves the page as soon as it has been handed over; it is
      // never logged, and it is not left sitting in a field either.
      if (password !== null) {
        password.value = "";
      }
    });
  }

  const planLimit = planLimitForm();

  if (planLimit !== null && planLimit.dataset["bound"] !== "true") {
    planLimit.dataset["bound"] = "true";
    planLimit.addEventListener("submit", (event) => {
      // The page must never navigate: it is the app, not a document.
      event.preventDefault();

      // Sent exactly as typed. Whether it is a number, and what it is worth in
      // bytes, are both decided in the main process — the panel's rule is that
      // the renderer works nothing out for itself.
      window.popoverBridge?.setPlanLimit(fieldValue("[data-plan-limit-input]"));
    });
  }

  const planDays = planDaysForm();

  if (planDays !== null && planDays.dataset["bound"] !== "true") {
    planDays.dataset["bound"] = "true";
    planDays.addEventListener("submit", (event) => {
      // The page must never navigate: it is the app, not a document.
      event.preventDefault();

      window.popoverBridge?.setPlanDays(fieldValue("[data-plan-days-input]"));
    });
  }

  const settings = settingsToggle();

  if (settings !== null && settings.dataset["bound"] !== "true") {
    settings.dataset["bound"] = "true";
    settings.addEventListener("click", () => {
      showSettings(!settingsAreOpen());
    });
  }

  const confirm = planCapConfirm();

  if (confirm !== null && confirm.dataset["bound"] !== "true") {
    confirm.dataset["bound"] = "true";
    confirm.addEventListener("click", () => {
      // Confirming is re-submitting: the field above already holds the stored
      // cap, and the main process treats any successful entry as a
      // confirmation. That is why there is no fifth message on the bridge.
      window.popoverBridge?.setPlanLimit(fieldValue("[data-plan-limit-input]"));
    });
  }
}

/**
 * Fills the plan-size field from the model, unless the user is in it.
 *
 * A poll pushes a fresh model every couple of seconds while the panel is open,
 * and writing the stored value back over a half-typed one would make the field
 * impossible to use.
 */
function applyPlanLimit(model: PopoverModel): void {
  const input = planLimitInput();

  if (input === null || document.activeElement === input) {
    return;
  }

  input.value = model.planLimit.value;
  input.setAttribute("aria-label", model.planLimit.description);
  document.documentElement.dataset["planLimit"] = model.planLimit.needsValue
    ? "unset"
    : "set";
}

/** The same, for the plan-length field beside it. */
function applyPlanDays(model: PopoverModel): void {
  const input = planDaysInput();

  if (input === null || document.activeElement === input) {
    return;
  }

  input.value = model.planDays.value;
  input.setAttribute("aria-label", model.planDays.description);
  document.documentElement.dataset["planDays"] = model.planDays.needsValue
    ? "unset"
    : "set";
}

/**
 * Shows the new-plan confirmation, or takes it off the panel entirely.
 *
 * `hidden` rather than an empty box, for the reason the password prompt uses
 * it: a bordered panel holding no words reads as something that failed to load.
 */
function applyPlanCapPrompt(model: PopoverModel): void {
  const prompt = planCapPrompt();

  if (prompt !== null) {
    prompt.hidden = model.planCapPrompt === null;
  }

  const confirm = planCapConfirm();

  if (confirm !== null && model.planCapPrompt !== null) {
    confirm.textContent = model.planCapPrompt.confirmLabel;
    confirm.setAttribute("aria-label", model.planCapPrompt.description);
  }
}

/**
 * Controls taken off the page, each with the comment left where it stood.
 *
 * Taken off rather than hidden: a control the carrier has nothing behind is one
 * the user must not be able to operate, and `hidden` leaves an element in the
 * document — still focusable by script, still reachable by keyboard in the
 * cases where a stylesheet is not applied. Removing it is the only answer that
 * is true whatever the CSS does.
 *
 * The comment is what makes it reversible. The SIM decides which controls the
 * panel offers, and a SIM can be swapped without the app restarting, so a
 * removed control has to know where to go back.
 */
const withdrawn = new Map<string, { node: Element; marker: Comment }>();

/**
 * Puts a control on the page, or takes it off.
 *
 * The marker's own connectedness is the state, rather than the map alone: the
 * page can be replaced wholesale beneath this module — by a reload, and by
 * every test that loads the markup afresh — and a map entry pointing at a
 * document that no longer exists must not be mistaken for a control that is
 * currently withdrawn.
 */
function setPresent(selector: string, wanted: boolean): void {
  const held = withdrawn.get(selector);
  const stands = held !== undefined && held.marker.isConnected;

  if (wanted) {
    if (stands) {
      held.marker.replaceWith(held.node);
    }

    withdrawn.delete(selector);

    return;
  }

  if (stands) {
    return;
  }

  const node = document.querySelector(selector);

  if (node === null) {
    return;
  }

  const marker = document.createComment(selector);

  node.replaceWith(marker);
  withdrawn.set(selector, { node, marker });
}

/**
 * The controls whose presence the carrier decides, by the flag that decides
 * each. The plan length is two elements — the field and the line that refuses
 * it — because a complaint about a field that is not there is not a complaint
 * about anything.
 *
 * The expiry row is not a control at all but it is withdrawn by the same
 * machinery, and for the same reason: a carrier that states no expiry leaves a
 * row that reads "— · —" to the eye and reads out in full to a screen reader.
 */
const CARRIER_CONTROLS: { flag: keyof PopoverModel["controls"]; of: string }[] =
  [
    { flag: "sync", of: "[data-sync]" },
    { flag: "sync", of: "[data-sync-row]" },
    { flag: "planDays", of: "form[data-plan-days]" },
    { flag: "planDays", of: '[data-field="planDaysError"]' },
    { flag: "expiry", of: "[data-validity-row]" },
  ];

/** Draws the control set this carrier has anything behind, and no more. */
function applyControls(model: PopoverModel): void {
  for (const control of CARRIER_CONTROLS) {
    setPresent(control.of, model.controls[control.flag]);
  }
}

/**
 * Lists the plans the meter could measure instead, or takes the offer away.
 *
 * Rebuilt only when the labels themselves change. A poll pushes a fresh model
 * every couple of seconds while the panel is open, and replacing the buttons
 * under a pointer already on one is how a click lands on nothing.
 */
function applyForfait(model: PopoverModel): void {
  const host = document.querySelector<HTMLElement>("[data-forfait-choice]");
  const list = document.querySelector<HTMLElement>(
    "[data-forfait-alternatives]",
  );

  if (host === null || list === null) {
    return;
  }

  const alternatives = model.forfait?.alternatives ?? [];

  host.hidden = alternatives.length === 0;

  const labels = alternatives.map((option) => option.label).join("\n");

  if (list.dataset["labels"] === labels) {
    return;
  }

  list.dataset["labels"] = labels;
  list.replaceChildren(
    ...alternatives.map((option) => {
      const button = document.createElement("button");

      button.type = "button";
      button.className = "forfait-alternative";
      button.dataset["forfaitLabel"] = option.label;
      button.textContent = option.label;
      button.setAttribute("aria-label", option.description);
      button.addEventListener("click", () => {
        // The label as the carrier spells it. Which plan that names, and
        // whether it is still on the page, are both decided the other side.
        window.popoverBridge?.chooseForfait(option.label);
      });

      return button;
    }),
  );
}

/** A share of the meter's track, 0 to 1, as the CSS length it is drawn at. */
function trackShare(share: number): string {
  return `${(share * 100).toFixed(2)}%`;
}

/**
 * Draws the meter, or takes it off the row.
 *
 * The only arithmetic is turning the model's two shares into percentages of a
 * track whose width only the stylesheet knows — the same bargain the dial's
 * sweep makes with the ring's circumference. Where the tick sits is the model's
 * business, not a number this file happens to agree with.
 */
function applyPaceMeter(model: PopoverModel): void {
  const host = document.querySelector<HTMLElement>("[data-pace-meter]");

  if (host === null) return;

  const meter = model.pace?.meter ?? null;

  host.hidden = meter === null;

  if (meter === null) return;

  // The bar is a picture of the two numerals beside it, so it says in words
  // what it says in hue: a greyscale screenshot still reads.
  host.setAttribute("aria-label", meter.description);

  const fill = host.querySelector<HTMLElement>("[data-pace-fill]");

  if (fill !== null) {
    fill.style.width = trackShare(meter.fill);
  }

  const tick = host.querySelector<HTMLElement>("[data-pace-tick]");

  if (tick !== null) {
    tick.style.left = trackShare(meter.tick);
  }
}

/**
 * Shows the pace row, or takes it off the panel entirely.
 *
 * `hidden` rather than an empty row: the fields are already blank when there is
 * no reading, but a section that still holds its space open reads as a figure
 * the app failed to produce, which is precisely what it is not.
 *
 * The band's state goes on the section rather than on the bar, so the
 * stylesheet decides what `safe`, `warning` and `over` look like — nothing here
 * knows a colour.
 */
function applyPace(model: PopoverModel): void {
  const row = document.querySelector<HTMLElement>("[data-pace]");

  if (row === null) return;

  row.hidden = model.pace === null;

  if (model.pace === null || model.pace.state === "") {
    delete row.dataset["paceState"];
  } else {
    row.dataset["paceState"] = model.pace.state;
  }

  applyPaceMeter(model);
}

/**
 * Shows the line saying why there is no figure, or takes it off the panel.
 *
 * `hidden` rather than an empty row, for the reason the pace section uses it:
 * the row carries a rule and a margin of its own, and a rule with nothing under
 * it reads as a sentence that failed to load.
 */
function applyNotice(model: PopoverModel): void {
  const row = document.querySelector<HTMLElement>("[data-notice-row]");

  if (row !== null) {
    row.hidden = model.notice === "";
  }
}

/** Puts the sync state on the button, the prompt and the root element. */
function applySync(model: PopoverModel): void {
  const { sync, allowance } = model;
  const button = syncButton();

  if (button !== null) {
    button.disabled = sync.busy;
    button.textContent = sync.buttonLabel;
    button.setAttribute("aria-label", sync.buttonDescription);
    button.setAttribute("aria-busy", String(sync.busy));
    button.dataset["attention"] = String(sync.attention);
  }

  const prompt = passwordPrompt();

  if (prompt !== null) {
    prompt.hidden = !sync.needsPassword;
  }

  // The same flag, worn by the control that now stands between the user and
  // that form: a password nobody is asked for is a panel that silently cannot
  // sync. The marker goes as soon as the form has nothing left to ask.
  const settings = settingsToggle();

  if (settings !== null) {
    settings.dataset["attention"] = String(sync.needsPassword);
  }

  document.documentElement.dataset["allowance"] = allowance.available
    ? allowance.stale
      ? "stale"
      : "fresh"
    : "none";
}

/*
 * The Devices pane.
 *
 * Everything below is the rendering T-66 to T-70 built for the devices window,
 * restated for a 320 px pane: the name and the address stack, the access word
 * sits on the right, and the pane scrolls because a household's device count
 * has no upper bound. What is shown does not change.
 *
 * The wording is duplicated with `devices.ts` for exactly as long as that window
 * still exists — T-76 deletes the window, the page and its renderer, and this
 * becomes the only copy. Sharing it in the meantime would mean a module the
 * renderer imports across the main/renderer line, which is a worse trade than a
 * fortnight of two copies.
 */

/**
 * What the access word says.
 *
 * A word, not a colour and not a dot. Once the pane is styled a tint still says
 * nothing to a colour-blind reader or in a greyscale screenshot, which is the
 * rule the pace meter already follows.
 */
const ACCESS_BLOCKED = "Blocked";
const ACCESS_ALLOWED = "Allowed";

/**
 * What a row says about a device the router is not reporting.
 *
 * A blocked device stops associating, so it is in the list on the filter's word
 * alone — and it is listed precisely so it can be unblocked without having to
 * connect first, which is the one thing it cannot do.
 */
const NOT_CONNECTED = "Not connected";

/**
 * What stands where this machine's own control would have been.
 *
 * A sentence rather than a greyed-out button. Blocking the Mac the app runs on
 * severs the connection the undo would have to travel over, and nothing in here
 * could put it back — recovery means the router's own web UI from another
 * device, or a factory reset.
 */
const DEVICE_LOCAL_REASON = "This Mac — blocking it would cut off the app";

/**
 * What each word-shaped failure says, one sentence apiece.
 *
 * The same rule the panel's own failure table follows: "it did not work" tells
 * the user nothing they can act on, whereas a dropped session, a router that
 * never answered and a missing sign-in each call for something different. Every
 * one of them ends by saying that nothing was changed, because the row beside it
 * still shows the old state and the two have to agree.
 */
const DEVICE_REFUSAL_WORDS: Record<Extract<DeviceRefusal, string>, string> = {
  unreachable: "The router did not answer, so nothing was changed.",
  timeout: "The router took too long to answer, so nothing was changed.",
  session:
    "The router dropped the session, so nothing was changed — try again.",
  error: "The router refused the change without saying why.",
  "not-logged-in":
    "The router wants a sign-in before it will change the blocked list. Save the router password in the settings.",
};

/**
 * Why the last press changed nothing, as one sentence.
 *
 * A refusal carrying a number says the number and the endpoint it came from.
 * That is the one thing here the user cannot work out for themselves and the
 * only thing that makes an unrecognised refusal reportable, so it is spelled out
 * rather than collapsed into "the router refused it".
 */
function deviceRefusalText(refusal: DeviceRefusal): string {
  if (typeof refusal === "string") {
    return DEVICE_REFUSAL_WORDS[refusal];
  }

  switch (refusal.kind) {
    case "error":
      return refusal.source === "http"
        ? `The router answered HTTP ${String(refusal.code)} at ${refusal.endpoint}, so nothing was changed.`
        : `The router refused the change (code ${String(refusal.code)} at ${refusal.endpoint}).`;
    case "full":
      // The cap is the actionable part: it says how many have to go before
      // another can be added, and a household that reached it did nothing wrong.
      return `The router's blocked list is full — it holds ${String(refusal.cap)} devices per network. Unblock one before blocking another.`;
    case "whitelist":
      return "The router's Wi-Fi filter is set as a whitelist, which allows only the devices it names. This app only ever writes a blocked list, so nothing was changed — change the filter in the router's own web page first.";
    case "unreadable":
      return "The router did not say which devices it is blocking, so there was nothing safe to write back and nothing was changed.";
    case "self":
      // The row already says this where the control would have been, so this is
      // the domain guard speaking for a press the pane should never have offered.
      return `${DEVICE_LOCAL_REASON}, so nothing was changed.`;
  }
}

function devicesPane(): HTMLElement | null {
  return tabPane("devices");
}

function devicesList(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-devices]");
}

/**
 * The rows already on the pane, by the MAC each one belongs to.
 *
 * Read back off the DOM rather than held in a variable here: a reload — and
 * every test that loads the markup afresh — replaces the list beneath this
 * module, and a remembered map would then hand back rows belonging to a page
 * that no longer exists.
 */
function rowsByMac(list: HTMLElement): Map<string, HTMLElement> {
  const rows = new Map<string, HTMLElement>();

  for (const child of Array.from(list.children)) {
    if (!(child instanceof HTMLElement)) {
      continue;
    }

    const mac = child.dataset["mac"];

    if (mac !== undefined) {
      rows.set(mac, child);
    }
  }

  return rows;
}

/** An empty row, with the parts every device has and none of its strings. */
function createDeviceRow(): HTMLElement {
  const row = document.createElement("li");
  const identity = document.createElement("span");

  row.className = "device";
  identity.className = "device-identity";

  for (const part of ["device-name", "device-ip", "device-meta"]) {
    const line = document.createElement("span");

    line.className = part;
    identity.append(line);
  }

  const access = document.createElement("span");

  access.className = "device-access";
  row.append(identity, access);

  return row;
}

function setPart(row: HTMLElement, selector: string, text: string): void {
  const part = row.querySelector<HTMLElement>(selector);

  // `textContent`, never `innerHTML`: a device names itself, and its name and
  // its network are the strings on this panel the user did not write.
  if (part !== null && part.textContent !== text) {
    part.textContent = text;
  }
}

/**
 * The line under the address: what the device is, rather than what it is
 * called. The duration is replaced outright for a device the router is not
 * reporting — it has been connected for nothing at all, and "0s" would be a
 * figure the router never stated.
 */
function deviceMetaLine(device: DeviceRow): string {
  return [
    device.mac,
    device.network,
    device.present ? device.connectedFor : NOT_CONNECTED,
  ]
    .filter((part) => part !== "")
    .join(" · ");
}

/**
 * States why this machine has no control, or takes the statement back down.
 *
 * A row is kept between polls, so a machine that stopped being the local one —
 * an adapter that went away, a MAC that moved — has to lose the sentence as
 * well as gain a control.
 */
function fillDeviceLocalReason(row: HTMLElement, local: boolean): void {
  const existing = row.querySelector<HTMLElement>(".device-local");

  if (!local) {
    existing?.remove();

    return;
  }
  if (existing !== null) {
    return;
  }

  const reason = document.createElement("span");

  reason.className = "device-local";
  reason.textContent = DEVICE_LOCAL_REASON;
  row.querySelector(".device-identity")?.append(reason);
}

/** What the control offers to do, which is always the opposite of the state. */
const BLOCK_ACTION = "Block";
const UNBLOCK_ACTION = "Unblock";

/**
 * What the user is asked before anything is sent.
 *
 * The device is named, and its MAC given beside the name: two devices can share
 * a name, and the address is what the write actually acts on — so a
 * confirmation that only said "Block MacBookPro?" could be agreed to for the
 * wrong row.
 */
function deviceConfirmation(device: DeviceRow, blocked: boolean): string {
  const named = `${device.name} (${device.mac})`;

  return blocked
    ? `Block ${named} from the router's Wi-Fi?`
    : `Allow ${named} back onto the router's Wi-Fi?`;
}

/**
 * Asks, and sends only if the answer was yes.
 *
 * Nothing on the row is repainted here. What the router ends up refusing is
 * settled by the write and the re-read behind it, and a row that showed the
 * block straight away would be stating something that may well have been
 * refused — the next pushed model is the only thing that moves it.
 */
function pressBlock(device: DeviceRow, blocked: boolean): void {
  if (!window.confirm(deviceConfirmation(device, blocked))) {
    return;
  }

  window.popoverBridge?.setBlocked({ mac: device.mac, blocked });
}

/**
 * The row's control, created once and re-aimed thereafter — except on this
 * machine's own row, which carries {@link DEVICE_LOCAL_REASON} instead and no
 * control at all.
 *
 * The handler is assigned rather than added, because rows are kept between
 * polls: a listener added on every render would fire once per poll the row had
 * survived, turning one press into a handful of writes.
 */
function fillDeviceControl(row: HTMLElement, device: DeviceRow): void {
  const existing = row.querySelector<HTMLButtonElement>("[data-block]");

  if (device.local) {
    // The handler is given up before the button goes, rather than left for the
    // element to carry away: a detached control still holding a live `onclick`
    // is exactly the stale press this file is at pains elsewhere to avoid.
    if (existing !== null) {
      existing.onclick = null;
      existing.remove();
    }

    return;
  }

  const control = existing ?? document.createElement("button");

  if (existing === null) {
    control.type = "button";
    control.className = "device-block";
    control.dataset["block"] = "";
    row.append(control);
  }

  const wanted = !device.blocked;
  const label = wanted ? BLOCK_ACTION : UNBLOCK_ACTION;

  if (control.textContent !== label) {
    control.textContent = label;
  }

  control.onclick = (): void => {
    pressBlock(device, wanted);
  };
}

/** Brings one row up to date, in the element the device already had. */
function fillDeviceRow(row: HTMLElement, device: DeviceRow): void {
  row.dataset["mac"] = device.mac;
  // Stated on the row as well as in its parts, so a stylesheet has something to
  // hang on without the words having to go.
  row.dataset["blocked"] = String(device.blocked);
  row.dataset["present"] = String(device.present);
  row.dataset["local"] = String(device.local);

  setPart(row, ".device-name", device.name);
  setPart(row, ".device-ip", device.ip);
  setPart(row, ".device-meta", deviceMetaLine(device));
  setPart(
    row,
    ".device-access",
    device.blocked ? ACCESS_BLOCKED : ACCESS_ALLOWED,
  );
  fillDeviceLocalReason(row, device.local);
  fillDeviceControl(row, device);
}

/**
 * Writes the list into the pane, reusing the row each device already has.
 *
 * A device that left takes exactly its own row with it, and one that arrived
 * lands in the position the model gives it without the rows around it being
 * replaced. The MAC is the only field that can key on: a name may be absent or
 * duplicated, and an IP is a lease that moves.
 */
function renderDeviceRows(devices: readonly DeviceRow[]): void {
  const list = devicesList();

  if (list === null) {
    return;
  }

  const existing = rowsByMac(list);
  const ordered = devices.map((device) => {
    const row = existing.get(device.mac) ?? createDeviceRow();

    fillDeviceRow(row, device);

    return row;
  });

  list.replaceChildren(...ordered);
}

/**
 * Which of the four the pane is in.
 *
 * `empty` is the one that is derived rather than pushed: a list that answered
 * and held nothing is still a `listed` model, and only the count tells it from
 * a list that answered and held something.
 */
type DevicesState = "listed" | "empty" | "offline" | "no-password";

function devicesStateOf(model: DevicesModel): DevicesState {
  if (model.state !== "listed") {
    return model.state;
  }

  return model.devices.length === 0 ? "empty" : "listed";
}

/** Shows or hides one of the Devices pane's fixed regions. */
function showDevicesRegion(selector: string, visible: boolean): void {
  const element = document.querySelector<HTMLElement>(selector);

  if (element !== null) {
    element.hidden = !visible;
  }
}

/**
 * States why the last press changed nothing, or takes the statement back down.
 *
 * Written into a region of its own beside the rows rather than over them. The
 * rows are what the pane is for, and a write that failed has said nothing
 * whatever about which devices are connected.
 */
function renderDevicesRefusal(refusal: DeviceRefusal | undefined): void {
  const notice = document.querySelector<HTMLElement>("[data-devices-refusal]");

  if (notice === null) {
    return;
  }

  const said = refusal === undefined ? "" : deviceRefusalText(refusal);

  // `textContent`, never `innerHTML`: an endpoint arrives from the router.
  if (notice.textContent !== said) {
    notice.textContent = said;
  }

  notice.hidden = said === "";
}

/**
 * Puts a pushed device list on the pane.
 *
 * Four states and one notice that rides beside them, and the point of every one
 * is that it is not any of the others: a router that is not answering has not
 * said that nothing is connected to it, a router nobody has the password for has
 * not been asked at all, and a press the router refused has not emptied the
 * household. "No devices" is only ever printed when the router itself said so.
 */
function renderDevices(model: DevicesModel): void {
  if (model.state === "listed") {
    renderDeviceRows(model.devices);
  }

  const state = devicesStateOf(model);
  const pane = devicesPane();

  if (pane !== null) {
    pane.dataset["devicesState"] = state;
  }

  showDevicesRegion("[data-devices]", state === "listed");
  showDevicesRegion("[data-devices-empty]", state === "empty");
  showDevicesRegion("[data-devices-offline]", state === "offline");
  showDevicesRegion("[data-devices-no-password]", state === "no-password");
  renderDevicesRefusal(model.state === "listed" ? model.refusal : undefined);
}

window.applyDevicesModel = renderDevices;

window.showPopoverTab = (name: string): void => {
  // A name the page does not know leaves the pane exactly where it was: this
  // arrives from outside the page, and there is no pane called anything else.
  if (isTabName(name)) {
    showTab(name);
  }
};

window.applyPopoverModel = (model: PopoverModel): void => {
  // Before anything is filled in: a control that has just come back has to be
  // on the page in time for this model's own strings to reach it.
  applyControls(model);
  bindControls();
  // From the root attribute, never from the model: which pane is showing is
  // the user's, and a poll lands every couple of seconds while the panel is
  // open. A model that decided this would snatch the panel back to Usage
  // mid-read.
  applyTabs();

  const fields = fieldsOf(model);

  document.querySelectorAll<HTMLElement>("[data-field]").forEach((node) => {
    const name = node.dataset["field"];

    if (name !== undefined && name in fields) {
      node.textContent = fields[name] ?? "";
    }
  });

  // Three flags drive every conditional in the stylesheet: whether the figures
  // are current, whether there is a plan limit to measure against, and how
  // close usage is to that limit. No comparison happens here — the state is
  // decided in the main process and the stylesheet only colours by it.
  const root = document.documentElement;

  root.dataset["stale"] = String(model.freshness.stale);
  root.dataset["limit"] = model.progress.available ? "set" : "unset";
  root.dataset["usage"] = model.progress.state;

  const dial = document.querySelector<HTMLElement>("[data-dial]");

  if (dial !== null) {
    dial.setAttribute("aria-label", model.progress.description);
    drawArc(dialArc(dial), model.progress.sweep);
  }

  // One peak for both lines: the point of stacking them is that their heights
  // mean the same thing. An offline poll records no sample, so the history is
  // unchanged and the shape stays exactly as it was — dimmed by `data-stale`,
  // never blanked.
  const { download, upload, peak } = model.history;

  drawSpark("download", download, peak);
  drawSpark("upload", upload, peak);

  applySignal(model);
  applyPlanLimit(model);
  applyPlanDays(model);
  applyPlanCapPrompt(model);
  applyPace(model);
  applyForfait(model);
  applyNotice(model);
  applySync(model);
};

window.resetPopoverView = (): void => {
  bindControls();
  showSettings(false);
  // Said again on every open. The panel is hidden rather than destroyed
  // between opens, so the main process has to be told the tab it is coming
  // back on — a hidden panel stood the list down, and a reopen on Devices has
  // to stand it back up without waiting for a press on the strip.
  window.popoverBridge?.setTab(currentTab());
  // Redrawn from the tab already selected, never reset to Usage. The settings
  // are put away on every open because they are typed a few times a year and
  // the figures are what the panel is opened for; a tab is the opposite —
  // someone who went looking for a device usually looks again, and the tray
  // title states the usage figure without the panel being opened at all.
  applyTabs();
};

// The page is static and the script is deferred, so the controls exist by now.
// Binding here as well as on every model means the button works even if the
// first push is late.
bindControls();
