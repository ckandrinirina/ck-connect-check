/**
 * What one press of Sync actually does: sign in, run the `#359#` dialogue, hand
 * the carrier's figure back, sign out again.
 *
 * It exists as its own module because the sequence has more states than the
 * wiring in `main.ts` should carry: a press can end in a figure, in one of nine
 * reasons, or in a request for a password that was never stored. Every one of
 * those is a thing the panel has to say, so every one of them is a state here
 * rather than a thrown error.
 *
 * Three rules are enforced in exactly one place each:
 *
 * - a dialogue already running refuses a second press ({@link AllowanceSync.start}'s
 *   guard), because the modem has a single USSD channel;
 * - the sign-out runs from a `finally`, so a failed dialogue still releases the
 *   router's session;
 * - a failed dialogue parks {@link AllowanceSync.startAutomatic} until a press
 *   succeeds, because the router locks the account after five refused sign-ins
 *   and a window that keeps coming round would walk it there.
 *
 * Nothing here touches Electron, the Keychain or the network directly: the
 * router and the credential store are both injected, which is what lets the
 * whole sequence be tested without either.
 */

import type { AllowanceResult, UssdFailure } from "../hilink/client.js";
import type {
  Allowance,
  LoginResult,
  RouterCredential,
} from "../hilink/types.js";
import type { CredentialSaveResult } from "./credentials.js";

/**
 * Why a press produced no figure. {@link UssdFailure} covers the dialogue and
 * the transport; the three added here are the router refusing the credential
 * and the two ways there can be no usable credential at all.
 */
export type SyncFailure =
  | UssdFailure
  | "wrong-credential"
  | "account-locked"
  | "no-password"
  | "keychain-unavailable";

/**
 * Where a running sync has got to. Two steps rather than one opaque wait: the
 * sign-in is quick and the carrier dialogue is tens of seconds, so telling them
 * apart is the difference between a panel that is working and one that is stuck.
 */
export type SyncStep = "signing-in" | "asking-carrier";

export type SyncState =
  | { phase: "idle" }
  /**
   * `automatic` is set only when nobody pressed anything, and is absent rather
   * than false otherwise — a press is the ordinary case and does not need
   * announcing.
   */
  | { phase: "running"; step: SyncStep; automatic?: boolean }
  /** No password has ever been stored — the panel asks for one. */
  | { phase: "needs-password" }
  | { phase: "failed"; reason: SyncFailure; automatic?: boolean };

/** The slice of {@link RouterClient} a sync needs. A stub satisfies it in tests. */
export interface AllowanceSource {
  login(credential: RouterCredential): Promise<LoginResult>;
  logout(): Promise<void>;
  readAllowance(): Promise<AllowanceResult>;
}

/**
 * The slice of `./credentials.js` a sync needs, already bound to a config path.
 * Injected so no test needs a Keychain — and so this module never has to know
 * that one exists.
 */
export interface CredentialStore {
  load(): RouterCredential | null;
  save(credential: RouterCredential): CredentialSaveResult;
}

export interface AllowanceSyncOptions {
  router: AllowanceSource;
  credentials: CredentialStore;
  /** The carrier's figure, for the caller to anchor against the router's counter. */
  onAllowance(allowance: Allowance): void;
  /** Every state change, so the panel can be re-pushed as the dialogue moves. */
  onStateChange?(state: SyncState): void;
}

export interface AllowanceSync {
  state(): SyncState;
  /** One press of Sync. A press while one is in flight resolves having done nothing. */
  start(): Promise<void>;
  /**
   * A dialogue nobody pressed for — the caller has decided the anchor has gone
   * stale. Resolves to whether one was actually started.
   *
   * Three things stop it, and every one of them is silent: a dialogue already
   * in flight, no stored credential, and a previous failure that parked
   * automatic syncing until an explicit press succeeds. Silence is the point —
   * the alternative is a prompt or a retry that arrives on its own, and the
   * router locks the account after five refused sign-ins.
   */
  startAutomatic(): Promise<boolean>;
  /** The password prompt's submit: store the credential, then press Sync. */
  submitPassword(credential: RouterCredential): Promise<void>;
}

/** Why a credential could not be stored, in this module's vocabulary. */
function saveFailure(result: CredentialSaveResult): SyncFailure {
  if (result.ok || result.reason === "incomplete") {
    return "no-password";
  }

  return "keychain-unavailable";
}

export function createAllowanceSync(
  options: AllowanceSyncOptions,
): AllowanceSync {
  const { router, credentials, onAllowance } = options;
  let current: SyncState = { phase: "idle" };

  /**
   * Whether automatic syncing has been stood down after a failure. Set by any
   * dialogue that failed, however it was started, and cleared by any that
   * worked. A press is never blocked by it — the user asking again is exactly
   * the signal that the problem may be fixed, and the only thing that can tell
   * a wrong password from a busy modem.
   */
  let parked = false;

  function set(next: SyncState): void {
    current = next;
    options.onStateChange?.(next);
  }

  /** The dialogue itself, once a session is held. Always signs out again. */
  async function dial(automatic: boolean): Promise<void> {
    set({ phase: "running", step: "asking-carrier", ...marker(automatic) });

    try {
      const result = await router.readAllowance();

      if (!result.ok) {
        set({ phase: "failed", reason: result.reason, ...marker(automatic) });

        return;
      }

      onAllowance(result.allowance);
      set({ phase: "idle" });
    } finally {
      // A router left holding a session refuses the next login, so this runs
      // whatever the dialogue did.
      await router.logout();
    }
  }

  /** The state's automatic flag, present only when it is true. */
  function marker(automatic: boolean): { automatic?: boolean } {
    return automatic ? { automatic: true } : {};
  }

  /**
   * Sign in and dial, from whichever entry point asked, and leave
   * {@link parked} reflecting how it went.
   */
  async function run(
    credential: RouterCredential,
    automatic: boolean,
  ): Promise<void> {
    set({ phase: "running", step: "signing-in", ...marker(automatic) });

    const login = await router.login(credential);

    if (login.ok) {
      await dial(automatic);
    } else {
      // Nothing is retried: the router locks the account after five refusals.
      set({ phase: "failed", reason: login.reason, ...marker(automatic) });
    }

    parked = current.phase === "failed";
  }

  async function start(): Promise<void> {
    // The guard and the flag it reads are both synchronous, so two presses in
    // the same tick cannot both get past here.
    if (current.phase === "running") {
      return;
    }

    const credential = credentials.load();

    if (credential === null) {
      set({ phase: "needs-password" });

      return;
    }

    await run(credential, false);
  }

  async function startAutomatic(): Promise<boolean> {
    if (parked || current.phase === "running") {
      return false;
    }

    const credential = credentials.load();

    // No prompt, no state change: a password box that opens on its own, with
    // nobody having asked for anything, is worse than a figure going stale.
    if (credential === null) {
      return false;
    }

    await run(credential, true);

    return true;
  }

  return {
    state: () => current,
    start,
    startAutomatic,
    async submitPassword(credential: RouterCredential): Promise<void> {
      const saved = credentials.save(credential);

      if (!saved.ok) {
        set({ phase: "failed", reason: saveFailure(saved) });

        return;
      }

      await start();
    },
  };
}
