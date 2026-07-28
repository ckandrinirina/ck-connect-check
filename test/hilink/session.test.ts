import { describe, expect, it } from "vitest";

import { SessionStore, sessionHeaders } from "../../src/hilink/session.js";
import type { SessionCredentials } from "../../src/hilink/types.js";

const HANDSHAKE: SessionCredentials = {
  sessionId: "SessionID=handshake-session",
  token: "HandshakeToken0001",
};

const LOGGED_IN: SessionCredentials = {
  sessionId: "SessionID=logged-in-session",
  token: "RollingToken0001",
};

/** A store whose handshake counts its calls, so a refetch is observable. */
function store(): { session: SessionStore; handshakes: () => number } {
  let calls = 0;
  const session = new SessionStore(async () => {
    calls += 1;
    return HANDSHAKE;
  });
  return { session, handshakes: () => calls };
}

describe("SessionStore token advancement", () => {
  it("replaces the anonymous token and leaves the session cookie alone", async () => {
    const { session } = store();
    await session.handshake();

    session.advanceToken("FreshToken0002");

    expect(await session.current()).toEqual({
      sessionId: HANDSHAKE.sessionId,
      token: "FreshToken0002",
    });
  });

  it("advances the authenticated token once a login has happened", async () => {
    const { session } = store();
    await session.handshake();
    session.authenticate(LOGGED_IN);

    session.advanceToken("FreshToken0002");

    expect(await session.current()).toEqual({
      sessionId: LOGGED_IN.sessionId,
      token: "FreshToken0002",
    });
  });

  it("carries the advanced token into the request headers", async () => {
    const { session } = store();
    session.authenticate(LOGGED_IN);
    session.advanceToken("FreshToken0002");

    expect(sessionHeaders(await session.current())).toEqual({
      Cookie: LOGGED_IN.sessionId,
      __RequestVerificationToken: "FreshToken0002",
    });
  });

  it("does not invent a session when nothing is held yet", async () => {
    const { session, handshakes } = store();

    session.advanceToken("FreshToken0002");

    expect(handshakes()).toBe(0);
    expect(await session.current()).toEqual(HANDSHAKE);
  });

  it("ignores an empty token rather than blanking the one it holds", async () => {
    const { session } = store();
    await session.handshake();

    session.advanceToken("");
    session.advanceToken("   ");

    expect((await session.current()).token).toBe(HANDSHAKE.token);
  });

  it("keeps the anonymous token available for scrambling a login", async () => {
    const { session } = store();
    await session.handshake();
    session.authenticate(LOGGED_IN);

    session.advanceToken("FreshToken0002");

    expect(await session.handshake()).toEqual(HANDSHAKE);
  });
});
