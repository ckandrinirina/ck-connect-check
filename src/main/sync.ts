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
 * Two rules are enforced in exactly one place each:
 *
 * - a dialogue already running refuses a second press ({@link AllowanceSync.start}'s
 *   guard), because the modem has a single USSD channel;
 * - the sign-out runs from a `finally`, so a failed dialogue still releases the
 *   router's session.
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
  | { phase: "running"; step: SyncStep }
  /** No password has ever been stored — the panel asks for one. */
  | { phase: "needs-password" }
  | { phase: "failed"; reason: SyncFailure };

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

  function set(next: SyncState): void {
    current = next;
    options.onStateChange?.(next);
  }

  /** The dialogue itself, once a session is held. Always signs out again. */
  async function dial(): Promise<void> {
    set({ phase: "running", step: "asking-carrier" });

    try {
      const result = await router.readAllowance();

      if (!result.ok) {
        set({ phase: "failed", reason: result.reason });

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

    set({ phase: "running", step: "signing-in" });

    const login = await router.login(credential);

    if (!login.ok) {
      // Nothing is retried: the router locks the account after five refusals.
      set({ phase: "failed", reason: login.reason });

      return;
    }

    await dial();
  }

  return {
    state: () => current,
    start,
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
