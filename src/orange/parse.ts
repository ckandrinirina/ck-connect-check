/**
 * The Orange selfcare boundary. `http://123.orange.mg/info-conso/` is
 * server-rendered HTML with no JSON API behind it, so the parse *is* the
 * integration — and HTML never escapes `src/orange/`, exactly as XML never
 * escapes `src/hilink/`. Pure: a string in, typed forfaits out, no network.
 *
 * The markup is read as a document rather than pattern-matched, because a
 * carrier's redesign reorders attributes, re-indents and adds wrappers long
 * before it renames a class. The tokeniser below is small and lives here rather
 * than coming from a dependency: this runs in Electron's main process, the app
 * ships no runtime dependencies at all, and one page's worth of tag soup does
 * not justify putting a full DOM implementation inside a menu bar app's bundle.
 *
 * Every read is best-effort. A page that states nothing yields a forfait list
 * that is empty and fields that are absent — never a zero the carrier did not
 * state, and never an exception.
 */

import type { OrangeAccount, OrangeForfait, OrangeInfoConso } from "./types.js";

/**
 * French octet units onto the decimal 1000³ scale carriers bill in. Declared
 * here rather than imported: `src/hilink/parse.ts` owns the router's English
 * `KB`/`GB` table because that is the device's wire format, and `Ko`/`Go` is
 * the portal's — each boundary keeps the spelling its own source speaks.
 */
const OCTET_UNIT_BYTES: Record<string, number> = {
  O: 1,
  KO: 1_000,
  MO: 1_000_000,
  GO: 1_000_000_000,
  TO: 1_000_000_000_000,
};

/** `7.37Go`, `1,5Go`, `800Ko` — a number, an optional space, a French unit. */
const OCTETS = /^(\d+(?:[.,]\d+)?)\s*(o|ko|mo|go|to)$/i;

/** `0 Ar`, `12 500 Ar` — the recharge balance, space-grouped. */
const ARIARY = /^([\d\s.,]+)\s*ar$/i;

/** The heading that opens the forfait list, folded to match accent-free pages. */
const FORFAITS_HEADING = "forfaits en cours de validite";

/** Elements that never hold children, so they must not open a scope. */
const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Elements whose content is text, not markup — their `<` must not open a tag. */
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea"]);

/**
 * Deepest nesting the tokeniser will open. Unclosed tags in a hostile or broken
 * page would otherwise grow the tree without bound, and every read below walks
 * it recursively; capping the depth keeps this function total.
 */
const MAX_DEPTH = 512;

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"',
};

interface OrangeElement {
  tag: string;
  attrs: Record<string, string>;
  classes: string[];
  children: OrangeNode[];
}

/** A text node is its own text; anything else is an element. */
type OrangeNode = OrangeElement | string;

function decodeEntities(text: string): string {
  return text.replace(
    /&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g,
    (whole: string, body: string) => {
      if (body.startsWith("#")) {
        const hex = body[1] === "x" || body[1] === "X";
        const code = Number.parseInt(
          hex ? body.slice(2) : body.slice(1),
          hex ? 16 : 10,
        );
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : whole;
      }
      return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
    },
  );
}

function isElement(node: OrangeNode): node is OrangeElement {
  return typeof node !== "string";
}

function isWhitespace(character: string | undefined): boolean {
  return (
    character === " " ||
    character === "\t" ||
    character === "\n" ||
    character === "\r" ||
    character === "\f"
  );
}

/** Reads `name`, `name=value`, `name="value"` up to the tag's closing `>`. */
function readAttributes(
  html: string,
  start: number,
): { attrs: Record<string, string>; end: number; selfClosing: boolean } {
  const attrs: Record<string, string> = {};
  let index = start;
  let selfClosing = false;

  while (index < html.length) {
    while (isWhitespace(html[index])) {
      index += 1;
    }
    const character = html[index];
    if (character === undefined) {
      break;
    }
    if (character === ">") {
      index += 1;
      break;
    }
    if (character === "/") {
      selfClosing = true;
      index += 1;
      continue;
    }

    const nameStart = index;
    while (
      index < html.length &&
      !isWhitespace(html[index]) &&
      html[index] !== "=" &&
      html[index] !== "/" &&
      html[index] !== ">"
    ) {
      index += 1;
    }
    const name = html.slice(nameStart, index).toLowerCase();
    if (name === "") {
      index += 1;
      continue;
    }

    while (isWhitespace(html[index])) {
      index += 1;
    }
    if (html[index] !== "=") {
      attrs[name] = "";
      continue;
    }
    index += 1;
    while (isWhitespace(html[index])) {
      index += 1;
    }

    const quote = html[index];
    if (quote === '"' || quote === "'") {
      const close = html.indexOf(quote, index + 1);
      if (close === -1) {
        attrs[name] = decodeEntities(html.slice(index + 1));
        index = html.length;
        break;
      }
      attrs[name] = decodeEntities(html.slice(index + 1, close));
      index = close + 1;
      continue;
    }

    const valueStart = index;
    while (
      index < html.length &&
      !isWhitespace(html[index]) &&
      html[index] !== ">"
    ) {
      index += 1;
    }
    attrs[name] = decodeEntities(html.slice(valueStart, index));
  }

  return { attrs, end: index, selfClosing };
}

/** Pops the stack back to the nearest matching open tag, ignoring strays. */
function closeTag(stack: OrangeElement[], name: string): void {
  for (let depth = stack.length - 1; depth > 0; depth -= 1) {
    if (stack[depth]?.tag === name) {
      stack.length = depth;
      return;
    }
  }
}

/**
 * Tag soup into a tree. Unknown tags, stray `<`, unclosed elements, mismatched
 * closers and missing quotes are all absorbed rather than reported: the only
 * thing a carrier's page owes us is bytes.
 */
function parseDocument(html: string): OrangeElement {
  const root: OrangeElement = {
    tag: "#document",
    attrs: {},
    classes: [],
    children: [],
  };
  const stack: OrangeElement[] = [root];
  let index = 0;

  const push = (node: OrangeNode): void => {
    stack[stack.length - 1]?.children.push(node);
  };

  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open === -1) {
      push(decodeEntities(html.slice(index)));
      break;
    }
    if (open > index) {
      push(decodeEntities(html.slice(index, open)));
    }

    if (html.startsWith("<!--", open)) {
      const close = html.indexOf("-->", open + 4);
      index = close === -1 ? html.length : close + 3;
      continue;
    }
    if (html.startsWith("<!", open) || html.startsWith("<?", open)) {
      const close = html.indexOf(">", open + 2);
      index = close === -1 ? html.length : close + 1;
      continue;
    }
    if (html.startsWith("</", open)) {
      const close = html.indexOf(">", open + 2);
      const name = html
        .slice(open + 2, close === -1 ? html.length : close)
        .trim()
        .toLowerCase();
      closeTag(stack, name);
      index = close === -1 ? html.length : close + 1;
      continue;
    }

    const name = /^<([a-zA-Z][^\s/>]*)/.exec(html.slice(open, open + 128));
    if (name === null) {
      push("<");
      index = open + 1;
      continue;
    }

    const tag = (name[1] ?? "").toLowerCase();
    const { attrs, end, selfClosing } = readAttributes(
      html,
      open + name[0].length,
    );
    index = end;

    if (RAW_TEXT_TAGS.has(tag)) {
      const rest = html.slice(index);
      const closer = new RegExp(`</${tag}[^>]*>`, "i").exec(rest);
      index =
        closer === null ? html.length : index + closer.index + closer[0].length;
      continue;
    }

    const element: OrangeElement = {
      tag,
      attrs,
      classes: (attrs["class"] ?? "")
        .split(/\s+/)
        .filter((entry) => entry !== ""),
      children: [],
    };
    push(element);

    if (!selfClosing && !VOID_TAGS.has(tag) && stack.length < MAX_DEPTH) {
      stack.push(element);
    }
  }

  return root;
}

function* descendants(element: OrangeElement): Generator<OrangeElement> {
  for (const child of element.children) {
    if (isElement(child)) {
      yield child;
      yield* descendants(child);
    }
  }
}

function textOf(element: OrangeElement): string {
  let text = "";
  for (const child of element.children) {
    text += isElement(child) ? textOf(child) : child;
  }
  return text;
}

/** Collapses the markup's indentation into the single spaces a reader sees. */
function normalise(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Lower-cased, accent-stripped and with typographic apostrophes flattened, so a
 * phrase still matches a page that drops its accents the way the USSD replies do.
 */
function fold(text: string): string {
  return normalise(text)
    .toLowerCase()
    .replace(/[‘’ʼ´`]/g, "'")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function firstWithClass(
  nodes: readonly OrangeElement[],
  className: string,
): OrangeElement | undefined {
  return nodes.find((node) => node.classes.includes(className));
}

/** The reader-visible text of the first element carrying `className`, if any. */
function textUnderClass(
  nodes: readonly OrangeElement[],
  className: string,
): string | undefined {
  const element = firstWithClass(nodes, className);
  const text = element === undefined ? "" : normalise(textOf(element));
  return text === "" ? undefined : text;
}

/** The path from the root down to the deepest element the predicate accepts. */
function findInnermost(
  element: OrangeElement,
  matches: (candidate: OrangeElement) => boolean,
): OrangeElement[] | null {
  for (const child of element.children) {
    if (!isElement(child)) {
      continue;
    }
    const found = findInnermost(child, matches);
    if (found !== null) {
      return [element, ...found];
    }
  }
  return matches(element) ? [element] : null;
}

/**
 * A number the page stated in French octets, in decimal octets. `null` — never
 * zero — for anything that is not a volume, because "no figure" and "no data
 * used" are different answers.
 */
export function parseOctets(text: string): number | null {
  const match = OCTETS.exec(normalise(text));
  if (match === null) {
    return null;
  }
  const [, amount = "", unit = ""] = match;
  const scale = OCTET_UNIT_BYTES[unit.toUpperCase()];
  if (scale === undefined) {
    return null;
  }
  const bytes = Math.round(Number(amount.replace(",", ".")) * scale);
  return Number.isFinite(bytes) ? bytes : null;
}

function parseAriary(text: string): number | null {
  const match = ARIARY.exec(normalise(text));
  if (match === null) {
    return null;
  }
  const value = Number.parseFloat(
    (match[1] ?? "").replace(/[\s.]/g, "").replace(",", "."),
  );
  return Number.isFinite(value) ? value : null;
}

/** The `.bundle-item` elements of the `Forfaits en cours de validité` section. */
function findBundleItems(root: OrangeElement): OrangeElement[] {
  const path = findInnermost(root, (candidate) =>
    fold(textOf(candidate)).includes(FORFAITS_HEADING),
  );
  if (path === null) {
    return [];
  }

  // Out from the heading to the first ancestor that actually holds bundles,
  // stopping short of the page itself so another section's items are never
  // swept in when this one lists none.
  for (let depth = path.length - 1; depth >= 0; depth -= 1) {
    const ancestor = path[depth];
    if (
      ancestor === undefined ||
      ancestor.tag === "body" ||
      ancestor.tag === "html" ||
      ancestor.tag === "#document"
    ) {
      break;
    }
    const items = [...descendants(ancestor)].filter((node) =>
      node.classes.includes("bundle-item"),
    );
    if (items.length > 0) {
      return items;
    }
  }
  return [];
}

function readForfait(item: OrangeElement): OrangeForfait | null {
  const nodes = [item, ...descendants(item)];

  // A bundle item with no name is not a forfait shape at all, so it is skipped
  // rather than emitted under an empty label.
  const label = textUnderClass(nodes, "item_title");
  if (label === undefined) {
    return null;
  }
  const forfait: OrangeForfait = { label };

  const nature = textUnderClass(nodes, "title-da-nature");
  if (nature !== undefined) {
    forfait.nature = nature;
  }

  // The volume sits in its own element inside the `Vous avez consommé …`
  // sentence; reading it from there rather than from the whole page keeps a
  // second forfait's figure from being picked up by mistake.
  const sentence = nodes.find((node) => fold(textOf(node)).includes("consomm"));
  for (const node of sentence === undefined ? [] : descendants(sentence)) {
    const bytes = parseOctets(textOf(node));
    if (bytes !== null) {
      forfait.consumedBytes = bytes;
      break;
    }
  }

  // `full.infoconso.js` draws a ring from these two; Wifiber Go+ SSE carries
  // neither, and a percentage the page never stated is not invented for it.
  const ring = firstWithClass(nodes, "bundle-circlebar");
  const bundleType = (ring?.attrs["data-bundle-type"] ?? "").trim();
  if (bundleType !== "") {
    forfait.bundleType = bundleType;
  }
  const percent = Number.parseFloat(ring?.attrs["data-bundle-pcvalue"] ?? "");
  if (Number.isFinite(percent)) {
    forfait.percent = percent;
  }

  return forfait;
}

/**
 * The `Compte principal` lines. They describe the subscription, not any one
 * forfait, so they are returned beside the list rather than inside it.
 */
function readAccount(root: OrangeElement): OrangeAccount {
  const account: OrangeAccount = {};

  for (const paragraph of descendants(root)) {
    if (paragraph.tag !== "p") {
      continue;
    }
    const folded = fold(textOf(paragraph));
    const stated = [...descendants(paragraph)]
      .map((node) => normalise(textOf(node)))
      .find((text) => text !== "");

    if (
      account.offer === undefined &&
      folded.includes("sur l'offre") &&
      stated !== undefined
    ) {
      account.offer = stated;
    }
    if (
      account.balanceAr === undefined &&
      folded.includes("solde de votre compte")
    ) {
      const balance = parseAriary(stated ?? "");
      if (balance !== null) {
        account.balanceAr = balance;
      }
    }
  }

  return account;
}

/** A whole `info-conso` page, read. Total: no input makes this throw. */
export function parseInfoConso(html: string): OrangeInfoConso {
  const root = parseDocument(html);
  const forfaits: OrangeForfait[] = [];
  for (const item of findBundleItems(root)) {
    const forfait = readForfait(item);
    if (forfait !== null) {
      forfaits.push(forfait);
    }
  }
  return { account: readAccount(root), forfaits };
}
