/**
 * Which of the portal's live forfaits the data meter is actually measuring.
 *
 * Pure: parsed forfaits and the remembered label in, a selection out. No
 * network and no file — the fetch lives in the poller and the config on disk,
 * exactly as the parse keeps HTML inside `parse.ts`.
 *
 * The choice is made from what each forfait *is* — its `data-bundle-type`, or
 * failing that its nature line — never from where it sits in the list. Position
 * is a layout detail, and a promotion could reorder the page tomorrow without
 * the plan changing at all.
 *
 * Where several data forfaits are live at once — a base plan plus a top-up is
 * the obvious case — stability beats cleverness: a dial that jumps between two
 * plans on alternate polls is worse than one that tracks the wrong plan
 * consistently. So the user's choice is remembered by label, and only when that
 * label is absent from the page does the app fall back to the first data
 * forfait and say the choice was not the user's.
 */

import type { OrangeForfait } from "./types.js";

/**
 * What a forfait is, as far as a data meter cares.
 *
 * `other` is a kind the app recognises and knows it does not want; `unknown` is
 * one it cannot place. The two are kept apart because they deserve opposite
 * treatment — a voice bundle is discarded, an unplaceable one is carried
 * through so the panel can name it, for the same reason an unrecognised router
 * error code reaches the surface with its number.
 */
type ForfaitKind = "data" | "other" | "unknown";

/**
 * `full.infoconso.js` names four `data-bundle-type`s — `credit`, `data`,
 * `voice`, `sms`. One of them is what a data meter measures; the other three
 * answer a question nobody asked of this app. A fifth would be none of these,
 * and is left unplaced rather than guessed at.
 */
const DATA_BUNDLE_TYPE = "data";
const OTHER_BUNDLE_TYPES = new Set(["credit", "voice", "sms"]);

/** The nature line the live capture states over a Wifiber Go+ SSE. */
const DATA_NATURE = "internet";

/** The same three kinds as the portal spells them for a reader, in French. */
const OTHER_NATURES = ["voix", "sms", "credit"];

/**
 * Lower-cased and accent-stripped, so `Crédit` still matches a page that drops
 * its accents. Declared here rather than imported: `parse.ts` folds markup and
 * this folds a carrier's vocabulary, and neither owes the other its spelling.
 */
function fold(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

/**
 * What kind of bundle a forfait is. `data-bundle-type` is read first because
 * the portal states it outright; the nature line is a human label and only
 * consulted when no ring says otherwise.
 */
function kindOf(forfait: OrangeForfait): ForfaitKind {
  const bundleType = fold(forfait.bundleType ?? "");
  if (bundleType !== "") {
    if (bundleType === DATA_BUNDLE_TYPE) return "data";

    return OTHER_BUNDLE_TYPES.has(bundleType) ? "other" : "unknown";
  }

  const nature = fold(forfait.nature ?? "");
  if (nature.includes(DATA_NATURE)) return "data";

  return OTHER_NATURES.some((word) => nature.includes(word))
    ? "other"
    : "unknown";
}

/** What {@link selectForfait} concluded about a page's forfaits. */
export interface ForfaitSelection {
  /**
   * The forfait the meter measures, or `null` when the page listed no data
   * forfait at all — a voice-only line, an expired plan, or a page whose
   * vocabulary the app could not place.
   */
  selected: OrangeForfait | null;
  /**
   * Everything the user could plausibly be shown, in page order: every data
   * forfait, plus any whose kind is unrecognised. Voice, SMS and credit bundles
   * are left out, since offering them would be offering a mistake.
   */
  candidates: OrangeForfait[];
  /**
   * Whether {@link ForfaitSelection.selected} is the one the user chose. False
   * whenever the app picked for them — including when a remembered label no
   * longer appears on the page — so the panel can say so rather than presenting
   * a guess as a decision.
   */
  remembered: boolean;
}

/**
 * Picks the forfait the meter should measure.
 *
 * `rememberedLabel` is the user's stored choice; absent on a first run, and
 * ignored when it names a forfait the page no longer lists or one that is not
 * data at all.
 */
export function selectForfait(
  forfaits: readonly OrangeForfait[],
  rememberedLabel?: string,
): ForfaitSelection {
  const candidates = forfaits.filter((forfait) => kindOf(forfait) !== "other");
  const data = candidates.filter((forfait) => kindOf(forfait) === "data");

  // Only a data forfait may be remembered: a stored label naming a voice bundle
  // is a stale choice, not an instruction to measure minutes.
  const wanted = fold(rememberedLabel ?? "");
  const chosen =
    wanted === ""
      ? undefined
      : data.find((forfait) => fold(forfait.label) === wanted);

  if (chosen !== undefined) {
    return { selected: chosen, candidates, remembered: true };
  }

  return { selected: data[0] ?? null, candidates, remembered: false };
}
