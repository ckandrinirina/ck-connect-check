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

import { defaultConfig, type AppConfig } from "../../src/config/defaults.js";
import type { AllowanceAnchor } from "../../src/domain/allowance.js";
import type { Clock } from "../../src/domain/quota.js";
import type { AllowanceResult } from "../../src/hilink/client.js";
import type {
  Allowance,
  LoginResult,
  MonthStatistics,
  RouterCredential,
} from "../../src/hilink/types.js";
import type { CredentialSaveResult } from "../../src/main/credentials.js";
import {
  createAllowanceSync,
  recordAnchor,
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

/** A router whose dialogue answers are scripted in order, then repeat the last. */
function scriptedRouter(
  answers: readonly AllowanceResult[],
): AllowanceSource & { dialogues: number } {
  const router = {
    dialogues: 0,
    login: (): Promise<LoginResult> => Promise.resolve({ ok: true }),
    readAllowance: (): Promise<AllowanceResult> => {
      const answer = answers[Math.min(router.dialogues, answers.length - 1)];
      router.dialogues += 1;

      return Promise.resolve(answer as AllowanceResult);
    },
    logout: (): Promise<void> => Promise.resolve(),
  };

  return router;
}

describe("createAllowanceSync — a dialogue nobody asked for", () => {
  it("runs one and reports that it started", async () => {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const { sync, anchored } = harness(router, fakeStore(CREDENTIAL));

    expect(await sync.startAutomatic()).toBe(true);
    expect(router.dialogues).toBe(1);
    expect(anchored).toEqual([ALLOWANCE]);
  });

  it("marks its steps automatic, where a press leaves them unmarked", async () => {
    const automatic = harness(
      fakeRouter({ ok: true }, SUCCESS),
      fakeStore(CREDENTIAL),
    );
    const pressed = harness(
      fakeRouter({ ok: true }, SUCCESS),
      fakeStore(CREDENTIAL),
    );

    await automatic.sync.startAutomatic();
    await pressed.sync.start();

    const running = (states: readonly SyncState[]): (boolean | undefined)[] =>
      states
        .filter((state) => state.phase === "running")
        .map((state) => (state.phase === "running" ? state.automatic : false));

    expect(running(automatic.states)).toEqual([true, true]);
    expect(running(pressed.states)).toEqual([undefined, undefined]);
  });

  it("dials nothing and asks nothing when no credential is stored", async () => {
    // A press asks for a password. A dialogue nobody asked for must not: the
    // prompt would appear on its own, over and over.
    const router = fakeRouter({ ok: true }, SUCCESS);
    const { sync, states } = harness(router, fakeStore(null));

    expect(await sync.startAutomatic()).toBe(false);
    expect(router.dialogues).toBe(0);
    expect(states).toEqual([]);
    expect(sync.state()).toEqual({ phase: "idle" });
  });

  it("refuses to join a dialogue already in flight", async () => {
    let release = (): void => undefined;
    const pending = new Promise<AllowanceResult>((resolve) => {
      release = () => {
        resolve(SUCCESS);
      };
    });
    const router = {
      dialogues: 0,
      login: (): Promise<LoginResult> => Promise.resolve({ ok: true }),
      readAllowance: (): Promise<AllowanceResult> => {
        router.dialogues += 1;

        return pending;
      },
      logout: (): Promise<void> => Promise.resolve(),
    };
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    const first = sync.startAutomatic();
    await vi.waitFor(() => {
      expect(router.dialogues).toBe(1);
    });

    expect(await sync.startAutomatic()).toBe(false);
    expect(router.dialogues).toBe(1);

    release();
    await first;
  });

  it("parks after a failure, so no second automatic dialogue follows", async () => {
    // The router locks the account after five refused sign-ins, so a window
    // that keeps coming round must not keep trying.
    const router = fakeRouter({ ok: true }, { ok: false, reason: "busy" });
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    expect(await sync.startAutomatic()).toBe(true);
    expect(await sync.startAutomatic()).toBe(false);
    expect(await sync.startAutomatic()).toBe(false);
    expect(router.dialogues).toBe(1);
  });

  it("parks after a failed press too, so a timer does not pick it up", async () => {
    const router = fakeRouter({ ok: true }, { ok: false, reason: "busy" });
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    await sync.start();

    expect(await sync.startAutomatic()).toBe(false);
    expect(router.dialogues).toBe(1);
  });

  it("still lets an explicit press through once parked", async () => {
    const router = scriptedRouter([
      { ok: false, reason: "busy" },
      { ok: false, reason: "busy" },
    ]);
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    await sync.startAutomatic();
    await sync.start();

    expect(router.dialogues).toBe(2);
  });

  it("re-arms automatic syncing once a press succeeds", async () => {
    const router = scriptedRouter([
      { ok: false, reason: "busy" },
      SUCCESS,
      SUCCESS,
    ]);
    const { sync } = harness(router, fakeStore(CREDENTIAL));

    await sync.startAutomatic();
    // Parked by that failure, released by the press that worked.
    await sync.start();

    expect(await sync.startAutomatic()).toBe(true);
    expect(router.dialogues).toBe(3);
  });
});

describe("recordAnchor — writing down the anchor a sync produced", () => {
  const CLEAR_TIME = "2026-7-27";

  /** 27 July 2026, 17:46 local. */
  const NOW = new Date(2026, 6, 27, 17, 46, 0);
  const clock: Clock = { now: () => NOW };

  const MONTH: MonthStatistics = {
    monthDownloadBytes: 1_000_000_000,
    monthUploadBytes: 0,
    monthDurationSeconds: 27_960,
    monthLastClearTime: CLEAR_TIME,
  };

  function anchor(overrides: Partial<AllowanceAnchor> = {}): AllowanceAnchor {
    return {
      planLabel: ALLOWANCE.planLabel,
      remainingBytes: ALLOWANCE.remainingBytes,
      expiresAt: ALLOWANCE.expiresAt,
      routerMonthBytes: 1_000_000_000,
      routerClearTime: CLEAR_TIME,
      syncedAt: new Date(2026, 6, 27, 10, 0, 0),
      ...overrides,
    };
  }

  function configWith(
    previous: AllowanceAnchor | undefined,
    planLimitBytes: number | null,
  ): AppConfig {
    return {
      ...defaultConfig(),
      planLimitBytes,
      planCapConfirmed: true,
      ...(previous === undefined ? {} : { allowanceAnchor: previous }),
    };
  }

  it("writes the carrier's figure as the new anchor", () => {
    const config = configWith(anchor(), 200_000_000_000);

    recordAnchor(config, ALLOWANCE, MONTH, clock);

    expect(config.allowanceAnchor?.remainingBytes).toBe(
      ALLOWANCE.remainingBytes,
    );
    expect(config.allowanceAnchor?.syncedAt).toEqual(NOW);
  });

  it("clears the cap flag when the anchor belongs to a new plan", () => {
    // A 50 Go cap against 145 Go left: the cap cannot describe this plan, and
    // `usedBytes` would clamp to zero and read 0% for as long as it stood.
    const config = configWith(anchor(), 50_000_000_000);

    recordAnchor(config, ALLOWANCE, MONTH, clock);

    expect(config.planCapConfirmed).toBe(false);
  });

  it("clears it for a relabelled plan too", () => {
    const config = configWith(
      anchor({ planLabel: "NET WEEK 20 000" }),
      200_000_000_000,
    );

    recordAnchor(config, ALLOWANCE, MONTH, clock);

    expect(config.planCapConfirmed).toBe(false);
  });

  it("leaves the flag untouched when the plan has not changed", () => {
    const config = configWith(anchor(), 200_000_000_000);

    recordAnchor(config, ALLOWANCE, MONTH, clock);

    expect(config.planCapConfirmed).toBe(true);
  });

  it("leaves it untouched on a first-ever sync, which replaces nothing", () => {
    const config = configWith(undefined, 50_000_000_000);

    recordAnchor(config, ALLOWANCE, MONTH, clock);

    expect(config.planCapConfirmed).toBe(true);
    expect(config.allowanceAnchor).toBeDefined();
  });
});

/**
 * The dialogue exists for YAS. On Orange the figure comes from an
 * unauthenticated page, so there is nothing to sign in to and nothing to ask
 * the Keychain for — and a credential store that is never touched is the
 * strongest form that statement takes.
 */
describe("createAllowanceSync — a carrier the dialogue is not for", () => {
  /** A store that fails the test if anything asks it for a password. */
  function forbiddenStore(): CredentialStore & { loads: number } {
    const store = {
      loads: 0,
      load: (): RouterCredential | null => {
        store.loads += 1;

        return CREDENTIAL;
      },
      save: (): CredentialSaveResult => ({ ok: true }),
    };

    return store;
  }

  function syncOn(carrier: "orange" | "unknown", credentials: CredentialStore) {
    const router = fakeRouter({ ok: true }, SUCCESS);
    const states: SyncState[] = [];
    const sync = createAllowanceSync({
      router,
      credentials,
      carrier: () => carrier,
      onAllowance: () => undefined,
      onStateChange: (state) => states.push(state),
    });

    return { router, states, sync };
  }

  it("never reaches for the Keychain on Orange, however it is asked", async () => {
    const credentials = forbiddenStore();
    const { router, states, sync } = syncOn("orange", credentials);

    await sync.start();
    const automatic = await sync.startAutomatic();

    expect(credentials.loads).toBe(0);
    expect(automatic).toBe(false);
    expect(router.logins).toBe(0);
    expect(router.dialogues).toBe(0);
    expect(states).toEqual([]);
    expect(sync.state()).toEqual({ phase: "idle" });
  });

  it("never dials a carrier it cannot place either", async () => {
    const credentials = forbiddenStore();
    const { router, sync } = syncOn("unknown", credentials);

    await sync.start();
    await sync.startAutomatic();

    expect(credentials.loads).toBe(0);
    expect(router.logins).toBe(0);
  });
});
