/**
 * The popover's renderer. It does exactly one thing: put the strings the main
 * process hands it into the DOM.
 *
 * There is no arithmetic here, no formatting and no knowledge of bytes — every
 * value arrives from `buildPopoverModel` already spelled the way it appears on
 * screen. The only value that is not text is the progress bar's width, which
 * arrives as a ready-made CSS length.
 *
 * The main process pushes updates by calling {@link Window.applyPopoverModel}.
 * One global entry point rather than an IPC channel: there is a single message,
 * it only ever flows main → renderer, and a preload bridge would be more
 * machinery than that deserves.
 */

import type { PopoverModel } from '../main/view-model.js';

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

window.applyPopoverModel = (model: PopoverModel): void => {
  const fields = fieldsOf(model);

  document.querySelectorAll<HTMLElement>('[data-field]').forEach((node) => {
    const name = node.dataset['field'];

    if (name !== undefined && name in fields) {
      node.textContent = fields[name] ?? '';
    }
  });

  // Two flags drive every conditional in the stylesheet: whether the figures
  // are current, and whether there is a plan limit to draw a bar against.
  // T-08 adds the usage state here as a third, for colouring the bar.
  const root = document.documentElement;

  root.dataset['stale'] = String(model.freshness.stale);
  root.dataset['limit'] = model.progress.available ? 'set' : 'unset';

  const fill = document.querySelector<HTMLElement>('[data-fill]');

  if (fill !== null) {
    fill.style.width = model.progress.fillWidth;
  }
};
