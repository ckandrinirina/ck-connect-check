import { readFileSync } from "node:fs";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  INFO_CONSO_PATH,
  PORTAL_BASE_URL,
  readInfoConso,
} from "../../src/orange/portal.js";

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/orange/${name}.html`, import.meta.url)),
    "utf8",
  );
}

/** The committed capture of the live page, the same one the parser tests read. */
const liveCapture = fixture("info-conso");

/** A page the portal could plausibly serve that states no forfait at all. */
const emptyPage =
  '<!DOCTYPE html><html lang="fr"><head><title>Info conso</title></head><body><p>Bienvenue</p></body></html>';

/** What the stub should do for one request: answer, refuse, or never answer. */
type Reply = { body: string } | { status: number } | { hang: true };

interface StubPortal {
  baseUrl: string;
  paths: string[];
  close: () => Promise<void>;
}

const openStubs: StubPortal[] = [];

/**
 * A throwaway HTTP server standing in for `123.orange.mg`, which only answers
 * from inside the Orange network. Nothing here ever leaves the loopback.
 */
async function startStubPortal(reply: Reply): Promise<StubPortal> {
  const paths: string[] = [];
  const sockets = new Set<Socket>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    paths.push((req.url ?? "").split("?")[0] ?? "");
    if ("hang" in reply) {
      return;
    }
    if ("status" in reply) {
      res.writeHead(reply.status).end();
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(reply.body);
  });

  server.on("connection", (socket: Socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address() as AddressInfo;

  const stub: StubPortal = {
    baseUrl: `http://127.0.0.1:${port}`,
    paths,
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

/** A base URL with nothing listening on it — the connection-refused case. */
async function deadBaseUrl(): Promise<string> {
  const stub = await startStubPortal({ body: emptyPage });
  const { baseUrl } = stub;
  await stub.close();
  openStubs.splice(openStubs.indexOf(stub), 1);
  return baseUrl;
}

describe("readInfoConso — a page it can read", () => {
  it("returns the account and forfaits the parser reads out of it", async () => {
    const stub = await startStubPortal({ body: liveCapture });

    const result = await readInfoConso({ baseUrl: stub.baseUrl });

    expect(result.state).toBe("read");
    if (result.state !== "read") {
      return;
    }
    expect(result.page.account).toEqual({ offer: "WiFiber", balanceAr: 0 });
    expect(result.page.forfaits).toHaveLength(1);
    expect(result.page.forfaits[0]?.label).toBe("Wifiber Go+ SSE");
    expect(result.page.forfaits[0]?.consumedBytes).toBe(7_960_000_000);
  });

  it("asks for the info-conso page and nothing else", async () => {
    const stub = await startStubPortal({ body: liveCapture });

    await readInfoConso({ baseUrl: stub.baseUrl });

    expect(stub.paths).toEqual([INFO_CONSO_PATH]);
  });
});

describe("readInfoConso — off the Orange network", () => {
  it("reports a timeout rather than waiting on a page that never answers", async () => {
    const stub = await startStubPortal({ hang: true });

    const result = await readInfoConso({
      baseUrl: stub.baseUrl,
      timeoutMs: 60,
    });

    expect(result).toEqual({ state: "unreachable", reason: "timeout" });
  });

  it("reports a refused connection as unreachable, without throwing", async () => {
    const baseUrl = await deadBaseUrl();

    const result = await readInfoConso({ baseUrl });

    expect(result).toEqual({ state: "unreachable", reason: "offline" });
  });

  it("reports a host that does not resolve as unreachable, without throwing", async () => {
    const result = await readInfoConso({
      baseUrl: "http://portal.invalid",
      timeoutMs: 2_000,
    });

    expect(result).toEqual({ state: "unreachable", reason: "offline" });
  });

  it("carries the status code when the portal answers something other than 200", async () => {
    const stub = await startStubPortal({ status: 404 });

    const result = await readInfoConso({ baseUrl: stub.baseUrl });

    expect(result).toEqual({
      state: "unreachable",
      reason: "http",
      status: 404,
    });
  });

  it("carries a middlebox's 503 just the same", async () => {
    const stub = await startStubPortal({ status: 503 });

    const result = await readInfoConso({ baseUrl: stub.baseUrl });

    expect(result).toEqual({
      state: "unreachable",
      reason: "http",
      status: 503,
    });
  });
});

describe("readInfoConso — reached but unreadable", () => {
  it("separates a 200 stating no forfait from an unreachable portal", async () => {
    const stub = await startStubPortal({ body: emptyPage });

    const result = await readInfoConso({ baseUrl: stub.baseUrl });

    expect(result).toEqual({ state: "unreadable" });
  });

  it("does not collapse someone else's 200 into 'no plan'", async () => {
    const stub = await startStubPortal({
      body: "<html><body><h1>Connexion Wi-Fi</h1></body></html>",
    });

    const result = await readInfoConso({ baseUrl: stub.baseUrl });

    expect(result.state).not.toBe("read");
    expect(result.state).toBe("unreadable");
  });
});

describe("readInfoConso — where it looks", () => {
  it("defaults to the portal's own address", () => {
    expect(PORTAL_BASE_URL).toBe("http://123.orange.mg");
  });

  it("goes only where its base URL says, so no test reaches the real portal", async () => {
    const unused = await startStubPortal({ body: liveCapture });
    const used = await startStubPortal({ body: liveCapture });

    await readInfoConso({ baseUrl: used.baseUrl });

    expect(used.paths).toHaveLength(1);
    expect(unused.paths).toHaveLength(0);
  });
});
