import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo, Socket } from 'node:net';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import { RouterClient } from '../../src/hilink/client.js';

const SES_TOK_INFO = '/api/webserver/SesTokInfo';

const DATA_ENDPOINTS = [
  '/api/monitoring/month_statistics',
  '/api/monitoring/traffic-statistics',
  '/api/monitoring/status',
  '/api/net/current-plmn',
  '/api/monitoring/start_date',
];

const FIXTURE_BY_PATH: Record<string, string> = {
  [SES_TOK_INFO]: 'ses-tok-info',
  '/api/monitoring/month_statistics': 'month_statistics',
  '/api/monitoring/traffic-statistics': 'traffic-statistics',
  '/api/monitoring/status': 'status',
  '/api/net/current-plmn': 'current-plmn',
  '/api/monitoring/start_date': 'start_date',
};

/** The values the `ses-tok-info` fixture hands out. */
const SESSION_ID =
  'SessionID=uQp2RKLAwsGdKzXhVn7YtBcM4pQe9WfJ3rLmNbXsTvHu6DyKaZgP8CiEoRqF';
const TOKEN = 'CY8/MvG3W0kNqZpLdRyTbAe1';

function fixture(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/hilink/${name}.xml`, import.meta.url)),
    'utf8',
  );
}

const STALE_SESSION = fixture('error-125002');

interface RecordedRequest {
  path: string;
  cookie: string | undefined;
  token: string | undefined;
}

/** What the stub should do for one request: answer with a body, or never answer. */
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

function headerValue(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * A throwaway HTTP server standing in for the router, serving the same fixtures
 * the parser tests use. Nothing here ever contacts a real device.
 */
async function startStubRouter(responder?: Responder): Promise<StubRouter> {
  const requests: RecordedRequest[] = [];
  const sockets = new Set<Socket>();
  const hitCounts = new Map<string, number>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '').split('?')[0] ?? '';
    const hit = (hitCounts.get(path) ?? 0) + 1;
    hitCounts.set(path, hit);
    requests.push({
      path,
      cookie: headerValue(req.headers.cookie),
      token: headerValue(req.headers['__requestverificationtoken']),
    });

    const custom = responder?.(path, hit);
    if (custom !== undefined && 'hang' in custom) {
      return;
    }
    const body = custom?.body ?? FIXTURE_BY_PATH[path];
    if (body === undefined) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/xml' });
    res.end(custom === undefined ? fixture(body) : body);
  });

  server.on('connection', (socket: Socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
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

describe('RouterClient handshake', () => {
  it('calls SesTokInfo before any data endpoint', async () => {
    const stub = await startStubRouter();
    await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    expect(stub.requests[0]?.path).toBe(SES_TOK_INFO);
  });

  it('sends the session cookie and verification token on every data request', async () => {
    const stub = await startStubRouter();
    await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    const dataRequests = stub.requests.filter((request) => request.path !== SES_TOK_INFO);
    expect(dataRequests).toHaveLength(DATA_ENDPOINTS.length);
    for (const request of dataRequests) {
      expect(request.cookie).toBe(SESSION_ID);
      expect(request.token).toBe(TOKEN);
    }
  });
});

describe('RouterClient snapshot', () => {
  it('fetches all five data endpoints', async () => {
    const stub = await startStubRouter();
    await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    for (const endpoint of DATA_ENDPOINTS) {
      expect(stub.hits(endpoint)).toBe(1);
    }
  });

  it('merges the five replies into one snapshot', async () => {
    const stub = await startStubRouter();
    const result = await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    expect(result.online).toBe(true);
    if (!result.online) {
      return;
    }
    expect(result.snapshot.month.monthDownloadBytes).toBe(4427475340);
    expect(result.snapshot.month.monthUploadBytes).toBe(1403243047);
    expect(result.snapshot.traffic.downloadRateBps).toBe(9828);
    expect(result.snapshot.status.connected).toBe(true);
    expect(result.snapshot.status.signalBars).toBe(5);
    expect(result.snapshot.carrier.carrier).toBe('Yas');
    expect(result.snapshot.billing.startDay).toBe(1);
    expect(result.snapshot.billing.warnThresholdPercent).toBe(90);
  });

  it('reads the router host from its options rather than a hard-coded address', async () => {
    const first = await startStubRouter();
    const second = await startStubRouter();

    await new RouterClient({ baseUrl: second.baseUrl }).snapshot();

    expect(second.requests.length).toBeGreaterThan(0);
    expect(first.requests).toHaveLength(0);
  });
});

describe('RouterClient stale sessions', () => {
  it('re-handshakes once and retries after a 125002', async () => {
    const stub = await startStubRouter((path, hit) =>
      path === '/api/monitoring/status' && hit === 1 ? { body: STALE_SESSION } : undefined,
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    expect(result.online).toBe(true);
    expect(stub.hits(SES_TOK_INFO)).toBe(2);
  });

  it('returns an offline result when the retry also gets a 125002', async () => {
    const stub = await startStubRouter((path) =>
      path === '/api/monitoring/status' ? { body: STALE_SESSION } : undefined,
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    expect(result).toEqual({ online: false, reason: 'session' });
    expect(stub.hits(SES_TOK_INFO)).toBe(2);
  });

  it('reuses one session across repeated polls', async () => {
    const stub = await startStubRouter();
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.snapshot();
    await client.snapshot();
    await client.snapshot();

    expect(stub.hits(SES_TOK_INFO)).toBe(1);
    expect(stub.hits('/api/monitoring/status')).toBe(3);
  });

  it('re-fetches the session only after a stale-session reply', async () => {
    let staleNext = false;
    const stub = await startStubRouter((path) => {
      if (path === '/api/monitoring/status' && staleNext) {
        staleNext = false;
        return { body: STALE_SESSION };
      }
      return undefined;
    });
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    await client.snapshot();
    expect(stub.hits(SES_TOK_INFO)).toBe(1);

    staleNext = true;
    await client.snapshot();
    expect(stub.hits(SES_TOK_INFO)).toBe(2);

    await client.snapshot();
    expect(stub.hits(SES_TOK_INFO)).toBe(2);
  });
});

describe('RouterClient offline results', () => {
  it('reports an unreachable host without throwing', async () => {
    const baseUrl = await deadBaseUrl();

    const result = await new RouterClient({ baseUrl }).snapshot();

    expect(result).toEqual({ online: false, reason: 'unreachable' });
  });

  it('reports a timeout when a data endpoint never answers', async () => {
    const stub = await startStubRouter((path) =>
      path === '/api/monitoring/status' ? { hang: true } : undefined,
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl, timeoutMs: 60 }).snapshot();

    expect(result).toEqual({ online: false, reason: 'timeout' });
  });

  it('reports a timeout when the handshake never answers', async () => {
    const stub = await startStubRouter((path) =>
      path === SES_TOK_INFO ? { hang: true } : undefined,
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl, timeoutMs: 60 }).snapshot();

    expect(result).toEqual({ online: false, reason: 'timeout' });
  });

  it('reports a malformed reply as an error rather than throwing', async () => {
    const stub = await startStubRouter((path) =>
      path === '/api/monitoring/month_statistics'
        ? { body: fixture('malformed') }
        : undefined,
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    expect(result).toEqual({ online: false, reason: 'error' });
  });

  it('does not retry an API error that is not a stale session', async () => {
    const stub = await startStubRouter((path) =>
      path === '/api/monitoring/status'
        ? { body: STALE_SESSION.replace('125002', '100002') }
        : undefined,
    );

    const result = await new RouterClient({ baseUrl: stub.baseUrl }).snapshot();

    expect(result).toEqual({ online: false, reason: 'error' });
    expect(stub.hits(SES_TOK_INFO)).toBe(1);
  });

  it('recovers on the next poll once the router answers again', async () => {
    let broken = true;
    const stub = await startStubRouter((path) =>
      path === '/api/monitoring/status' && broken ? { body: fixture('malformed') } : undefined,
    );
    const client = new RouterClient({ baseUrl: stub.baseUrl });

    expect((await client.snapshot()).online).toBe(false);
    broken = false;
    expect((await client.snapshot()).online).toBe(true);
  });
});
