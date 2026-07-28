/**
 * The popover's renderer. It does exactly one thing: put the strings the main
 * process hands it into the DOM.
 *
 * There is no arithmetic here, no formatting and no knowledge of bytes — every
 * value arrives from `buildPopoverModel` already spelled the way it appears on
 * screen. The one exception is the dial's sweep, which arrives as a share of a
 * ring and is multiplied by that ring's circumference: geometry is the
 * renderer's own business, because only the renderer knows how big the ring is.
 *
 * The main process pushes updates by calling {@link Window.applyPopoverModel}.
 * One global entry point rather than an IPC channel: there is a single message,
 * it only ever flows main → renderer, and a preload bridge would be more
 * machinery than that deserves.
 */

import type { PopoverModel } from "../main/view-model.js";

declare global {
  interface Window {
    /** Called by `src/main/popover.ts` after every poll, and once on load. */
    applyPopoverModel(model: PopoverModel): void;
  }
}

/** Flattens the model onto the `data-field` names used in `index.html`. */
function fieldsOf(model: PopoverModel): Record<string, string> {
  return {
    carrier: model.carrier,
    signal: model.signal,
    freshness: model.freshness.label,
    monthTotal: model.monthTotal,
    monthDownload: model.monthDownload,
    monthUpload: model.monthUpload,
    downloadRate: model.downloadRate,
    uploadRate: model.uploadRate,
    connectedDevices: model.connectedDevices,
    daysUntilReset: model.daysUntilReset,
    percent: model.progress.label,
    prompt: model.progress.prompt,
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

window.applyPopoverModel = (model: PopoverModel): void => {
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
};
