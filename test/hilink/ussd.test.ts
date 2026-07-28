/**
 * The `#359#` dialogue, driven entirely from the recorded fixtures. Nothing here
 * ever contacts a real device: the modem has a single USSD channel and the
 * carrier rate-limits it, so every reply comes from `test/fixtures/hilink/` and
 * every wait comes from the fake clock below.
 */

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
import { chooseDigit, MENU_SCRIPT } from "../../src/hilink/ussd.js";
import type { UssdClock } from "../../src/hilink/ussd.js";

const SES_TOK_INFO = "/api/webserver/SesTokInfo";
const USSD_STATUS = "/api/ussd/status";
const USSD_SEND = "/api/ussd/send";
const USSD_GET = "/api/ussd/get";
const USSD_RELEASE = "/api/ussd/release";

/** Only the handshake is served from a fixture by path; USSD is fully scripted. */
const FIXTURE_BY_PATH: Record<string, string> = {
  [SES_TOK_INFO]: "ses-tok-info",
};

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/hilink/${name}.xml`, import.meta.url)),
    "utf8",
  );
}

const OK_REPLY =
  '<?xml version="1.0" encoding="UTF-8"?>\n<response>OK</response>';

const NOT_READY = fixture("ussd-not-ready");
const MALFORMED = fixture("malformed");

/** The four replies captured from the device, in the order they arrived. */
const RECORDED_REPLIES = [
  fixture("ussd-1-credit"),
  fixture("ussd-2-offers"),
  fixture("ussd-3-offer"),
  fixture("ussd-4-allowance"),
];

function statusBody(result: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<result>${result}</result>\n</response>`;
}

const STATUS_IDLE = statusBody(0);

function errorReply(code: number): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<error>\n<code>${code}</code>\n<message></message>\n</error>`;
}

/** The router's own `/api/ussd/get` envelope, around arbitrary carrier text. */
function envelope(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<response>\n<content>${text}</content>\n<date></date>\n</response>`;
}

interface RecordedRequest {
  method: string;
  path: string;
  body: string;
}

/** What the stub should do for one request: answer, or never answer at all. */
type Reply = { body: string } | { hang: true };

/** `hit` is 1 on the first request for that path, 2 on the second, and so on. */
type Responder = (path: string, hit: number) => Reply | undefined;

interface StubRouter {
  baseUrl: string;
  requests: RecordedRequest[];
  hits(path: string): number;
  close(): Promise<void>;
}

const openStubs: StubRouter[] = [];

/**
 * A throwaway HTTP server standing in for the router. It reads request bodies so
 * the USSD sends can be inspected afterwards.
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
      });

      const custom = responder?.(path, hit);
      if (custom !== undefined && "hang" in custom) {
        return;
      }
      if (custom !== undefined) {
        res.writeHead(200, { "content-type": "text/xml" });
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

interface CarrierScript {
  /** What `/api/ussd/get` eventually answers, one entry per send, in order. */
  replies?: readonly string[];
  /** How many `111019` answers precede each of those replies. */
  pending?: number;
  /** The `/api/ussd/status` body. Idle unless a test says otherwise. */
  status?: string;
  /** The `/api/ussd/send` answer, by 1-based send number. */
  sendAnswer?: (sendNumber: number) => string | undefined;
}

/**
 * A scripted carrier. Each `/api/ussd/send` advances to the next reply; until it
 * is due, `/api/ussd/get` answers the recorded `111019`. A script shorter than
 * the dialogue leaves `get` answering `111019` forever, which is the
 * carrier-went-quiet case.
 */
function carrier(script: CarrierScript = {}): Responder {
  const replies = script.replies ?? RECORDED_REPLIES;
  const pending = script.pending ?? 0;
  let sends = 0;
  let polls = 0;

  return (path) => {
    if (path === USSD_STATUS) {
      return { body: script.status ?? STATUS_IDLE };
    }
    if (path === USSD_SEND) {
      sends += 1;
      polls = 0;
      return { body: script.sendAnswer?.(sends) ?? OK_REPLY };
    }
    if (path === USSD_GET) {
      polls += 1;
      const due = replies[sends - 1];
      return {
        body: polls > pending && due !== undefined ? due : NOT_READY,
      };
    }
    if (path === USSD_RELEASE) {
      return { body: OK_REPLY };
    }
    return undefined;
  };
}

interface FakeClock extends UssdClock {
  /** Every wait the dialogue asked for, in order. No real time ever passes. */
  readonly waits: number[];
}

function fakeClock(): FakeClock {
  const waits: number[] = [];
  let ms = Date.UTC(2026, 6, 28, 9, 0, 0);
  return {
    waits,
    now: () => new Date(ms),
    wait: (milliseconds) => {
      waits.push(milliseconds);
      ms += milliseconds;
      return Promise.resolve();
    },
  };
}

/** The `<content>` of one recorded `/api/ussd/send` body. */
function sentContent(body: string): string {
  return /<content>([\s\S]*?)<\/content>/.exec(body)?.[1] ?? "";
}

/** Everything sent to the carrier, in order. */
function sends(stub: StubRouter): string[] {
  return stub.requests
    .filter((request) => request.path === USSD_SEND)
    .map((request) => sentContent(request.body));
}

describe("RouterClient.readAllowance over the recorded fixtures", () => {
  it("returns the exact remaining allowance the carrier stated", async () => {
    const stub = await startStubRouter(carrier());

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.allowance.remainingBytes).toBe(145_835_900_000);
    expect(result.allowance.planLabel).toBe("NET MONTH 200 000");
    expect(result.allowance.expiresAt?.getDate()).toBe(25);
    expect((result.allowance.expiresAt?.getMonth() ?? -1) + 1).toBe(8);
    expect(result.allowance.expiresAt?.getFullYear()).toBe(2026);
  });

  it("sends #359# and then the three recorded menu digits, in order", async () => {
    const stub = await startStubRouter(carrier());

    await new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
      clock: fakeClock(),
    });

    expect(sends(stub)).toEqual(["#359#", "1", "1", "1"]);
  });

  it("posts each send with the codeType the device expects", async () => {
    const stub = await startStubRouter(carrier());

    await new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
      clock: fakeClock(),
    });

    const posts = stub.requests.filter((request) => request.path === USSD_SEND);
    expect(posts).toHaveLength(4);
    for (const post of posts) {
      expect(post.method).toBe("POST");
      expect(post.body).toContain("<codeType>CodeType</codeType>");
    }
  });

  it("checks /api/ussd/status before it sends anything", async () => {
    const stub = await startStubRouter(carrier());

    await new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
      clock: fakeClock(),
    });

    const paths = stub.requests
      .map((request) => request.path)
      .filter((path) => path !== SES_TOK_INFO);
    expect(paths[0]).toBe(USSD_STATUS);
  });
});

describe("readAllowance menu navigation", () => {
  /** Reply 3 with `Info conso` moved off position one. */
  const REORDERED_OFFER = envelope(
    "NET MONTH 200 000\n1 Autre chose\n2 Info conso\n00 Page precedente",
  );

  /** Reply 3 with no `Info conso` label at all. */
  const UNLABELLED_OFFER = envelope(
    "NET MONTH 200 000\n3 Autre chose\n00 Page precedente",
  );

  /** Reply 1 with `Mes offres` moved off position one. */
  const REORDERED_CREDIT = envelope(
    "Votre credit est: 0 Ar valable jusqu au 24/10/2026.\n1 Recharger\n2 Mes offres",
  );

  it("navigates an Info conso numbered 2 with 2, not with the recorded 1", async () => {
    const stub = await startStubRouter(
      carrier({
        replies: [
          RECORDED_REPLIES[0] ?? "",
          RECORDED_REPLIES[1] ?? "",
          REORDERED_OFFER,
          RECORDED_REPLIES[3] ?? "",
        ],
      }),
    );

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(sends(stub)).toEqual(["#359#", "1", "1", "2"]);
    expect(result.ok).toBe(true);
  });

  it("matches the Mes offres label wherever the carrier numbered it", async () => {
    const stub = await startStubRouter(
      carrier({
        replies: [
          REORDERED_CREDIT,
          RECORDED_REPLIES[1] ?? "",
          RECORDED_REPLIES[2] ?? "",
          RECORDED_REPLIES[3] ?? "",
        ],
      }),
    );

    await new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
      clock: fakeClock(),
    });

    expect(sends(stub)).toEqual(["#359#", "2", "1", "1"]);
  });

  it("falls back to the recorded digit when no option label matches", async () => {
    const stub = await startStubRouter(
      carrier({
        replies: [
          RECORDED_REPLIES[0] ?? "",
          RECORDED_REPLIES[1] ?? "",
          UNLABELLED_OFFER,
          RECORDED_REPLIES[3] ?? "",
        ],
      }),
    );

    await new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
      clock: fakeClock(),
    });

    expect(sends(stub)).toEqual(["#359#", "1", "1", "1"]);
  });

  it("never picks the Page precedente entry", async () => {
    const stub = await startStubRouter(
      carrier({
        replies: [
          RECORDED_REPLIES[0] ?? "",
          RECORDED_REPLIES[1] ?? "",
          REORDERED_OFFER,
          RECORDED_REPLIES[3] ?? "",
        ],
      }),
    );

    await new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
      clock: fakeClock(),
    });

    expect(sends(stub)).toHaveLength(4);
    expect(sends(stub)).not.toContain("00");
  });
});

describe("chooseDigit", () => {
  const step = MENU_SCRIPT[2] ?? { label: null, fallbackDigit: "1" };

  it("prefers the labelled option over the first one", () => {
    expect(
      chooseDigit(
        {
          text: "",
          options: [
            { digit: "1", label: "Autre chose" },
            { digit: "2", label: "Info conso" },
          ],
        },
        step,
      ),
    ).toBe("2");
  });

  it("uses the recorded digit when the menu carries no matching label", () => {
    expect(
      chooseDigit(
        { text: "", options: [{ digit: "7", label: "Autre chose" }] },
        step,
      ),
    ).toBe("1");
  });

  it("uses the recorded digit when the reply carries no menu at all", () => {
    expect(chooseDigit({ text: "", options: [] }, step)).toBe("1");
  });
});

describe("readAllowance polling", () => {
  it("retries a 111019 until content arrives, waiting on the injected clock", async () => {
    const stub = await startStubRouter(carrier({ pending: 1 }));
    const clock = fakeClock();

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({
      clock,
      // Far longer than the whole suite is allowed to take: a real delay here
      // would blow the test timeout, so passing proves the clock is injected.
      pollIntervalMs: 60_000,
      replyTimeoutMs: 600_000,
    });

    expect(result.ok).toBe(true);
    expect(clock.waits).toEqual([60_000, 60_000, 60_000, 60_000]);
    expect(stub.hits(USSD_GET)).toBe(8);
  });

  it("polls without waiting at all when the first get already carries content", async () => {
    const stub = await startStubRouter(carrier());
    const clock = fakeClock();

    await new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({ clock });

    expect(clock.waits).toEqual([]);
    expect(stub.hits(USSD_GET)).toBe(4);
  });

  it("ends the attempt with a timeout when the carrier never answers", async () => {
    const stub = await startStubRouter(carrier({ replies: [] }));
    const clock = fakeClock();

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({
      clock,
      pollIntervalMs: 1_000,
      replyTimeoutMs: 5_000,
    });

    expect(result).toEqual({ ok: false, reason: "timeout" });
    expect(clock.waits).toEqual([1_000, 1_000, 1_000, 1_000, 1_000]);
    expect(stub.hits(USSD_GET)).toBe(6);
  });

  it("keeps the poll window bounded rather than hammering the router", async () => {
    const stub = await startStubRouter(carrier({ replies: [] }));

    await new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
      clock: fakeClock(),
      pollIntervalMs: 2_000,
      replyTimeoutMs: 4_000,
    });

    expect(stub.hits(USSD_GET)).toBe(3);
    expect(stub.hits(USSD_SEND)).toBe(1);
  });
});

describe("readAllowance release", () => {
  it("releases the channel exactly once on the success path", async () => {
    const stub = await startStubRouter(carrier());

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(result.ok).toBe(true);
    expect(stub.hits(USSD_RELEASE)).toBe(1);
  });

  it("releases the channel after a mid-dialogue error", async () => {
    const stub = await startStubRouter(
      carrier({
        replies: [RECORDED_REPLIES[0] ?? "", errorReply(100005)],
      }),
    );

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(result).toEqual({ ok: false, reason: "error" });
    expect(stub.hits(USSD_RELEASE)).toBe(1);
  });

  it("releases the channel after a timeout", async () => {
    const stub = await startStubRouter(carrier({ replies: [] }));

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({
      clock: fakeClock(),
      pollIntervalMs: 1_000,
      replyTimeoutMs: 2_000,
    });

    expect(result).toEqual({ ok: false, reason: "timeout" });
    expect(stub.hits(USSD_RELEASE)).toBe(1);
  });

  it("releases the channel after an unparseable final reply", async () => {
    const stub = await startStubRouter(
      carrier({
        replies: [
          RECORDED_REPLIES[0] ?? "",
          RECORDED_REPLIES[1] ?? "",
          RECORDED_REPLIES[2] ?? "",
          envelope("Merci de votre visite."),
        ],
      }),
    );

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(result).toEqual({ ok: false, reason: "unreadable" });
    expect(stub.hits(USSD_RELEASE)).toBe(1);
  });

  it("releases the channel after a malformed reply body", async () => {
    const stub = await startStubRouter(
      carrier({
        replies: [
          RECORDED_REPLIES[0] ?? "",
          RECORDED_REPLIES[1] ?? "",
          RECORDED_REPLIES[2] ?? "",
          MALFORMED,
        ],
      }),
    );

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(result).toEqual({ ok: false, reason: "unreadable" });
    expect(stub.hits(USSD_RELEASE)).toBe(1);
  });
});

describe("readAllowance busy channel", () => {
  it("returns a busy reason without sending when the device reports a session", async () => {
    const stub = await startStubRouter(carrier({ status: statusBody(1) }));

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(result).toEqual({ ok: false, reason: "busy" });
    expect(stub.hits(USSD_SEND)).toBe(0);
    expect(stub.hits(USSD_GET)).toBe(0);
    expect(stub.hits(USSD_RELEASE)).toBe(0);
  });

  it("returns busy rather than interleaving a second concurrent dialogue", async () => {
    const stub = await startStubRouter(carrier({ pending: 1 }));
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    const first = client.readAllowance({ clock: fakeClock() });
    const second = await client.readAllowance({ clock: fakeClock() });
    const settled = await first;

    expect(second).toEqual({ ok: false, reason: "busy" });
    expect(settled.ok).toBe(true);
    expect(sends(stub)).toEqual(["#359#", "1", "1", "1"]);
    expect(stub.hits(USSD_RELEASE)).toBe(1);
  });

  it("frees the guard once the dialogue has finished", async () => {
    const stub = await startStubRouter(carrier());
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.readAllowance({ clock: fakeClock() });
    const second = await client.readAllowance({ clock: fakeClock() });

    expect(second.ok).toBe(true);
    expect(stub.hits(USSD_SEND)).toBe(8);
    expect(stub.hits(USSD_RELEASE)).toBe(2);
  });
});

describe("readAllowance missing login", () => {
  it("names the missing login when the send is refused with 100003", async () => {
    const stub = await startStubRouter(
      carrier({
        sendAnswer: (n) => (n === 1 ? errorReply(100003) : undefined),
      }),
    );

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(result).toEqual({ ok: false, reason: "not-logged-in" });
  });

  it("names the missing login for a 100003 arriving mid-dialogue", async () => {
    const stub = await startStubRouter(
      carrier({ replies: [RECORDED_REPLIES[0] ?? "", errorReply(100003)] }),
    );

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(result).toEqual({ ok: false, reason: "not-logged-in" });
  });

  it("keeps the missing login distinct from every other failure reason", async () => {
    const refused = await startStubRouter(
      carrier({
        sendAnswer: (n) => (n === 1 ? errorReply(100003) : undefined),
      }),
    );
    const broken = await startStubRouter(
      carrier({
        sendAnswer: (n) => (n === 1 ? errorReply(100005) : undefined),
      }),
    );

    const first = await new RouterClient({
      baseUrl: refused.baseUrl,
    }).readAllowance({ clock: fakeClock() });
    const second = await new RouterClient({
      baseUrl: broken.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(first).toEqual({ ok: false, reason: "not-logged-in" });
    expect(second).toEqual({ ok: false, reason: "error" });
  });

  it("stops the dialogue at the refused send rather than carrying on", async () => {
    const stub = await startStubRouter(
      carrier({
        sendAnswer: (n) => (n === 1 ? errorReply(100003) : undefined),
      }),
    );

    await new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
      clock: fakeClock(),
    });

    expect(stub.hits(USSD_SEND)).toBe(1);
    expect(stub.hits(USSD_GET)).toBe(0);
  });
});

describe("readAllowance never throws", () => {
  it("resolves to a reason when the router is unreachable", async () => {
    const baseUrl = await deadBaseUrl();

    await expect(
      new RouterClient({ baseUrl }).readAllowance({ clock: fakeClock() }),
    ).resolves.toEqual({ ok: false, reason: "unreachable" });
  });

  it("resolves to a reason when the USSD endpoints answer nothing usable", async () => {
    const stub = await startStubRouter();

    await expect(
      new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
        clock: fakeClock(),
      }),
    ).resolves.toEqual({ ok: false, reason: "error" });
  });

  it("resolves to a reason when the status reply itself is malformed", async () => {
    const stub = await startStubRouter(carrier({ status: MALFORMED }));

    const result = await new RouterClient({
      baseUrl: stub.baseUrl,
    }).readAllowance({ clock: fakeClock() });

    expect(result).toEqual({ ok: false, reason: "unreadable" });
    expect(stub.hits(USSD_STATUS)).toBe(1);
    expect(stub.hits(USSD_SEND)).toBe(0);
  });

  it("resolves to a session reason on a stale-session reply, as snapshot does", async () => {
    const stub = await startStubRouter(carrier({ status: errorReply(125002) }));

    await expect(
      new RouterClient({ baseUrl: stub.baseUrl }).readAllowance({
        clock: fakeClock(),
      }),
    ).resolves.toEqual({ ok: false, reason: "session" });
  });
});
