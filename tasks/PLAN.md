# PLAN — ck-connect-check

| ID | Title | Status | Size | Needs |
|---|---|---|---|---|
| T-01 | Set the project up so tests can run | done | S | — |
| T-02 | Turn the router's XML replies into typed data | done | S | T-01 |
| T-03 | Fetch a live usage snapshot from the router | done | M | T-02 |
| T-04 | Work out how much of the plan is used and when it resets | todo | S | T-01 |
| T-05 | Remember the plan limit and router address | todo | S | T-01 |
| T-06 | Show usage in the macOS menu bar | todo | M | T-03, T-04, T-05 |
| T-07 | Show the details when the menu bar item is clicked | todo | M | T-06 |
| T-08 | Warn when usage approaches or passes the limit | todo | S | T-04, T-06 |
| T-09 | Launch the app on login without a Dock icon | todo | S | T-06 |

## T-01 Set the project up so tests can run

T-01 · status: done · size: S · needs: — · files: package.json, package-lock.json, tsconfig.json, tsconfig.build.json, vitest.config.ts, eslint.config.js, .gitignore, src/app-info.ts, test/smoke.test.ts, test/strict-mode.test.ts, test/project-setup.test.ts, test/fixtures/strict/bad.ts, test/fixtures/strict/tsconfig.json, docs/ARCHITECTURE.md

### Acceptance
- [x] `npm test` exits 0 and reports at least one passing test
- [x] `npm run lint` exits 0 on the committed source
- [x] `npm run build` exits 0 and emits compiled output
- [x] TypeScript rejects an unused variable and an implicit `any` (strict mode is on)
- [x] `docs/ARCHITECTURE.md` `## Commands` names the three scripts that now exist

### Tasks
- [x] Failing smoke test that imports a source module and asserts on it
- [x] `package.json` with `test`, `build` and `lint` scripts, Electron and Vitest as dependencies
- [x] `tsconfig.json` in strict mode, `vitest.config.ts`, flat ESLint config
- [x] `.gitignore` covering `node_modules/`, `dist/`, `out/`
- [x] Replace the three `(none)` values under `## Commands` in `docs/ARCHITECTURE.md`

## T-02 Turn the router's XML replies into typed data

T-02 · status: done · size: S · needs: T-01 · files: src/hilink/parse.ts, src/hilink/types.ts, test/hilink/parse.test.ts, test/fixtures/hilink/*.xml

### Acceptance
- [x] A recorded `month_statistics` reply parses to numeric `monthDownloadBytes` 4427475340 and `monthUploadBytes` 1403243047
- [x] A recorded `traffic-statistics` reply parses to numeric `downloadRateBps` and `uploadRateBps`
- [x] A recorded `status` reply parses to `signalBars`, `maxSignalBars`, `connectedDevices` and a `connected` boolean
- [x] A recorded `current-plmn` reply parses to `carrier` `"Yas"`
- [x] A recorded `start_date` reply parses to `startDay` 1 and `routerDataLimitBytes` 0
- [x] An `<error><code>125002</code></error>` reply is recognised as a stale-session error, distinct from a parse failure
- [x] Malformed XML raises a typed parse error naming the endpoint, never returns `undefined` fields
- [x] Every parsed numeric field is `typeof "number"`, never a string

### Tasks
- [x] Save the six live replies already captured as fixtures under `test/fixtures/`
- [x] Failing tests for every criterion above
- [x] Declare the `RouterSnapshot` field types in `src/hilink/types.ts`
- [x] Implement the parser, converting all numeric fields at the boundary

### Notes
- Fixtures were re-captured live from the device on 2026-07-27 for authentic element
  names and ordering, with the month totals pinned to the recorded values above so the
  criteria stay stable. `ses-tok-info.xml` carries a synthetic session ID of the same
  shape — no real token is committed.
- `DataLimit` is parsed with decimal units (`50GB` → 50,000,000,000 bytes), matching the
  architecture decision to display usage in decimal GB.

## T-03 Fetch a live usage snapshot from the router

T-03 · status: done · size: M · needs: T-02 · files: src/hilink/client.ts, src/hilink/session.ts, test/hilink/client.test.ts

### Acceptance
- [x] A snapshot request first calls `/api/webserver/SesTokInfo`, then sends the returned `SesInfo` as `Cookie` and `TokInfo` as `__RequestVerificationToken` on every subsequent call
- [x] The five data endpoints are fetched and merged into one `RouterSnapshot`
- [x] A `125002` response triggers exactly one fresh handshake and one retry; a second `125002` returns an offline result
- [x] The session is reused across polls and only re-fetched after a `125002`
- [x] An unreachable host returns `{ online: false, reason: "unreachable" }` and never throws
- [x] A request that exceeds the configured timeout aborts and returns an offline result
- [x] The router host is injected, not hard-coded — the tests drive a stub server, not `192.168.8.1`

### Tasks
- [x] Failing tests against a stub HTTP server serving the T-02 fixtures
- [x] Session handshake with cookie and token capture
- [x] Snapshot fetcher merging the five endpoints
- [x] Retry-once-on-125002 and timeout handling
- [x] Offline result type covering unreachable, timeout and repeated-session-failure

### Notes
- Endpoints are fetched sequentially on one session; a 125002 retries the whole
  snapshot rather than the single failed call — decided in the T-03 clarify round.
- Malformed XML and non-125002 API codes return `{ online: false, reason: "error" }`
  rather than throwing, so every failure renders as "offline".

## T-04 Work out how much of the plan is used and when it resets

T-04 · status: todo · size: S · needs: T-01 · files: src/domain/quota.ts, src/domain/format.ts, test/domain/quota.test.ts, test/domain/format.test.ts

### Acceptance
- [ ] 4427475340 + 1403243047 bytes against a 20 GB plan yields 29% used
- [ ] Percentage is `null` when no plan limit is configured, never 0 and never a divide-by-zero
- [ ] Usage over the plan limit yields a percentage above 100, not a value clamped to 100
- [ ] Days until reset is computed from `startDay`: on 27 July with `startDay` 1 the answer is 5
- [ ] A `startDay` of 31 in a 30-day month resets on the last day of that month
- [ ] Bytes format as decimal GB — 4427475340 renders `"4.43 GB"`, 1024 renders `"1.02 kB"`
- [ ] Rates format as `"2.3 KB/s"`, and a zero rate renders `"0 B/s"`
- [ ] Durations format from seconds — 28008 renders `"7h 46m"`

### Tasks
- [ ] Failing tests for every criterion, with the reset-date cases driven by an injected clock
- [ ] Quota math in `src/domain/quota.ts` — pure, clock injected, no I/O
- [ ] Byte, rate and duration formatters in `src/domain/format.ts`

## T-05 Remember the plan limit and router address

T-05 · status: todo · size: S · needs: T-01 · files: src/config/config.ts, src/config/defaults.ts, test/config/config.test.ts

### Acceptance
- [ ] With no config file present, defaults load: host `192.168.8.1`, poll interval 30s, warn threshold 90, plan limit unset
- [ ] A written config round-trips through save and load unchanged
- [ ] A corrupt config file falls back to defaults and reports the problem instead of crashing
- [ ] A plan limit is accepted in GB and stored as bytes
- [ ] A negative or non-numeric plan limit is rejected with a named validation error
- [ ] A poll interval below 5 seconds is rejected — the router must not be hammered
- [ ] The config path is injected, so tests never touch the real user directory

### Tasks
- [ ] Failing tests for defaults, round-trip, corruption and each validation rule
- [ ] Config schema with validation and GB-to-bytes conversion
- [ ] Load and save against an injected path

## T-06 Show usage in the macOS menu bar

T-06 · status: todo · size: M · needs: T-03, T-04, T-05 · files: src/main/main.ts, src/main/tray.ts, src/main/poller.ts, test/main/tray.test.ts, test/main/poller.test.ts

### Acceptance
- [ ] `buildTrayTitle` renders `"5.8G · 29%"` for 5.83 GB used of a 20 GB plan
- [ ] With no plan limit configured it renders the used total alone, e.g. `"5.8G"`, with no percentage
- [ ] An offline snapshot renders `"offline"`
- [ ] No title exceeds 12 characters for any usage up to 999 GB
- [ ] The poller calls the router once per configured interval and no more, verified with fake timers
- [ ] A failed poll leaves the previous title in place rather than blanking it
- [ ] Two consecutive failed polls switch the title to the offline form
- [ ] The app hides its Dock icon so it exists only in the menu bar

### Tasks
- [ ] Failing tests for the title builder and the poll loop against fake timers and a stub client
- [ ] Pure `buildTrayTitle` in `src/main/tray.ts`, taking a snapshot and config, returning a string
- [ ] Poll loop with last-good-value retention and consecutive-failure counting
- [ ] Electron bootstrap wiring tray, poller and `app.dock.hide()`

## T-07 Show the details when the menu bar item is clicked

T-07 · status: todo · size: M · needs: T-06 · files: src/main/popover.ts, src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, test/main/view-model.test.ts

### Acceptance
- [ ] `buildPopoverModel` exposes month download, month upload, percentage, live down and up rates, connected device count, carrier, signal bars and days until reset
- [ ] Every numeric field arrives pre-formatted as a display string — the renderer performs no arithmetic
- [ ] With no plan limit configured the model marks the progress bar unavailable and prompts the user to set a limit
- [ ] An offline snapshot produces a model flagged stale, carrying the last successful reading and its age
- [ ] Clicking the tray toggles the popover: open when closed, closed when open
- [ ] The popover closes when it loses focus
- [ ] The popover window is frameless, non-resizable and excluded from the app switcher

### Tasks
- [ ] Failing tests for the view model across the live, no-limit and offline cases
- [ ] `buildPopoverModel` mapping snapshot plus config to display strings, using the T-04 formatters
- [ ] Popover window creation, tray-click toggle and blur-to-close
- [ ] Renderer markup and styling for the layout, honouring macOS light and dark appearance

## T-08 Warn when usage approaches or passes the limit

T-08 · status: todo · size: S · needs: T-04, T-06 · files: src/domain/quota.ts, src/main/tray.ts, test/domain/quota.test.ts, test/main/tray.test.ts

### Acceptance
- [ ] Usage state is `"ok"` below the warn threshold, `"warn"` at or above it, `"over"` at or above 100%
- [ ] The warn threshold comes from config and defaults to 90
- [ ] With no plan limit configured the state is `"unknown"`, never `"ok"`
- [ ] The tray title for `"warn"` and `"over"` carries a marker absent from `"ok"`
- [ ] The popover model exposes the state so the progress bar can be styled by it
- [ ] Crossing into `"warn"` or `"over"` fires the state-change callback exactly once, not on every poll

### Tasks
- [ ] Failing tests for each threshold boundary, including exactly-at-threshold and exactly-at-100%
- [ ] `usageState` in `src/domain/quota.ts`
- [ ] Thread the state through the tray title and the popover model
- [ ] Edge-triggered state-change callback with the previous state retained between polls

## T-09 Launch the app on login without a Dock icon

T-09 · status: todo · size: S · needs: T-06 · files: package.json, src/main/login-item.ts, test/main/login-item.test.ts

### Acceptance
- [ ] `setLaunchAtLogin(true)` calls Electron's login-item API with `openAtLogin: true`, and `false` clears it
- [ ] The current setting is readable, so the popover can show it as a checked state
- [ ] `npm run package` exits 0 and produces a launchable `.app` under `out/`
- [ ] The packaged app shows a menu bar item and no Dock icon when launched

### Tasks
- [ ] Failing tests for the login-item wrapper against a mocked Electron `app`
- [ ] Login-item wrapper and a toggle in the popover
- [ ] Packaging config and a `package` script
- [ ] Manual check: launch the packaged app, confirm menu bar item and absent Dock icon

### Notes
The packaging and Dock-icon criteria are verified by launching the built app by hand —
the test suite covers the login-item wrapper only. Record the result here when done.
