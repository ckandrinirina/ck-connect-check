import { readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { RouterClient } from "../../src/hilink/client.js";
import { HilinkParseError } from "../../src/hilink/parse.js";
import { readLoginReply, scramblePassword } from "../../src/hilink/login.js";

const SES_TOK_INFO = "/api/webserver/SesTokInfo";
const LOGIN = "/api/user/login";
const LOGOUT = "/api/user/logout";
const STATUS = "/api/monitoring/status";

const FIXTURE_BY_PATH: Record<string, string> = {
  [SES_TOK_INFO]: "ses-tok-info",
  "/api/monitoring/month_statistics": "month_statistics",
  "/api/monitoring/traffic-statistics": "traffic-statistics",
  "/api/monitoring/status": "status",
  "/api/net/current-plmn": "current-plmn",
  "/api/monitoring/start_date": "start_date",
};

/** What the `ses-tok-info` fixture hands out — the anonymous handshake pair. */
const HANDSHAKE_SESSION_ID =
  "SessionID=uQp2RKLAwsGdKzXhVn7YtBcM4pQe9WfJ3rLmNbXsTvHu6DyKaZgP8CiEoRqF";
const HANDSHAKE_TOKEN = "CY8/MvG3W0kNqZpLdRyTbAe1";

/** What a successful login hands back instead. Invented — no device ever issued these. */
const LOGIN_SESSION_ID =
  "SessionID=Ff3wKq9ZmT2xNb6vJcHy8LdRsPu4EaGiWoQn1TzXvMkB5CrYhJdA7SgUeFtN";
const ROLLING_TOKEN_ONE = "aB3dEf5GhIjKlM7nOpQrSt9U";
const ROLLING_TOKEN_TWO = "zY7xWv4UtSr2QpOn6MlKjI8H";

/** Invented credential. Nothing here is, or resembles, a real router password. */
const CREDENTIAL = { username: "admin", password: "Str0ng-Test-Pass" };

const OK_REPLY =
  '<?xml version="1.0" encoding="UTF-8"?>\n<response>OK</response>';

function errorReply(code: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<error>\n<code>${code}</code>\n<message></message>\n</error>`;
}

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/hilink/${name}.xml`, import.meta.url)),
    "utf8",
  );
}

interface RecordedRequest {
  method: string;
  path: string;
  body: string;
  cookie: string | undefined;
  token: string | undefined;
}

/** What the stub should do for one request: answer, or never answer at all. */
type Reply =
  { body: string; headers?: Record<string, string> } | { hang: true };

/** `hit` is 1 on the first request for that path, 2 on the second, and so on. */
type Responder = (path: string, hit: number) => Reply | undefined;

interface StubRouter {
  baseUrl: string;
  requests: RecordedRequest[];
  hits(path: string): number;
  lastBody(path: string): string;
  close(): Promise<void>;
}

const openStubs: StubRouter[] = [];

function headerValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/** The headers a real device sets on a successful `/api/user/login` reply. */
const LOGIN_OK: Reply = {
  body: OK_REPLY,
  headers: {
    "Set-Cookie": `${LOGIN_SESSION_ID}; Path=/; HttpOnly`,
    __RequestVerificationTokenone: ROLLING_TOKEN_ONE,
    __RequestVerificationTokentwo: ROLLING_TOKEN_TWO,
  },
};

/**
 * A throwaway HTTP server standing in for the router. It reads request bodies so
 * the login POST can be inspected. Nothing here ever contacts a real device.
 */
async function startStubRouter(responder?: Responder): Promise<StubRouter> {
  const requests: RecordedRequest[] = [];
  const sockets = new Set<Socket>();
  const hitCounts = new Map<string, number>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const hit = (hitCounts.get(path) ?? 0) + 1;
      hitCounts.set(path, hit);
      requests.push({
        method: req.method ?? "",
        path,
        body: Buffer.concat(chunks).toString("utf8"),
        cookie: headerValue(req.headers.cookie),
        token: headerValue(req.headers["__requestverificationtoken"]),
      });

      const custom = responder?.(path, hit);
      if (custom !== undefined && "hang" in custom) {
        return;
      }
      if (custom !== undefined) {
        res.writeHead(200, { "content-type": "text/xml", ...custom.headers });
        res.end(custom.body);
        return;
      }
      const name = FIXTURE_BY_PATH[path];
      if (name === undefined) {
        res.writeHead(404).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/xml" });
      res.end(fixture(name));
    });
  });

  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  const stub: StubRouter = {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    hits: (path) => requests.filter((request) => request.path === path).length,
    lastBody: (path) =>
      requests.filter((request) => request.path === path).at(-1)?.body ?? "",
    close: async () => {
      for (const socket of sockets) {
        socket.destroy();
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    },
  };
  openStubs.push(stub);
  return stub;
}

afterEach(async () => {
  await Promise.all(openStubs.splice(0).map((stub) => stub.close()));
});

/** A base URL with nothing listening on it — the unreachable-host case. */
async function deadBaseUrl(): Promise<string> {
  const stub = await startStubRouter();
  const { baseUrl } = stub;
  await stub.close();
  openStubs.splice(openStubs.indexOf(stub), 1);
  return baseUrl;
}

/** Answers the login POST with `reply`, everything else from the fixtures. */
function loginResponder(reply: Reply): Responder {
  return (path) => (path === LOGIN ? reply : undefined);
}

describe("scramblePassword", () => {
  // Hand-computed for username `admin`, password `Str0ng-Test-Pass` and the
  // handshake token `HandshakeTokenABC123`:
  //   sha256hex("Str0ng-Test-Pass")
  //     = 0e93465efe9f0a98781dd55d1afcc67d40dd6f70064f77b73e5b7e397175255d
  //   hashedPassword = base64(that hex)
  //   Password       = base64(sha256hex("admin" + hashedPassword + token))
  const HAND_TOKEN = "HandshakeTokenABC123";
  const HAND_HASHED_PASSWORD =
    "MGU5MzQ2NWVmZTlmMGE5ODc4MWRkNTVkMWFmY2M2N2Q0MGRkNmY3MDA2NGY3N2I3M2U1YjdlMzk3MTc1MjU1ZA==";
  const HAND_SCRAMBLED =
    "MWI1NmJhZTY4MTJjYWVjODA4ZTZlNzc3NGM4NGE0NTAwYzk0MjZhZDdiNDYzYmYwNzQ0ZTIwNGExNTQ1MDg5ZA==";

  it("matches the hand-computed base64(sha256hex(...)) vector", () => {
    expect(scramblePassword("admin", "Str0ng-Test-Pass", HAND_TOKEN)).toBe(
      HAND_SCRAMBLED,
    );
  });

  it("folds in the base64 of the hex password digest, not the raw digest", () => {
    // Feeding the already-hashed password through as the password must not
    // reproduce the vector — the inner base64 layer is load-bearing.
    expect(
      scramblePassword("admin", HAND_HASHED_PASSWORD, HAND_TOKEN),
    ).not.toBe(HAND_SCRAMBLED);
  });

  it("changes when the token changes, so the handshake token is really folded in", () => {
    expect(
      scramblePassword("admin", "Str0ng-Test-Pass", "other-token"),
    ).not.toBe(HAND_SCRAMBLED);
  });

  it("changes when the username changes", () => {
    expect(scramblePassword("user", "Str0ng-Test-Pass", HAND_TOKEN)).not.toBe(
      HAND_SCRAMBLED,
    );
  });
});

describe("readLoginReply", () => {
  it("takes the session from Set-Cookie and the token from __RequestVerificationTokenone", () => {
    const credentials = readLoginReply(OK_REPLY, {
      setCookie: `${LOGIN_SESSION_ID}; Path=/; HttpOnly`,
      rollingToken: ROLLING_TOKEN_ONE,
    });

    expect(credentials).toEqual({
      sessionId: LOGIN_SESSION_ID,
      token: ROLLING_TOKEN_ONE,
    });
  });

  it("rejects a reply with no Set-Cookie", () => {
    expect(() =>
      readLoginReply(OK_REPLY, {
        setCookie: undefined,
        rollingToken: ROLLING_TOKEN_ONE,
      }),
    ).toThrow(HilinkParseError);
  });

  it("rejects a reply with no rolling token", () => {
    expect(() =>
      readLoginReply(OK_REPLY, {
        setCookie: LOGIN_SESSION_ID,
        rollingToken: undefined,
      }),
    ).toThrow(HilinkParseError);
  });
});

describe("RouterClient login request", () => {
  it("posts to /api/user/login", async () => {
    const stub = await startStubRouter(loginResponder(LOGIN_OK));

    await new RouterClient({ baseUrl: stub.baseUrl }).login(CREDENTIAL);

    expect(stub.hits(LOGIN)).toBe(1);
    expect(
      stub.requests.find((request) => request.path === LOGIN)?.method,
    ).toBe("POST");
  });

  it("sends password_type 4 and the scrambled password, never the plaintext", async () => {
    const stub = await startStubRouter(loginResponder(LOGIN_OK));

    await new RouterClient({ baseUrl: stub.baseUrl }).login(CREDENTIAL);

    const body = stub.lastBody(LOGIN);
    const scrambled = scramblePassword(
      CREDENTIAL.username,
      CREDENTIAL.password,
      HANDSHAKE_TOKEN,
    );
    expect(body).toContain("<password_type>4</password_type>");
    expect(body).toContain(`<Password>${scrambled}</Password>`);
    expect(body).toContain(`<Username>${CREDENTIAL.username}</Username>`);
    expect(body).not.toContain(CREDENTIAL.password);
  });

  it("scrambles with the handshake TokInfo and sends it as the request token", async () => {
    const stub = await startStubRouter(loginResponder(LOGIN_OK));

    await new RouterClient({ baseUrl: stub.baseUrl }).login(CREDENTIAL);

    const request = stub.requests.find((entry) => entry.path === LOGIN);
    expect(request?.cookie).toBe(HANDSHAKE_SESSION_ID);
    expect(request?.token).toBe(HANDSHAKE_TOKEN);
  });
});

describe("RouterClient successful login", () => {
  it("reports success", async () => {
    const stub = await startStubRouter(loginResponder(LOGIN_OK));

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).login(
      CREDENTIAL,
    );

    expect(result).toEqual({ ok: true });
  });

  it("carries the rolling token afterwards, not the handshake TokInfo", async () => {
    const stub = await startStubRouter(loginResponder(LOGIN_OK));
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.login(CREDENTIAL);
    await client.snapshot();

    const dataRequests = stub.requests.filter(
      (request) => request.path !== SES_TOK_INFO && request.path !== LOGIN,
    );
    expect(dataRequests.length).toBeGreaterThan(0);
    for (const request of dataRequests) {
      expect(request.token).toBe(ROLLING_TOKEN_ONE);
      expect(request.token).not.toBe(HANDSHAKE_TOKEN);
      expect(request.cookie).toBe(LOGIN_SESSION_ID);
    }
  });

  it("keeps the authenticated session across polls without handshaking again", async () => {
    const stub = await startStubRouter(loginResponder(LOGIN_OK));
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.login(CREDENTIAL);
    await client.snapshot();
    await client.snapshot();

    expect(stub.hits(SES_TOK_INFO)).toBe(1);
    expect(stub.hits(STATUS)).toBe(2);
  });
});

describe("RouterClient rejected login", () => {
  it("resolves 108006 to a wrong-credential failure rather than throwing", async () => {
    const stub = await startStubRouter(
      loginResponder({ body: errorReply(108006) }),
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).login(
      CREDENTIAL,
    );

    expect(result).toEqual({ ok: false, reason: "wrong-credential" });
  });

  it("resolves 108007 to a locked-account failure, distinct from a wrong credential", async () => {
    const stub = await startStubRouter(
      loginResponder({ body: errorReply(108007) }),
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).login(
      CREDENTIAL,
    );

    expect(result).toEqual({ ok: false, reason: "account-locked" });
    expect(result).not.toEqual({ ok: false, reason: "wrong-credential" });
  });

  it("posts to /api/user/login exactly once when the credential is rejected", async () => {
    const stub = await startStubRouter(
      loginResponder({ body: errorReply(108006) }),
    );

    await new RouterClient({ baseUrl: stub.baseUrl }).login(CREDENTIAL);

    expect(stub.hits(LOGIN)).toBe(1);
  });

  it("does not retry a rejected login even across a stale-session reply", async () => {
    const stub = await startStubRouter(
      loginResponder({ body: errorReply(125002) }),
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).login(
      CREDENTIAL,
    );

    expect(result).toEqual({ ok: false, reason: "session" });
    expect(stub.hits(LOGIN)).toBe(1);
  });

  it("leaves later requests on the anonymous session after a rejected login", async () => {
    const stub = await startStubRouter(
      loginResponder({ body: errorReply(108006) }),
    );
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.login(CREDENTIAL);
    await client.snapshot();

    const request = stub.requests.find((entry) => entry.path === STATUS);
    expect(request?.token).toBe(HANDSHAKE_TOKEN);
    expect(request?.cookie).toBe(HANDSHAKE_SESSION_ID);
  });
});

describe("RouterClient login offline results", () => {
  it("reports an unreachable host rather than a login failure", async () => {
    const baseUrl = await deadBaseUrl();

    const result = await new RouterClient({ baseUrl }).login(CREDENTIAL);

    expect(result).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reports a timeout when the login POST never answers", async () => {
    const stub = await startStubRouter(loginResponder({ hang: true }));

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
      timeoutMs: 60,
    }).login(CREDENTIAL);

    expect(result).toEqual({ ok: false, reason: "timeout" });
  });

  it("reports a timeout when the handshake before the login never answers", async () => {
    const stub = await startStubRouter((path) =>
      path === SES_TOK_INFO ? { hang: true } : undefined,
    );

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
      timeoutMs: 60,
    }).login(CREDENTIAL);

    expect(result).toEqual({ ok: false, reason: "timeout" });
    expect(stub.hits(LOGIN)).toBe(0);
  });

  it("reports a malformed login reply as an error, not a wrong credential", async () => {
    const stub = await startStubRouter(
      loginResponder({ body: fixture("malformed") }),
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).login(
      CREDENTIAL,
    );

    expect(result).toEqual({ ok: false, reason: "error" });
  });
});

describe("RouterClient anonymous path", () => {
  it("takes a snapshot with no credential configured and never posts a login", async () => {
    const stub = await startStubRouter();

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    expect(result.online).toBe(true);
    expect(stub.hits(LOGIN)).toBe(0);
    expect(stub.requests.every((request) => request.method === "GET")).toBe(
      true,
    );
  });

  it("still carries the handshake session on every data request", async () => {
    const stub = await startStubRouter();

    await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    for (const request of stub.requests.filter(
      (entry) => entry.path !== SES_TOK_INFO,
    )) {
      expect(request.cookie).toBe(HANDSHAKE_SESSION_ID);
      expect(request.token).toBe(HANDSHAKE_TOKEN);
    }
  });
});

describe("RouterClient logout", () => {
  it("posts to /api/user/logout", async () => {
    const stub = await startStubRouter((path) => {
      if (path === LOGIN) {
        return LOGIN_OK;
      }
      return path === LOGOUT ? { body: OK_REPLY } : undefined;
    });
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.login(CREDENTIAL);
    await client.logout();

    const request = stub.requests.find((entry) => entry.path === LOGOUT);
    expect(request?.method).toBe("POST");
    expect(request?.cookie).toBe(LOGIN_SESSION_ID);
    expect(request?.token).toBe(ROLLING_TOKEN_ONE);
  });

  it("clears the authenticated session so later requests go back to the handshake one", async () => {
    const stub = await startStubRouter((path) => {
      if (path === LOGIN) {
        return LOGIN_OK;
      }
      return path === LOGOUT ? { body: OK_REPLY } : undefined;
    });
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.login(CREDENTIAL);
    await client.logout();
    await client.snapshot();

    const request = stub.requests.find((entry) => entry.path === STATUS);
    expect(request?.token).toBe(HANDSHAKE_TOKEN);
    expect(request?.cookie).toBe(HANDSHAKE_SESSION_ID);
  });

  it("clears the authenticated session even when the router refuses the logout", async () => {
    const stub = await startStubRouter((path) => {
      if (path === LOGIN) {
        return LOGIN_OK;
      }
      return path === LOGOUT ? { body: errorReply(100003) } : undefined;
    });
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.login(CREDENTIAL);
    await client.logout();
    await client.snapshot();

    const request = stub.requests.find((entry) => entry.path === STATUS);
    expect(request?.token).toBe(HANDSHAKE_TOKEN);
  });

  it("posts nothing when no login ever happened", async () => {
    const stub = await startStubRouter();

    await new RouterClient({ baseUrl: stub.baseUrl }).logout();

    expect(stub.hits(LOGOUT)).toBe(0);
  });
});
