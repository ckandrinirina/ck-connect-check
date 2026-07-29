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

import type { PopoverModel } from "../main/view-model.js";

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
}

declare global {
  interface Window {
    /** Called by `src/main/popover.ts` after every poll, and once on load. */
    applyPopoverModel(model: PopoverModel): void;
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
    monthDownload: model.monthDownload,
    monthUpload: model.monthUpload,
    downloadRate: model.downloadRate,
    uploadRate: model.uploadRate,
    connectedDevices: model.connectedDevices,
    planLimitUnit: model.planLimit.unit,
    planLimitError: model.planLimit.error,
    planDaysUnit: model.planDays.unit,
    planDaysError: model.planDays.error,
    planCapMessage: model.planCapPrompt?.message ?? "",
    paceBand: model.pace?.band ?? "",
    paceSustainable: model.pace?.sustainable ?? "",
    paceAfforded: model.pace?.afforded ?? "",
    paceConsumed: model.pace?.consumed ?? "",
    paceNote: model.pace?.note ?? "",
    paceHint: model.pace?.hint ?? "",
    percent: model.progress.label,
    prompt: model.progress.prompt,
    allowanceRemaining: model.allowance.remaining,
    allowancePlan: model.allowance.planLabel,
    allowanceExpires: model.allowance.expires,
    allowanceDaysLeft: model.allowance.daysUntilExpiry,
    allowanceSynced: model.allowance.syncedAgo,
    allowanceNote: model.allowance.note,
    syncStatus: model.sync.status,
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
 * Shows the pace row, or takes it off the panel entirely.
 *
 * `hidden` rather than an empty row: the fields are already blank when there is
 * no reading, but a section that still holds its space open reads as a figure
 * the app failed to produce, which is precisely what it is not.
 *
 * The band's state goes on the section rather than on the word, so the
 * stylesheet decides what `warning` and `over` look like — nothing here knows a
 * colour.
 */
function applyPace(model: PopoverModel): void {
  const row = document.querySelector<HTMLElement>("[data-pace]");

  if (row === null) return;

  row.hidden = model.pace === null;

  if (model.pace === null || model.pace.state === "") {
    delete row.dataset["state"];
  } else {
    row.dataset["state"] = model.pace.state;
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

  document.documentElement.dataset["allowance"] = allowance.available
    ? allowance.stale
      ? "stale"
      : "fresh"
    : "none";
}

window.applyPopoverModel = (model: PopoverModel): void => {
  bindControls();

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
  applySync(model);
};

// The page is static and the script is deferred, so the controls exist by now.
// Binding here as well as on every model means the button works even if the
// first push is late.
bindControls();
