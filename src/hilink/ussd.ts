/**
 * The `#359#` dialogue: ask the carrier what is actually left, and hand back one
 * {@link Allowance} or a reason there is none. Never rejects — the caller is a
 * menu bar app, and a carrier that went quiet is a normal outcome, not a crash.
 *
 * The mechanics are send-then-poll: `POST /api/ussd/send`, then `GET /api/ussd/get`
 * until it answers `<content>` instead of `111019`. Reading those replies is
 * entirely T-16's job; nothing here re-parses carrier text.
 *
 * Three rules make this safe to run against a real SIM, and each is enforced in
 * exactly one place:
 *
 * - the modem has a single USSD channel, so a dialogue already in flight is
 *   refused rather than queued ({@link UssdDialogue.readAllowance}'s guard);
 * - `/api/ussd/release` is issued from a `finally`, so no exit path can skip it;
 * - every wait is bounded and comes from the injected {@link UssdClock}, so a
 *   carrier that stops answering ends the attempt instead of hanging it.
 */

import { systemClock, type Clock } from "../domain/quota.js";
import {
  HilinkApiError,
  HilinkParseError,
  readReply,
  requireText,
} from "./parse.js";
import {
  parseAllowance,
  parseUssdContent,
  parseUssdError,
} from "./ussd-parse.js";
import type { Allowance, OfflineReason, UssdReply } from "./types.js";

export const USSD_STATUS_ENDPOINT = "/api/ussd/status";
export const USSD_SEND_ENDPOINT = "/api/ussd/send";
export const USSD_GET_ENDPOINT = "/api/ussd/get";
export const USSD_RELEASE_ENDPOINT = "/api/ussd/release";

/** The carrier code that opens the allowance menu, as captured from the device. */
export const ALLOWANCE_CODE = "#359#";

/** The only `codeType` this device was ever observed to accept. */
const CODE_TYPE = "CodeType";

/** The router's answer to a `POST` made without a login — "no rights". */
const NO_RIGHTS_CODE = 100003;

/** The `<result>` value meaning no dialogue is in flight on the device. */
const IDLE_RESULT = 0;

/** Gap between `/api/ussd/get` polls. The carrier takes seconds, not milliseconds. */
const DEFAULT_POLL_INTERVAL_MS = 1_500;

/** How long one reply is waited for before the attempt is abandoned. */
const DEFAULT_REPLY_TIMEOUT_MS = 20_000;

/**
 * "Now", plus the ability to wait. Extends the domain {@link Clock} so the app
 * has one notion of time; `wait` is injected for the same reason `now` is — a
 * test must never spend real seconds polling.
 */
export interface UssdClock extends Clock {
  wait(milliseconds: number): Promise<void>;
}

/** The real clock, for production wiring. */
export const systemUssdClock: UssdClock = {
  now: () => systemClock.now(),
  wait: (milliseconds) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};

/**
 * Why a dialogue produced no allowance. `busy` and `not-logged-in` are the two
 * the user can act on — wait, or sign in; `unreadable` means the carrier
 * answered something we could not turn into a figure. The rest mirror
 * {@link OfflineReason}, so the panel renders them the way it already does.
 */
export type UssdFailure =
  OfflineReason | "busy" | "not-logged-in" | "unreadable";

export type AllowanceResult =
  { ok: true; allowance: Allowance } | { ok: false; reason: UssdFailure };

/** One navigation step: the label to look for, and the digit recorded for it. */
export interface UssdMenuStep {
  /**
   * Matched against the previous reply's option labels. Null when no label is
   * known in advance — the offer's own name varies by subscription — and the
   * recorded digit is then the only thing to go on.
   */
  label: RegExp | null;
  /** The digit captured from the device, used when no label matches. */
  fallbackDigit: string;
}

/**
 * The recorded `#359#` path after the code itself: the offer list, the offer,
 * then `Info conso`. Labels are matched without accents because the device's
 * replies carry none.
 */
export const MENU_SCRIPT: readonly UssdMenuStep[] = [
  { label: /mes\s+offres/i, fallbackDigit: "1" },
  { label: null, fallbackDigit: "1" },
  { label: /info\s+conso/i, fallbackDigit: "1" },
];

/** The carrier never answered inside the bounded poll window. */
export class UssdTimeoutError extends Error {
  constructor(windowMs: number) {
    super(`${USSD_GET_ENDPOINT}: no carrier reply within ${windowMs}ms`);
    this.name = "UssdTimeoutError";
  }
}

/**
 * The `/api/ussd/send` body. The content is either our own recorded code or a
 * digit group the option parser already restricted to `\d{1,3}`, so nothing here
 * can carry XML that would need escaping.
 */
export function sendRequestXml(content: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>' +
    "<request>" +
    `<content>${content}</content>` +
    `<codeType>${CODE_TYPE}</codeType>` +
    "<timeout></timeout>" +
    "</request>"
  );
}

/**
 * True when `/api/ussd/status` reports no dialogue in flight. A body we cannot
 * read raises rather than being assumed idle — starting a second dialogue on a
 * busy channel is the one mistake this check exists to prevent.
 */
export function isUssdIdle(xml: string): boolean {
  const fields = readReply(xml, USSD_STATUS_ENDPOINT);
  const result = requireText(fields, "result", USSD_STATUS_ENDPOINT);
  if (!/^-?\d+$/.test(result)) {
    throw new HilinkParseError(
      USSD_STATUS_ENDPOINT,
      `<result> is not numeric: "${result}"`,
    );
  }
  return Number(result) === IDLE_RESULT;
}

/**
 * The digit to send for one step. Label matching beats position, so a carrier
 * inserting or reordering a menu entry cannot land us on the wrong screen; the
 * recorded digit is the fallback when no label matches.
 */
export function chooseDigit(reply: UssdReply, step: UssdMenuStep): string {
  const { label } = step;
  if (label !== null) {
    const matched = reply.options.find((option) => label.test(option.label));
    if (matched !== undefined) {
      return matched.digit;
    }
  }
  return step.fallbackDigit;
}

/** What the dialogue needs from the router client: two requests and its error taxonomy. */
export interface UssdTransport {
  get(path: string): Promise<string>;
  post(path: string, body: string): Promise<string>;
  /** How the transport's own failures — unreachable, timed out — map to a reason. */
  transportReason(error: unknown): OfflineReason;
}

/** Per-call timing. Every field has a default; tests override all three. */
export interface UssdOptions {
  clock?: UssdClock;
  pollIntervalMs?: number;
  replyTimeoutMs?: number;
}

/** The resolved timing one dialogue runs on. */
interface Timing {
  clock: UssdClock;
  pollIntervalMs: number;
  replyTimeoutMs: number;
}

function failureReason(
  error: unknown,
  transportReason: (error: unknown) => OfflineReason,
): UssdFailure {
  if (error instanceof UssdTimeoutError) {
    return "timeout";
  }
  if (error instanceof HilinkApiError) {
    if (error.code === NO_RIGHTS_CODE) {
      return "not-logged-in";
    }
    return error.isStaleSession ? "session" : "error";
  }
  if (error instanceof HilinkParseError) {
    return "unreadable";
  }
  return transportReason(error);
}

export class UssdDialogue {
  readonly #transport: UssdTransport;
  /** The modem has one USSD channel, so a second dialogue is refused, not queued. */
  #inFlight = false;

  constructor(transport: UssdTransport) {
    this.#transport = transport;
  }

  /**
   * Run the whole dialogue and resolve to an allowance or a reason. The in-flight
   * flag is set before the first `await`, so two overlapping calls can never
   * interleave requests on the single channel.
   */
  async readAllowance(options: UssdOptions = {}): Promise<AllowanceResult> {
    if (this.#inFlight) {
      return { ok: false, reason: "busy" };
    }
    this.#inFlight = true;

    const timing: Timing = {
      clock: options.clock ?? systemUssdClock,
      pollIntervalMs: options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      replyTimeoutMs: options.replyTimeoutMs ?? DEFAULT_REPLY_TIMEOUT_MS,
    };

    try {
      if (!isUssdIdle(await this.#transport.get(USSD_STATUS_ENDPOINT))) {
        // Something else holds the channel: nothing is sent, and nothing of
        // someone else's is released.
        return { ok: false, reason: "busy" };
      }
      try {
        return await this.#run(timing);
      } finally {
        await this.#release();
      }
    } catch (error) {
      return {
        ok: false,
        reason: failureReason(error, (cause) =>
          this.#transport.transportReason(cause),
        ),
      };
    } finally {
      this.#inFlight = false;
    }
  }

  /** The code, then one send per scripted step, then the figure they lead to. */
  async #run(timing: Timing): Promise<AllowanceResult> {
    let reply = await this.#exchange(ALLOWANCE_CODE, timing);
    for (const step of MENU_SCRIPT) {
      reply = await this.#exchange(chooseDigit(reply, step), timing);
    }

    const allowance = parseAllowance(reply);
    if (allowance === null) {
      return { ok: false, reason: "unreadable" };
    }
    return { ok: true, allowance };
  }

  /** One send and the reply it earns. Raises on anything the router refuses. */
  async #exchange(content: string, timing: Timing): Promise<UssdReply> {
    readReply(
      await this.#transport.post(USSD_SEND_ENDPOINT, sendRequestXml(content)),
      USSD_SEND_ENDPOINT,
    );
    return await this.#awaitReply(timing);
  }

  /**
   * Poll `/api/ussd/get` until it carries content. The window is measured on the
   * injected clock, so the only thing bounding it is time the clock reports —
   * never a real delay.
   */
  async #awaitReply({
    clock,
    pollIntervalMs,
    replyTimeoutMs,
  }: Timing): Promise<UssdReply> {
    const deadline = clock.now().getTime() + replyTimeoutMs;

    for (;;) {
      const body = await this.#transport.get(USSD_GET_ENDPOINT);
      const state = parseUssdError(body);
      if (state.kind === "ready") {
        return parseUssdContent(body);
      }
      if (state.kind === "error") {
        throw new HilinkApiError(USSD_GET_ENDPOINT, state.code);
      }
      if (clock.now().getTime() + pollIntervalMs > deadline) {
        throw new UssdTimeoutError(replyTimeoutMs);
      }
      await clock.wait(pollIntervalMs);
    }
  }

  /** Free the channel. Never raises: a failed release must not replace the real reason. */
  async #release(): Promise<void> {
    try {
      await this.#transport.get(USSD_RELEASE_ENDPOINT);
    } catch {
      // The device frees the channel on its own timer anyway, and the dialogue
      // has already produced its result.
    }
  }
}
