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
import type { MacFilter } from "../../src/hilink/macfilter.js";

const SES_TOK_INFO = "/api/webserver/SesTokInfo";
const TOKEN_ENDPOINT = "/api/webserver/token";
const LOGIN = "/api/user/login";
const USSD_STATUS = "/api/ussd/status";
const USSD_SEND = "/api/ussd/send";
const USSD_GET = "/api/ussd/get";
const USSD_RELEASE = "/api/ussd/release";

const FIXTURE_BY_PATH: Record<string, string> = {
  [SES_TOK_INFO]: "ses-tok-info",
};

/** What a successful login hands back. Invented — no device ever issued these. */
const LOGIN_SESSION_ID =
  "SessionID=Ff3wKq9ZmT2xNb6vJcHy8LdRsPu4EaGiWoQn1TzXvMkB5CrYhJdA7SgUeFtN";
const ROLLING_TOKEN_ONE = "aB3dEf5GhIjKlM7nOpQrSt9U";

/** The token a later reply rotates to, and the one `/api/webserver/token` hands out. */
const ROTATED_TOKEN = "Rotated0002GhIjKlM7nOpQr";
const REFRESHED_TOKEN = "Rf3sh0003KlM7nOpQrSt9UvWxYz1B2C4";

/** Invented credential. Nothing here is, or resembles, a real router password. */
const CREDENTIAL = { username: "admin", password: "Str0ng-Test-Pass" };

const OK_REPLY =
  '<?xml version="1.0" encoding="UTF-8"?>\n<response>OK</response>';

const USSD_IDLE =
  '<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<result>0</result>\n</response>';

function errorReply(code: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<error>\n<code>${code}</code>\n<message></message>\n</error>`;
}

/** The device pads the token; only its last 32 characters are the usable value. */
function tokenReply(token: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<token>padding${token}</token>\n</response>`;
}

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/hilink/${name}.xml`, import.meta.url)),
    "utf8",
  );
}

const NOT_READY = fixture("ussd-not-ready");

interface RecordedRequest {
  method: string;
  path: string;
  token: string | undefined;
  /** What the request carried. Empty for a `GET`. */
  body: string;
}

type Reply =
  { body: string; headers?: Record<string, string> } | { hang: true };

/** `hit` is 1 on the first request for that path, 2 on the second, and so on. */
type Responder = (path: string, hit: number) => Reply | undefined;

interface StubRouter {
  baseUrl: string;
  requests: RecordedRequest[];
  hits(path: string): number;
  tokens(path: string): Array<string | undefined>;
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
  },
};

/**
 * A throwaway HTTP server standing in for the router, recording the verification
 * token each request carried. Nothing here ever contacts a real device.
 */
async function startStubRouter(responder?: Responder): Promise<StubRouter> {
  const requests: RecordedRequest[] = [];
  const sockets = new Set<Socket>();
  const hitCounts = new Map<string, number>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "").split("?")[0] ?? "";
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      const hit = (hitCounts.get(path) ?? 0) + 1;
      hitCounts.set(path, hit);
      requests.push({
        method: req.method ?? "",
        path,
        token: headerValue(req.headers["__requestverificationtoken"]),
        body,
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
    tokens: (path) =>
      requests
        .filter((request) => request.path === path)
        .map((request) => request.token),
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

/**
 * The USSD dialogue up to its first send, with everything after it answered by
 * the carrier's "not ready yet". The zero reply window ends the attempt on the
 * first poll, so nothing here waits on a real timer.
 */
function ussdResponder(send: (hit: number) => Reply): Responder {
  return (path, hit) => {
    switch (path) {
      case LOGIN:
        return LOGIN_OK;
      case USSD_STATUS:
        return { body: USSD_IDLE };
      case USSD_SEND:
        return send(hit);
      case USSD_GET:
        return { body: NOT_READY };
      case USSD_RELEASE:
        return { body: OK_REPLY };
      case TOKEN_ENDPOINT:
        return { body: tokenReply(REFRESHED_TOKEN) };
      default:
        return undefined;
    }
  };
}

/** One dialogue, bounded so the first `/api/ussd/get` ends it. */
async function runDialogue(client: RouterClient): Promise<unknown> {
  await client.login(CREDENTIAL);
  return await client.readAllowance({ pollIntervalMs: 1, replyTimeoutMs: 0 });
}

describe("verification token rotation", () => {
  it("sends the token a reply rotated to, not the one the login issued", async () => {
    const stub = await startStubRouter((path, hit) => {
      if (path === USSD_STATUS) {
        return {
          body: USSD_IDLE,
          headers: { __RequestVerificationToken: ROTATED_TOKEN },
        };
      }
      return ussdResponder(() => ({ body: OK_REPLY }))(path, hit);
    });

    await runDialogue(new RouterClient({ baseUrl: stub.baseUrl }));

    expect(stub.tokens(USSD_SEND)).toEqual([ROTATED_TOKEN]);
    expect(stub.tokens(USSD_SEND)).not.toContain(ROLLING_TOKEN_ONE);
  });

  it("accepts the rolling token headers a login reply carries", async () => {
    const stub = await startStubRouter(
      ussdResponder(() => ({ body: OK_REPLY })),
    );

    await runDialogue(new RouterClient({ baseUrl: stub.baseUrl }));

    expect(stub.tokens(USSD_SEND)).toEqual([ROLLING_TOKEN_ONE]);
  });

  it("keeps sending the last token when a reply rotates nothing", async () => {
    const stub = await startStubRouter(
      ussdResponder(() => ({ body: OK_REPLY })),
    );
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await runDialogue(client);
    await client.readAllowance({ pollIntervalMs: 1, replyTimeoutMs: 0 });

    expect(stub.tokens(USSD_SEND)).toEqual([
      ROLLING_TOKEN_ONE,
      ROLLING_TOKEN_ONE,
    ]);
  });
});

describe("a POST refused with 125003", () => {
  it("refreshes the token and retries the POST exactly once", async () => {
    const stub = await startStubRouter(
      ussdResponder((hit) =>
        hit === 1 ? { body: errorReply(125003) } : { body: OK_REPLY },
      ),
    );

    await runDialogue(new RouterClient({ baseUrl: stub.baseUrl }));

    expect(stub.hits(TOKEN_ENDPOINT)).toBe(1);
    expect(stub.tokens(USSD_SEND)).toEqual([
      ROLLING_TOKEN_ONE,
      REFRESHED_TOKEN,
    ]);
  });

  it("surfaces the refusal and stops when the retry is refused too", async () => {
    const stub = await startStubRouter(
      ussdResponder(() => ({ body: errorReply(125003) })),
    );

    const client = new RouterClient({ baseUrl: stub.baseUrl });
    await client.login(CREDENTIAL);
    const result = await client.readAllowance({
      pollIntervalMs: 1,
      replyTimeoutMs: 0,
    });

    expect(result).toEqual({
      ok: false,
      reason: {
        kind: "error",
        source: "api",
        code: 125003,
        endpoint: USSD_SEND,
      },
    });
    expect(stub.hits(USSD_SEND)).toBe(2);
    expect(stub.hits(TOKEN_ENDPOINT)).toBe(1);
  });

  it("never signs in again, whatever the retry answers", async () => {
    const stub = await startStubRouter(
      ussdResponder(() => ({ body: errorReply(125003) })),
    );

    await runDialogue(new RouterClient({ baseUrl: stub.baseUrl }));

    expect(stub.hits(LOGIN)).toBe(1);
    expect(
      stub.requests.filter(
        (request) => request.method === "POST" && request.path === LOGIN,
      ),
    ).toHaveLength(1);
  });

  it("leaves any other refusal alone rather than refreshing the token", async () => {
    const stub = await startStubRouter(
      ussdResponder(() => ({ body: errorReply(100003) })),
    );

    const client = new RouterClient({ baseUrl: stub.baseUrl });
    await client.login(CREDENTIAL);
    const result = await client.readAllowance({
      pollIntervalMs: 1,
      replyTimeoutMs: 0,
    });

    expect(result).toEqual({ ok: false, reason: "not-logged-in" });
    expect(stub.hits(USSD_SEND)).toBe(1);
    expect(stub.hits(TOKEN_ENDPOINT)).toBe(0);
  });

  it("gives up without a retry when the token refresh itself fails", async () => {
    const stub = await startStubRouter((path, hit) =>
      path === TOKEN_ENDPOINT
        ? { body: errorReply(125002) }
        : ussdResponder(() => ({ body: errorReply(125003) }))(path, hit),
    );

    const client = new RouterClient({ baseUrl: stub.baseUrl });
    await client.login(CREDENTIAL);
    const result = await client.readAllowance({
      pollIntervalMs: 1,
      replyTimeoutMs: 0,
    });

    expect(result).toEqual({ ok: false, reason: "session" });
    expect(stub.hits(USSD_SEND)).toBe(1);
  });
});

/**
 * The MAC filter, read and written over the same authenticated transport.
 *
 * T-68's write is the first `POST` outside the USSD path, and it inherits the
 * whole of it: the single-use rotating token, the `125003` refresh-and-retry
 * rule, and the ban on ever signing in again to repair a spent token. Those are
 * asserted here exactly the way the dialogue's are, on the same stub, and
 * nothing in this file has ever spoken to a device.
 */
const MAC_FILTER = "/api/wlan/multi-macfilter-settings";

/** Requests for one path, narrowed to a method — the same path serves both. */
function callsOf(stub: StubRouter, method: string, path: string): number {
  return stub.requests.filter(
    (request) => request.method === method && request.path === path,
  ).length;
}

/** Every body the filter endpoint was `POST`ed, in order. */
function writtenBodies(stub: StubRouter): string[] {
  return stub.requests
    .filter(
      (request) => request.method === "POST" && request.path === MAC_FILTER,
    )
    .map((request) => request.body);
}

/** The filter reply, off across all four SSIDs, as T-62 captured it. */
const MAC_FILTER_AT_REST = fixture("macfilter");

/**
 * Everything the filter path needs that is not the filter itself: the login it
 * rides behind, and the token endpoint the `125003` rule reaches for.
 */
const filterSupport: Responder = (path) => {
  switch (path) {
    case LOGIN:
      return LOGIN_OK;
    case TOKEN_ENDPOINT:
      return { body: tokenReply(REFRESHED_TOKEN) };
    default:
      return undefined;
  }
};

/**
 * A stub whose filter endpoint is scripted by *its own* hit count. The read and
 * the write share one path, so `hit` counts both: the script is written as
 * "first call, second call" and the tests read as they are ordered.
 */
async function startFilterStub(
  filter: (call: number) => Reply,
): Promise<StubRouter> {
  let calls = 0;

  return await startStubRouter((path, hit) => {
    if (path === MAC_FILTER) {
      calls += 1;

      return filter(calls);
    }

    return filterSupport(path, hit);
  });
}

describe("the MAC filter over the authenticated transport", () => {
  it("reads the filter the router states, behind a session", async () => {
    const stub = await startFilterStub(() => ({ body: MAC_FILTER_AT_REST }));

    const client = new RouterClient({ baseUrl: stub.baseUrl });
    await client.login(CREDENTIAL);

    expect(await client.macFilter()).toEqual({
      online: true,
      filter: expect.objectContaining({ mode: "off", entries: [] }),
    });
  });

  it("reports a refused read as offline rather than rejecting", async () => {
    // `100003` is what the endpoint answers without a session, and T-62 found
    // that even *reading* the filter needs the stored password.
    const stub = await startFilterStub(() => ({ body: errorReply(100003) }));

    expect(
      await new RouterClient({ baseUrl: stub.baseUrl }).macFilter(),
    ).toEqual({ online: false, reason: "error" });
  });

  /** Sign in, read the filter, and hand back what the router said it holds. */
  async function readFilter(client: RouterClient): Promise<MacFilter> {
    await client.login(CREDENTIAL);
    const read = await client.macFilter();

    if (!read.online) {
      throw new Error("the stub refused the filter read");
    }

    return read.filter;
  }

  it("writes the whole filter back on a single POST", async () => {
    const stub = await startFilterStub((call) =>
      call === 1 ? { body: MAC_FILTER_AT_REST } : { body: OK_REPLY },
    );
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    expect(await client.writeMacFilter(await readFilter(client))).toEqual({
      ok: true,
    });
    expect(callsOf(stub, "POST", MAC_FILTER)).toBe(1);
    // All four blocks, or the router clears the three the write omitted.
    expect([
      ...(writtenBodies(stub)[0] ?? "").matchAll(/<Ssid>/g),
    ]).toHaveLength(4);
  });

  it("refreshes the token and retries the filter write exactly once on 125003", async () => {
    // Call 1 is the read, call 2 the write the router refuses, call 3 the retry.
    const stub = await startFilterStub((call) =>
      call === 1
        ? { body: MAC_FILTER_AT_REST }
        : call === 2
          ? { body: errorReply(125003) }
          : { body: OK_REPLY },
    );
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    expect(await client.writeMacFilter(await readFilter(client))).toEqual({
      ok: true,
    });
    expect(callsOf(stub, "POST", MAC_FILTER)).toBe(2);
    expect(stub.hits(TOKEN_ENDPOINT)).toBe(1);
  });

  it("never signs in again, whatever the retried filter write answers", async () => {
    const stub = await startFilterStub((call) =>
      call === 1 ? { body: MAC_FILTER_AT_REST } : { body: errorReply(125003) },
    );
    const client = new RouterClient({ baseUrl: stub.baseUrl });
    const written = await client.writeMacFilter(await readFilter(client));

    // Signing in again is the wrong repair for a spent token and the right way
    // to walk the account into its five-failure lockout.
    expect(callsOf(stub, "POST", LOGIN)).toBe(1);
    expect(callsOf(stub, "POST", MAC_FILTER)).toBe(2);
    expect(written).toEqual({
      ok: false,
      reason: {
        kind: "error",
        source: "api",
        code: 125003,
        endpoint: MAC_FILTER,
      },
    });
  });

  it("carries the token a reply rotated to, never the one the login issued", async () => {
    const stub = await startFilterStub((call) =>
      call === 1
        ? {
            body: MAC_FILTER_AT_REST,
            headers: { __RequestVerificationToken: ROTATED_TOKEN },
          }
        : { body: OK_REPLY },
    );
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.writeMacFilter(await readFilter(client));

    expect(
      stub.requests
        .filter(
          (request) => request.method === "POST" && request.path === MAC_FILTER,
        )
        .map((request) => request.token),
    ).toEqual([ROTATED_TOKEN]);
  });

  it("reports a write the router refused for want of a session", async () => {
    const stub = await startFilterStub(() => ({ body: errorReply(100003) }));

    expect(
      await new RouterClient({ baseUrl: stub.baseUrl }).writeMacFilter({
        mode: "off",
        entries: [],
        ssids: [],
      }),
    ).toEqual({ ok: false, reason: "not-logged-in" });
  });
});
