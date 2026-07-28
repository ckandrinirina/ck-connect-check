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

| Endpoint | Fields used |
|---|---|
| `/api/monitoring/month_statistics` | `CurrentMonthDownload`, `CurrentMonthUpload`, `MonthDuration`, `MonthLastClearTime` |
| `/api/monitoring/traffic-statistics` | `CurrentDownloadRate`, `CurrentUploadRate`, `CurrentConnectTime` |
| `/api/monitoring/status` | `ConnectionStatus`, `SignalIcon`, `maxsignal`, `CurrentNetworkTypeEx`, `CurrentWifiUser` |
| `/api/net/current-plmn` | `FullName` (carrier — reads `Yas` on this device) |
| `/api/monitoring/start_date` | `StartDay` (billing cycle start), `DataLimit`, `MonthThreshold` |

Two findings that shape the design:

- `DataLimit` reads `0MB` — **the router holds no quota**, so the plan limit must come
  from our own config. Everything percentage-related depends on this.
- `StartDay` is `1` but `MonthLastClearTime` was `2026-7-27`. The two disagree, so the
  reset date is computed from `StartDay` and `MonthLastClearTime` is treated as advisory
  only. T-04 pins this down with tests.

## Folder structure

```
src/
  hilink/       router client — session handshake, XML parsing, typed snapshot
  domain/       quota math, byte and rate formatting — pure, no I/O, no Electron
  config/       read and write the user's plan limit and router address
  main/         Electron main process — tray, poll loop, popover window, login item
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
- Router unreachable is a normal state rendered as "offline", never an error dialog or a crash — the app runs unattended in the menu bar
- `backgroundThrottling: false` on the popover window — Chromium defers work in a hidden renderer, so pushed updates piled up and the panel appeared to refresh only when opened or closed
- The poll interval is fast while the popover is visible and the configured one while it is hidden — a throughput figure only matters while someone is looking at it, and the router should not be asked twice a second for nothing
- Throughput history is a fixed-size in-memory ring buffer, dropped on quit — a sparkline needs the last few minutes, and "no history database" still holds for anything longer
- Charts are inline SVG built in the renderer from plain numbers — the page runs under `default-src 'none'`, so no chart library can be loaded, and a sparkline is a polyline

## Conventions

- XML never escapes `src/hilink/` — responses are parsed into typed objects at that boundary
- Every numeric field from the router arrives as a string; parse it at the boundary, never downstream
- Every network call carries an explicit timeout; there is no unbounded await
- The tray title stays under 12 characters so it does not crowd the menu bar
- Files kebab-case, exported types PascalCase
