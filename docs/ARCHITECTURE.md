# ARCHITECTURE — ck-connect-check

A macOS menu bar app that shows how much mobile data the Huawei HiLink router at
`192.168.8.1` has used this month. It exists so the answer to "am I near my limit?" is
always visible at the top of the screen, with no browser and no login. It reads the same
`/api/` endpoints the router's own web UI calls, and adds the one thing the router does
not store: the user's actual plan limit.

## Stack

Nothing is installed yet — this is a greenfield directory. The intended stack, settled
in the start clarify round:

- **Language:** TypeScript 5.x (Node 22)
- **Shell:** Electron — `Tray` is the only way to put a title in the macOS menu bar from Node
- **Storage:** none — a single JSON config file, no database
- **Testing:** Vitest
- **Package manager:** npm (no lockfile present)

T-01 installs these and is the point at which this section describes reality.

## Commands

- test: `npm test` (Vitest, `vitest run`)
- build: `npm run build` (`tsc -p tsconfig.build.json` → `dist/`)
- lint: `npm run lint` (`eslint .`, flat config)

`tsconfig.json` is the strict base used for type-checking `src/` and `test/`;
`tsconfig.build.json` extends it, narrows the inputs to `src/` and is the only config
that emits. `test/fixtures/` is excluded from both, and from ESLint — it holds code that
is deliberately invalid.

## Router API

Verified live against the device on 2026-07-27. No authentication is required.

Base URL `http://192.168.8.1`. Every call needs a session obtained first:

```
GET /api/webserver/SesTokInfo  →  <SesInfo>SessionID=…</SesInfo>  <TokInfo>…</TokInfo>
```

Then send `Cookie: <SesInfo>` and `__RequestVerificationToken: <TokInfo>` on each request.
Responses are XML. A stale or missing session returns `<error><code>125002</code></error>`.

| Endpoint                             | Fields used                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `/api/monitoring/month_statistics`   | `CurrentMonthDownload`, `CurrentMonthUpload`, `MonthDuration`, `MonthLastClearTime`      |
| `/api/monitoring/traffic-statistics` | `CurrentDownloadRate`, `CurrentUploadRate`, `CurrentConnectTime`                         |
| `/api/monitoring/status`             | `ConnectionStatus`, `SignalIcon`, `maxsignal`, `CurrentNetworkTypeEx`, `CurrentWifiUser` |
| `/api/net/current-plmn`              | `FullName` (carrier — reads `Yas` on this device)                                        |
| `/api/monitoring/start_date`         | `StartDay` (billing cycle start), `DataLimit`, `MonthThreshold`                          |

Two findings that shape the design:

- `DataLimit` reads `0MB` — **the router holds no quota**, so the plan limit must come
  from our own config. Everything percentage-related depends on this.
- `StartDay` is `1` but `MonthLastClearTime` was `2026-7-27`. The two disagree, so the
  reset date is computed from `StartDay` and `MonthLastClearTime` is treated as advisory
  only. T-04 pins this down with tests.

### Authenticated API

Probed live on 2026-07-28. The device is a **B310s-22**, `SoftwareVersion 21.333.01.00.00`.
The monitoring endpoints above need no login, but every `POST` does — an unauthenticated
`POST /api/ussd/send` answers `<error><code>100003</code></error>` (no rights).

`GET /api/user/state-login` reports `State: -1` (logged out) and `password_type: 4`,
which selects the SHA-256 scrambling scheme:

```
hashedPassword = base64(sha256hex(password))
Password       = base64(sha256hex(username + hashedPassword + TokInfo))
POST /api/user/login  <request><Username>…</Username><Password>…</Password><password_type>4</password_type></request>
```

The reply carries a fresh `SessionID` in `Set-Cookie` and rolling tokens in the
`__RequestVerificationTokenone` / `…two` response headers; subsequent writes must use
those, not the handshake token. The token is single-use on a `POST` and rotates on every
reply — replaying the login's token on the next `POST` is refused with `125003` (wrong
session token), which is what a live Sync press produced on 2026-07-28. When a reply
carries no token header, `GET /api/webserver/token` answers the current one in a `<token>`
element, of which the last 32 characters are the value to send. A wrong credential answers `108006`, and the router locks
the account after five consecutive failures — so a failed login is never retried
automatically.

### USSD API

| Endpoint            | Method | Notes                                                                                     |
| ------------------- | ------ | ----------------------------------------------------------------------------------------- |
| `/api/ussd/status`  | GET    | `<result>0</result>` idle, non-zero while a session is in flight                          |
| `/api/ussd/send`    | POST   | `<request><content>…</content><codeType>CodeType</codeType><timeout></timeout></request>` |
| `/api/ussd/get`     | GET    | `<content>` once the carrier has replied; `111019` until then                             |
| `/api/ussd/release` | GET    | Ends the session. Answers `OK` even unauthenticated                                       |

USSD is request/response with a poll in between: send, then poll `get` until it yields
`<content>` instead of `111019`. Menu replies are sent through the same `send` endpoint
with the bare digit as the content.

The `#359#` path to the exact allowance, as captured from the device:

```
#359#  →  Votre credit est: 0 Ar valable jusqu au 24/10/2026.  /  1 Mes offres
1      →  Mes offres  /  1 NET MONTH 200 000
1      →  NET MONTH 200 000  /  1 Info conso  /  00 Page precedente
1      →  NET MONTH 200 000, il vous reste 145835.9 Mo utilisable a toute heure
          jusqu au 25/08/2026 inclus.
```

The final line is the ground truth the app is after: an exact remaining volume and an
exact expiry date, neither of which any `/api/monitoring/` endpoint knows.

## Syncing the real allowance

The router is a reliable **accumulator** and an unreliable **absolute** — it counts bytes
faithfully but has no idea what the plan is. USSD is the reverse: exact absolutes, but far
too slow and stateful to poll. So the two are joined by an _anchor_ rather than a stored
offset:

```
anchor = { syncedAt, remainingBytes, expiresAt, planLabel,
           routerMonthBytes,     // down+up at the sync instant
           routerClearTime }     // MonthLastClearTime, to notice a reset

remainingNow = anchor.remainingBytes − (routerMonthBytes − anchor.routerMonthBytes)
```

Only the _delta_ of the router's counter is ever used, so the anchor stays correct across
app restarts and long quits — the router keeps counting while nothing is watching. The
anchor is invalidated, not silently corrected, when `MonthLastClearTime` changes, when the
month counter moves backwards, or when `expiresAt` has passed.

The plan total behind the dial is the **highest `remainingBytes` ever anchored**: right
after a recharge that value _is_ the plan size, so the denominator calibrates itself
instead of being typed in.

## Folder structure

```
src/
  hilink/       router client — session handshake, login, XML parsing, USSD dialogue
  domain/       quota math, allowance anchor, formatting — pure, no I/O, no Electron
  config/       read and write the plan limit, router address and allowance anchor
  main/         Electron main process — tray, poll loop, popover window, login item,
                keychain-backed router password
  renderer/     popover UI (HTML + CSS + TS)
test/           mirrors src/, one .test.ts per source file
```

## Decisions

Append-only. One line each, always with the reason.

- Electron over native Swift — the stack is TypeScript, and `Tray` gives a menu bar title without leaving Node
- Live snapshot only, no history database — the goal is "am I near my limit right now", and persistence would need a background process for no gain
- Plan limit lives in local config, not on the router — the router reports `DataLimit` as `0MB`
- Re-handshake on error `125002` rather than caching a session — sessions expire silently and the handshake costs one cheap request
- `src/domain/` imports neither Electron nor the network — quota math stays testable without a router present
- Usage displayed in decimal GB (1000³), not GiB — carriers bill in decimal, and the number must match the user's plan
- Display units are French octets (`o`, `Ko`, `Mo`, `Go`, `To`) — the app is French-facing, so the screen must read `4.43 Go`; the decimal 1000³ scale is unchanged, only the labels
- The router's own `DataLimit` strings (`0MB`, `50GB`) keep their English suffixes in `src/hilink/parse.ts` — that is the device's wire format, not our display
- Router unreachable is a normal state rendered as "offline", never an error dialog or a crash — the app runs unattended in the menu bar
- `backgroundThrottling: false` on the popover window — Chromium defers work in a hidden renderer, so pushed updates piled up and the panel appeared to refresh only when opened or closed
- The poll interval is fast while the popover is visible and the configured one while it is hidden — a throughput figure only matters while someone is looking at it, and the router should not be asked twice a second for nothing
- Throughput history is a fixed-size in-memory ring buffer, dropped on quit — a sparkline needs the last few minutes, and "no history database" still holds for anything longer
- Charts are inline SVG built in the renderer from plain numbers — the page runs under `default-src 'none'`, so no chart library can be loaded, and a sparkline is a polyline
- The exact allowance comes from USSD `#359#`, not from any `/api/monitoring/` field — the router genuinely does not hold the figure, and the carrier menu is the only source of a real remaining volume and expiry date
- The USSD reading is stored as an anchor (remaining + router counter at that instant) and carried forward by the counter's delta, rather than as a stored offset on the total — a delta is immune to the router's absolute counter being meaningless, and survives restarts because the router accumulates while the app is closed
- The anchor is invalidated rather than adjusted when the month counter resets or expires — a silently corrected number is exactly the unreliability this feature removes
- The dial's 100% is the highest remaining volume ever anchored — immediately after a recharge that value is the plan size, so the denominator calibrates itself instead of being typed in
- The router admin password lives in the macOS Keychain via Electron `safeStorage`, never in `config.json` — the config file is plaintext next to the user's home directory, and USSD is the first feature to need a credential at all
- A failed router login is never retried automatically — the device locks the account after five consecutive failures, so a retry loop would lock the user out of their own router
- USSD is only ever driven by an explicit Sync press, never by the poll loop — a USSD dialogue takes tens of seconds, holds carrier-side state, and costs a real signalling exchange
- Menu navigation matches on reply labels (`Mes offres`, `Info conso`) and falls back to the recorded `1,1,1` digits — a carrier inserting a menu entry would otherwise land the app on the wrong screen silently
- The verification token advances with every reply and a `125003` refreshes it and retries the `POST` once, never re-logging-in — the token is single-use per write, and treating a spent token as a credential problem would walk the account towards its five-failure lockout
- An unrecognised router error code is carried to the surface with its code and endpoint, never collapsed into a bare "it failed" — the device's own numeric code is the only evidence of why it refused, and a reason string that discards it makes the failure undiagnosable

## Conventions

- XML never escapes `src/hilink/` — responses are parsed into typed objects at that boundary
- Every numeric field from the router arrives as a string; parse it at the boundary, never downstream
- Every network call carries an explicit timeout; there is no unbounded await
- The tray title stays under 12 characters so it does not crowd the menu bar
- Files kebab-case, exported types PascalCase
