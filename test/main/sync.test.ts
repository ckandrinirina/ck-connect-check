/**
 * The Sync button's engine: sign in, run the `#359#` dialogue, hand back the
 * carrier's figure — or hand back a reason.
 *
 * Nothing here touches the router or the Keychain: the transport is a stub with
 * a scripted answer per call, and the credential store is an object. What is
 * asserted is the sequence a press produces, and that a second press while one
 * is in flight produces nothing.
 */

import { describe, expect, it, vi } from "vitest";

import type { AllowanceResult } from "../../src/hilink/client.js";
import type {
  Allowance,
  LoginResult,
  RouterCredential,
} from "../../src/hilink/types.js";
import type { CredentialSaveResult } from "../../src/main/credentials.js";
import {
  createAllowanceSync,
  type AllowanceSource,
  type CredentialStore,
  type SyncState,
} from "../../src/main/sync.js";

const CREDENTIAL: RouterCredential = { username: "admin", password: "hunter2" };

const ALLOWANCE: Allowance = {
  planLabel: "NET MONTH 200 000",
  remainingBytes: 145_835_900_000,
  expiresAt: new Date(2026, 7, 12),
};

const SUCCESS: AllowanceResult = { ok: true, allowance: ALLOWANCE };

/** A router whose two answers are scripted, and which counts what it was asked. */
function fakeRouter(
  login: LoginResult,
  allowance: AllowanceResult,
): AllowanceSource & {
  logins: number;
  dialogues: number;
  logouts: number;
  /** Resolves the pending dialogue, for the in-flight tests. */
  settle?: () => void;
} {
  const router = {
    logins: 0,
    dialogues: 0,
    logouts: 0,
    login: (): Promise<LoginResult> => {
      router.logins += 1;

      return Promise.resolve(login);
    },
    readAllowance: (): Promise<AllowanceResult> => {
      router.dialogues += 1;

      return Promise.resolve(allowance);
    },
    logout: (): Promise<void> => {
      router.logouts += 1;

      return Promise.resolve();
    },
  };

  return router;
}

/** A credential store backed by a variable rather than by the Keychain. */
function fakeStore(
  initial: RouterCredential | null,
  save: CredentialSaveResult = { ok: true },
): CredentialStore & { saved: RouterCredential | null } {
  let held = initial;

  return {
    get saved() {
      return held;
    },
    load: () => held,
    save: (credential) => {
      if (save.ok) {
        held = credential;
      }

      return save;
    },
  };
}

interface Harness {
  sync: ReturnType<typeof createAllowanceSync>;
  states: SyncState[];
  anchored: Allowance[];
}

function harness(
  router: AllowanceSource,
  credentials: CredentialStore,
): Harness {
  const states: SyncState[] = [];
  const anchored: Allowance[] = [];

  return {
    states,
    anchored,
    sync: createAllowanceSync({
      router,
      credentials,
      onAllowance: (allowance) => anchored.push(allowance),
      onStateChange: (state) => states.push(state),
    }),
  };
}

/** The step names reported while a state was `running`, in order. */
function stepsOf(states: readonly SyncState[]): string[] {
  return states
    .filter((state) => state.phase === "running")
    .map((state) => (state.phase === "running" ? state.step : ""));
}

describe("createAllowanceSync — a successful press", () => {
  it("signs in, dials the carrier, and hands back the allowance", async () => {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const { sync, anchored } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();

    expect(router.logins).toBe(1);
    expect(router.dialogues).toBe(1);
    expect(anchored).toEqual([ALLOWANCE]);
    expect(sync.state()).toEqual({ phase: "idle" });
  });

  it("reports each step of the dialogue rather than one opaque wait", async () => {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const { sync, states } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();

    expect(stepsOf(states)).toEqual(["signing-in", "asking-carrier"]);
  });

  it("signs out again, so the router is not left holding a session", async () => {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();

    expect(router.logouts).toBe(1);
  });

  it("signs out even when the dialogue fails", async () => {
    const router = fakeRouter({ ok: true }, { ok: false, reason: "timeout" });
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();

    expect(router.logouts).toBe(1);
  });
});

describe("createAllowanceSync — one dialogue at a time", () => {
  it("ignores a second press while the first is still running", async () => {
    let release = (): void => undefined;
    const pending = new Promise<AllowanceResult>((resolve) => {
      release = () => resolve(SUCCESS);
    });
    let dialogues = 0;
    const router: AllowanceSource = {
      login: () => Promise.resolve({ ok: true }),
      readAllowance: () => {
        dialogues += 1;

        return pending;
      },
      logout: () => Promise.resolve(),
    };
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    const first = sync.start();
    await Promise.resolve();
    await Promise.resolve();

    const second = sync.start();
    release();
    await Promise.all([first, second]);

    expect(dialogues).toBe(1);
  });

  it("accepts a fresh press once the first one has settled", async () => {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();
    await sync.start();

    expect(router.dialogues).toBe(2);
  });
});

describe("createAllowanceSync — no password stored", () => {
  it("asks for one instead of starting a dialogue", async () => {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const { sync } = harness(router, fakeStore(null));

    await sync.start();

    expect(sync.state()).toEqual({ phase: "needs-password" });
    expect(router.logins).toBe(0);
    expect(router.dialogues).toBe(0);
  });
});

describe("createAllowanceSync — submitting the password prompt", () => {
  it("saves the credential and then dials", async () => {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const store = fakeStore(null);
    const { sync } = harness(router, store);

    await sync.submitPassword(CREDENTIAL);

    expect(store.saved).toEqual(CREDENTIAL);
    expect(router.dialogues).toBe(1);
    expect(sync.state()).toEqual({ phase: "idle" });
  });

  it("dials with the credential that was just entered", async () => {
    const login = vi.fn(() => Promise.resolve<LoginResult>({ ok: true }));
    const router: AllowanceSource = {
      login,
      readAllowance: () => Promise.resolve(SUCCESS),
      logout: () => Promise.resolve(),
    };
    const { sync } = harness(router, fakeStore(null));

    await sync.submitPassword(CREDENTIAL);

    expect(login).toHaveBeenCalledWith(CREDENTIAL);
  });

  it("reports a keychain that refused the save, and dials nothing", async () => {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const { sync } = harness(
      router,
      fakeStore(null, { ok: false, reason: "encryption-unavailable" }),
    );

    await sync.submitPassword(CREDENTIAL);

    expect(sync.state()).toEqual({
      phase: "failed",
      reason: "keychain-unavailable",
    });
    expect(router.dialogues).toBe(0);
  });

  it("reports a blank entry as no password at all", async () => {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const { sync } = harness(
      router,
      fakeStore(null, { ok: false, reason: "incomplete" }),
    );

    await sync.submitPassword({ username: "admin", password: "" });

    expect(sync.state()).toEqual({ phase: "failed", reason: "no-password" });
    expect(router.dialogues).toBe(0);
  });
});

describe("createAllowanceSync — the router refuses the login", () => {
  it("reports a wrong password without dialling", async () => {
    const router = fakeRouter(
      { ok: false, reason: "wrong-credential" },
      SUCCESS,
    );
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();

    expect(sync.state()).toEqual({
      phase: "failed",
      reason: "wrong-credential",
    });
    expect(router.dialogues).toBe(0);
  });

  it("reports a locked account distinctly from a wrong password", async () => {
    const router = fakeRouter({ ok: false, reason: "account-locked" }, SUCCESS);
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();

    expect(sync.state()).toEqual({
      phase: "failed",
      reason: "account-locked",
    });
  });

  it("reports a router that never answered the login", async () => {
    const router = fakeRouter({ ok: false, reason: "unreachable" }, SUCCESS);
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();

    expect(sync.state()).toEqual({ phase: "failed", reason: "unreachable" });
  });
});

describe("createAllowanceSync — the dialogue itself fails", () => {
  const reasons = ["busy", "timeout", "unreachable", "unreadable"] as const;

  for (const reason of reasons) {
    it(`carries the "${reason}" reason through to the state`, async () => {
      const router = fakeRouter({ ok: true }, { ok: false, reason });
      const { sync } = harness(router, fakeStore(CREDENTIAL));

      await sync.start();

      expect(sync.state()).toEqual({ phase: "failed", reason });
    });
  }

  it("anchors nothing when the carrier said nothing usable", async () => {
    const router = fakeRouter(
      { ok: true },
      { ok: false, reason: "unreadable" },
    );
    const { sync, anchored } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();

    expect(anchored).toEqual([]);
  });
});
