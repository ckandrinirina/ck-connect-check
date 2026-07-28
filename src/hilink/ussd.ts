/**
 * Skeleton only — the dialogue itself is not implemented yet. This exists so the
 * T-18 tests collect and fail on their own assertions rather than on an import.
 */

import { systemClock, type Clock } from "../domain/quota.js";
import type { Allowance, OfflineReason, UssdReply } from "./types.js";

export interface UssdClock extends Clock {
  wait(milliseconds: number): Promise<void>;
}

export const systemUssdClock: UssdClock = {
  now: () => systemClock.now(),
  wait: (milliseconds) =>
    new Promise<void>((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};

export type UssdFailure =
  OfflineReason | "busy" | "not-logged-in" | "unreadable";

export type AllowanceResult =
  { ok: true; allowance: Allowance } | { ok: false; reason: UssdFailure };

export interface UssdMenuStep {
  label: RegExp | null;
  fallbackDigit: string;
}

export const MENU_SCRIPT: readonly UssdMenuStep[] = [];

export function chooseDigit(_reply: UssdReply, _step: UssdMenuStep): string {
  return "";
}

export interface UssdOptions {
  clock?: UssdClock;
  pollIntervalMs?: number;
  replyTimeoutMs?: number;
}

export interface UssdTransport {
  get(path: string): Promise<string>;
  post(path: string, body: string): Promise<string>;
  transportReason(error: unknown): OfflineReason;
}

export class UssdDialogue {
  constructor(_transport: UssdTransport) {
    // Not implemented yet.
  }

  readAllowance(_options: UssdOptions = {}): Promise<AllowanceResult> {
    return Promise.resolve({ ok: false, reason: "error" });
  }
}
