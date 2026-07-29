# PLAN — ck-connect-check

| ID   | Title                                                                   | Status | Size | Needs            |
| ---- | ----------------------------------------------------------------------- | ------ | ---- | ---------------- |
| T-01 | Set the project up so tests can run                                     | done   | S    | —                |
| T-02 | Turn the router's XML replies into typed data                           | done   | S    | T-01             |
| T-03 | Fetch a live usage snapshot from the router                             | done   | M    | T-02             |
| T-04 | Work out how much of the plan is used and when it resets                | done   | S    | T-01             |
| T-05 | Remember the plan limit and router address                              | done   | S    | T-01             |
| T-06 | Show usage in the macOS menu bar                                        | done   | M    | T-03, T-04, T-05 |
| T-07 | Show the details when the menu bar item is clicked                      | done   | M    | T-06             |
| T-08 | Warn when usage approaches or passes the limit                          | done   | S    | T-04, T-06       |
| T-09 | Launch the app on login without a Dock icon                             | done   | S    | T-06             |
| T-10 | Keep the open panel refreshing instead of freezing until it is reopened | done   | S    | T-07             |
| T-11 | Refresh quickly while the panel is open and slowly while it is shut     | done   | S    | T-10             |
| T-12 | Remember the last few minutes of throughput                             | done   | S    | T-03             |
| T-13 | Show the month's usage as a dial instead of a bar                       | done   | M    | T-10             |
| T-14 | Show download and upload rates as live sparklines                       | done   | M    | T-12, T-13       |
| T-15 | Show sizes in French octets (Go) instead of English bytes (GB)          | done   | S    | T-14             |
| T-16 | Read the carrier's USSD replies as data instead of text                 | done   | S    | T-02             |
| T-17 | Sign in to the router so its protected endpoints can be used            | done   | M    | T-03             |
| T-18 | Ask the carrier for the exact remaining allowance over USSD             | done   | M    | T-16, T-17       |
| T-19 | Keep the router password in the macOS Keychain                          | done   | S    | T-17             |
| T-20 | Carry the real allowance forward with the router's own counter          | done   | M    | T-18, T-05       |
| T-21 | Sync the real figures from the panel with one button                    | done   | M    | T-19, T-20       |
| T-22 | Make the packaged app find its own panel                                | done   | S    | T-21             |
| T-23 | Say which error the router actually returned when a sync fails          | done   | S    | T-21             |
| T-24 | Give every POST a token the router has not already spent                | done   | M    | T-23             |
| T-25 | Measure the dial against the plan the user actually bought              | done   | M    | T-21             |
| T-26 | Make the menu bar agree with the panel                                  | done   | S    | T-25             |
| T-27 | Let the plan cap be typed into the panel                                | done   | M    | T-25             |
| T-28 | Sync by itself when there is nothing trustworthy to show                | done   | S    | T-21             |
| T-29 | Drop the reset countdown the carrier never agreed with                  | done   | S    | T-25             |
| T-30 | Draw the signal as real bars instead of a coloured square               | done   | S    | T-07             |
| T-31 | Say which network the router is actually on                             | done   | S    | T-30             |
| T-32 | Put Sync where the panel is looked at first                             | done   | S    | T-21             |
| T-33 | Give the app a mark of its own in Finder and the Dock                   | done   | M    | —                |
| T-34 | Put the signal glyph next to the number in the menu bar                 | done   | M    | T-33, T-30       |
| T-35 | Introduce the app to someone arriving from GitHub                       | done   | M    | T-33, T-34       |
| T-36 | Ask how long the plan lasts so the pace has a period                    | done   | M    | T-27             |
| T-37 | Work out whether the connection is being used moderately                | done   | M    | T-36             |
| T-38 | Show the pace and its warning on the panel                              | todo   | M    | T-37             |
| T-39 | Know when the carrier figure has gone stale                             | done   | S    | T-28             |
| T-40 | Re-sync by itself on open and after a long silence                      | todo   | M    | T-39             |
| T-41 | Release the pace and the automatic sync as 0.2.0                        | todo   | S    | T-38, T-40, T-42 |
| T-42 | Notice a new plan instead of reporting the old one's share              | todo   | M    | T-27, T-28       |

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

T-04 · status: done · size: S · needs: T-01 · files: src/domain/quota.ts, src/domain/format.ts, test/domain/quota.test.ts, test/domain/format.test.ts

### Acceptance

- [x] 4427475340 + 1403243047 bytes against a 20 GB plan yields 29% used
- [x] Percentage is `null` when no plan limit is configured, never 0 and never a divide-by-zero
- [x] Usage over the plan limit yields a percentage above 100, not a value clamped to 100
- [x] Days until reset is computed from `startDay`: on 27 July with `startDay` 1 the answer is 5
- [x] A `startDay` of 31 in a 30-day month resets on the last day of that month
- [x] Bytes format as decimal GB — 4427475340 renders `"4.43 GB"`, 1024 renders `"1.02 kB"`
- [x] Rates format as `"2.3 KB/s"`, and a zero rate renders `"0 B/s"`
- [x] Durations format from seconds — 28008 renders `"7h 46m"`

### Tasks

- [x] Failing tests for every criterion, with the reset-date cases driven by an injected clock
- [x] Quota math in `src/domain/quota.ts` — pure, clock injected, no I/O
- [x] Byte, rate and duration formatters in `src/domain/format.ts`

### Notes

`percentUsed` returns the exact value (`29.153591935`), never pre-rounded; `formatPercent`
rounds it for display and renders `—` for `null`. T-08 compares thresholds against the
exact value. Exports: `Clock`, `systemClock`, `totalUsedBytes`, `percentUsed`,
`nextResetDate`, `daysUntilReset`, `formatBytes`, `formatRate`, `formatDuration`,
`formatPercent`.

## T-05 Remember the plan limit and router address

T-05 · status: done · size: S · needs: T-01 · files: src/config/config.ts, src/config/defaults.ts, test/config/config.test.ts

### Acceptance

- [x] With no config file present, defaults load: host `192.168.8.1`, poll interval 30s, warn threshold 90, plan limit unset
- [x] A written config round-trips through save and load unchanged
- [x] A corrupt config file falls back to defaults and reports the problem instead of crashing
- [x] A plan limit is accepted in GB and stored as bytes
- [x] A negative or non-numeric plan limit is rejected with a named validation error
- [x] A poll interval below 5 seconds is rejected — the router must not be hammered
- [x] The config path is injected, so tests never touch the real user directory

### Tasks

- [x] Failing tests for defaults, round-trip, corruption and each validation rule
- [x] Config schema with validation and GB-to-bytes conversion
- [x] Load and save against an injected path

### Notes

`AppConfig` stores `planLimitBytes: number | null` (null = unset) so it round-trips
through JSON. `loadConfig(path)` returns `{ config, problem? }` and never throws;
`saveConfig(path, config)` validates before writing and creates the parent directory.
`gigabytesToBytes` is decimal (1000³) and throws `ConfigValidationError` carrying
`.field`. `defaultConfigPath()` resolves lazily via `node:os`, with no Electron import.

## T-06 Show usage in the macOS menu bar

T-06 · status: done · size: M · needs: T-03, T-04, T-05 · files: src/main/main.ts, src/main/tray.ts, src/main/poller.ts, test/main/tray.test.ts, test/main/poller.test.ts, test/main/main.test.ts, package.json

### Acceptance

- [x] `buildTrayTitle` renders `"5.8G · 29%"` for 5.83 GB used of a 20 GB plan
- [x] With no plan limit configured it renders the used total alone, e.g. `"5.8G"`, with no percentage
- [x] An offline snapshot renders `"offline"`
- [x] No title exceeds 12 characters for any usage up to 999 GB
- [x] The poller calls the router once per configured interval and no more, verified with fake timers
- [x] A failed poll leaves the previous title in place rather than blanking it
- [x] Two consecutive failed polls switch the title to the offline form
- [x] The app hides its Dock icon so it exists only in the menu bar

### Tasks

- [x] Failing tests for the title builder and the poll loop against fake timers and a stub client
- [x] Pure `buildTrayTitle` in `src/main/tray.ts`, taking a snapshot and config, returning a string
- [x] Poll loop with last-good-value retention and consecutive-failure counting
- [x] Electron bootstrap wiring tray, poller and `app.dock.hide()`

### Notes

`buildTrayTitle(result: SnapshotResult, config: AppConfig)` is pure and exports
`MAX_TRAY_TITLE_LENGTH` (12) and `OFFLINE_TRAY_TITLE`; the percentage is display-clamped
at 999% so the width cap holds at any usage. `UsagePoller` exposes `title`, `start()`,
`stop()` and an `onTitle` callback that fires only on change; it self-schedules the next
poll after each settles, so polls never overlap. `startMenuBarApp({configPath?, client?})`
takes injectable deps and returns `{ stop() }`. Added a `"start"` script to package.json
(`npm run build && electron .`) and `test/main/main.test.ts`; both are appended to
`files:` above.

## T-07 Show the details when the menu bar item is clicked

T-07 · status: done · size: M · needs: T-06 · files: src/main/popover.ts, src/main/view-model.ts, src/main/main.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, test/main/view-model.test.ts, test/main/popover.test.ts

### Acceptance

- [x] `buildPopoverModel` exposes month download, month upload, percentage, live down and up rates, connected device count, carrier, signal bars and days until reset
- [x] Every numeric field arrives pre-formatted as a display string — the renderer performs no arithmetic
- [x] With no plan limit configured the model marks the progress bar unavailable and prompts the user to set a limit
- [x] An offline snapshot produces a model flagged stale, carrying the last successful reading and its age
- [x] Clicking the tray toggles the popover: open when closed, closed when open
- [x] The popover closes when it loses focus
- [x] The popover window is frameless, non-resizable and excluded from the app switcher

### Tasks

- [x] Failing tests for the view model across the live, no-limit and offline cases
- [x] `buildPopoverModel` mapping snapshot plus config to display strings, using the T-04 formatters
- [x] Popover window creation, tray-click toggle and blur-to-close
- [x] Renderer markup and styling for the layout, honouring macOS light and dark appearance

### Notes

`buildPopoverModel` is pure with no Electron import; QA confirmed by inspection that
`src/renderer/popover.ts` performs no arithmetic — it only places pre-formatted strings
into the DOM. A seam was left on the model for T-08's usage-state field, and no threshold
logic leaked in. `src/main/main.ts` and `test/main/popover.test.ts` were also touched and
are appended to `files:` above.

## T-08 Warn when usage approaches or passes the limit

T-08 · status: done · size: S · needs: T-04, T-06 · files: src/domain/quota.ts, src/main/tray.ts, src/main/view-model.ts, src/main/poller.ts, src/renderer/popover.ts, src/renderer/popover.css, test/domain/quota.test.ts, test/main/tray.test.ts, test/main/view-model.test.ts, test/main/poller.test.ts

### Acceptance

- [x] Usage state is `"ok"` below the warn threshold, `"warn"` at or above it, `"over"` at or above 100%
- [x] The warn threshold comes from config and defaults to 90
- [x] With no plan limit configured the state is `"unknown"`, never `"ok"`
- [x] The tray title for `"warn"` and `"over"` carries a marker absent from `"ok"`
- [x] The popover model exposes the state so the progress bar can be styled by it
- [x] Crossing into `"warn"` or `"over"` fires the state-change callback exactly once, not on every poll

### Tasks

- [x] Failing tests for each threshold boundary, including exactly-at-threshold and exactly-at-100%
- [x] `usageState` in `src/domain/quota.ts`
- [x] Thread the state through the tray title and the popover model
- [x] Edge-triggered state-change callback with the previous state retained between polls

### Notes

`TRAY_WARN_MARKER = '⚠'` REPLACES the `·` separator rather than being appended
(`18G ⚠ 90%`), so warn/over titles are exactly as wide as ok ones and T-06's 12-character
cap holds by construction. `usageState(percent, warnThresholdPercent)` is pure and
compares against the exact unrounded percentage. The poller gained a `state` getter and an
`onState` callback using the same edge-trigger shape as `onTitle`; offline polls leave the
state untouched. Two pre-existing tray assertions at/over 100% were updated for the
marker, intent preserved. A user-level formatter hook reformatted the touched files to
double quotes, so those diffs carry unrelated quote churn — lint and build are clean, but
the repo's quote style is now mixed. `files:` above reflects everything actually touched.

## T-09 Launch the app on login without a Dock icon

T-09 · status: done · size: S · needs: T-06 · files: package.json, package-lock.json, src/main/login-item.ts, test/main/login-item.test.ts

### Acceptance

- [x] `setLaunchAtLogin(true)` calls Electron's login-item API with `openAtLogin: true`, and `false` clears it
- [x] The current setting is readable, so the popover can show it as a checked state
- [x] `npm run package` exits 0 and produces a launchable `.app` under `out/`
- [x] The packaged app shows a menu bar item and no Dock icon when launched

### Tasks

- [x] Failing tests for the login-item wrapper against a mocked Electron `app`
- [ ] Login-item wrapper and a toggle in the popover
- [x] Packaging config and a `package` script
- [x] Manual check: launch the packaged app, confirm menu bar item and absent Dock icon

### Notes

OUTSTANDING: the "toggle in the popover" half of task 2 was deliberately not built. T-09
ran in parallel with T-07, which owned `src/main/popover.ts`, `src/main/view-model.ts` and
`src/renderer/`; letting T-09 touch them would have conflicted on merge. Only the wrapper
was delivered — `setLaunchAtLogin(enabled)` and `getLaunchAtLogin()` in
`src/main/login-item.ts`, thin wrappers over Electron's login-item API, 6 tests against a
mocked `electron` module. Every acceptance criterion is met (the setting is readable, which
is what the criterion asks), but the popover UI control that would expose it to the user
does not exist yet. Wire it up in a follow-up task.

Packaging uses `@electron-forge/cli` with the forge config under `config.forge` in
package.json; `npm run package` produces `out/ck-connect-check-darwin-x64/`
`ck-connect-check.app`, whose `Info.plist` carries `LSUIElement: true` — the bundle-level
no-Dock-icon guarantee complementing the runtime `app.dock.hide()` from T-06. `out/` is
gitignored.

The packaging and Dock-icon criteria are verified by launching the built app by hand —
the test suite covers the login-item wrapper only. Record the result here when done.

## T-10 Keep the open panel refreshing instead of freezing until it is reopened

T-10 · status: done · size: S · needs: T-07 · files: src/main/popover.ts, test/main/popover.test.ts

The panel currently looks like it only updates when it is opened and closed. `setModel`
does push on every poll, but the popover's `BrowserWindow` is created with Chromium's
default `backgroundThrottling`, so a hidden renderer defers the injected script and the
queued updates only run when the window is shown again. The window is also hidden rather
than destroyed, so this state persists for the whole session after the first open.

### Acceptance

- [x] The popover window is created with `backgroundThrottling: false` in its `webPreferences`
- [x] `setModel` called while the window exists but is hidden still reaches `webContents.executeJavaScript` — it is not deferred to the next `show`
- [x] `setModel` called before the window has ever been created stores the model and pushes it on `did-finish-load`, with no error
- [x] Two `setModel` calls in a row push twice; the second is not swallowed
- [x] The pushed payload is the newest model, never a stale one

### Tasks

- [x] Failing tests with a fake `BrowserWindow` asserting a push happens while `isVisible()` is false
- [x] Failing test asserting `backgroundThrottling: false` is passed at construction
- [x] Set `backgroundThrottling: false` and confirm `push()` runs off `alive()`, not off visibility
- [x] Manual check: open the panel, leave it open, watch a value change without touching it

### Notes

The cause was confirmed by elimination: four of the five new tests PASSED before any
implementation change, which proves the main-process push path was already correct —
`setModel` pushes regardless of visibility, nothing is queued or coalesced, and the newest
model always wins. Only the missing `backgroundThrottling: false` was genuinely RED. So the
freeze came entirely from Chromium throttling the hidden renderer and deferring the injected
`executeJavaScript` until the next `show`; because the window is hidden rather than
destroyed, that persisted for the whole session after the first open. The fix is one
`webPreferences` line. The other four tests are regression guards, not proof of a fix — a
hidden-renderer deferral cannot be reproduced against a fake Electron, so the constructor
assertion is the strongest unit-level evidence available and the manual run is the real
proof. `src/renderer/popover.ts` was ruled out as an alternative cause: it uses no timers
and no `requestAnimationFrame`.

## T-11 Refresh quickly while the panel is open and slowly while it is shut

T-11 · status: done · size: S · needs: T-10 · files: src/main/poller.ts, src/main/main.ts, src/config/defaults.ts, src/config/config.ts, test/main/poller.test.ts, test/main/main.test.ts, test/main/tray.test.ts, test/config/config.test.ts

A 30-second interval is right for a menu bar title and far too slow for a live rate. The
poller gains a second, shorter interval used while the popover is visible; opening the
panel switches to it and takes a reading immediately rather than waiting out the pending
timer.

### Acceptance

- [x] `AppConfig` carries `activePollIntervalSeconds`, defaulting to 2, alongside the existing `pollIntervalSeconds`
- [x] An out-of-range or non-numeric `activePollIntervalSeconds` in the config file falls back to the default, exactly like the existing fields
- [x] `poller.setActive(true)` schedules subsequent polls at the active interval; `setActive(false)` returns to `pollIntervalSeconds`
- [x] `setActive(true)` cancels the pending timer and polls immediately instead of waiting for it to elapse
- [x] `setActive(true)` called twice in a row triggers one extra immediate poll, not two
- [x] Two polls never overlap: the next is still scheduled only after the previous settles
- [x] Showing the popover puts the poller in active mode and hiding it leaves active mode

### Tasks

- [x] Failing tests on fake timers for interval switching, the immediate poll, and no overlap
- [x] Failing test for the new config field and its fallback
- [x] Add `activePollIntervalSeconds` to defaults and config validation
- [x] Add `setActive` to `UsagePoller` with the pending timer cancelled and rescheduled
- [x] Wire `show` / `hide` in `main.ts` to `setActive`

### Notes

The no-overlap guarantee holds because `#timer` is cleared _before_ `#tick()` runs, so it is
`null` for the whole duration of an in-flight request — and `setActive` early-returns on
exactly that condition. It therefore only ever replaces a _pending_ timer, never a request in
flight; the flag changes and the next schedule picks up the new interval once the current poll
settles. `stop()` racing an in-flight poll returns early too.

Caught beyond the criteria, with its own RED test: the real popover hides itself on `blur`
without going through the show/hide adapter, so after the first click-away the app would have
kept polling every 2s indefinitely. `main.ts` now re-syncs `poller.setActive(popover.isOpen())`
at the top of each poll, standing the fast cadence down within one active interval. That
re-sync runs inside the snapshot wrapper after the previous poll returned, so it cannot stack
requests either.

Validation also rejects an active interval _slower_ than the idle one — the upper half of "out
of range" — which makes `parseConfig` read the idle interval first.

Two things worth remembering. `test/config/defaults.test.ts` does not exist in this repo;
defaults and their validation are tested in `test/config/config.test.ts`, so the new config
tests went there. And **`npm run build` only typechecks `src/`, so type errors in `test/` are
invisible to all three project commands** — adding the required `activePollIntervalSeconds`
field broke an `AppConfig` literal in `test/main/tray.test.ts` that nothing would have caught.
`npx tsc -p tsconfig.json --noEmit` is the only command that sees it. That gap deserves a task.

## T-12 Remember the last few minutes of throughput

T-12 · status: done · size: S · needs: T-03 · files: src/domain/history.ts, src/main/main.ts, src/main/view-model.ts, test/domain/history.test.ts, test/main/view-model.test.ts, test/main/main.test.ts

A sparkline needs a series, and the router only reports an instant. A fixed-size ring
buffer in the main process holds the recent download and upload rates. It is pure, lives
in `src/domain/`, and is never written to disk — the "no history database" decision still
stands for anything longer than the panel's own window.

### Acceptance

- [x] `createRateHistory(capacity)` keeps at most `capacity` samples and drops the oldest first
- [x] Samples are returned oldest-first, so a chart can read them left to right
- [x] Each sample holds `downloadBytesPerSecond`, `uploadBytesPerSecond` and the time it was taken
- [x] An offline poll records no sample — a gap is not a zero
- [x] `peak(samples)` returns the largest rate across both series, and 0 for an empty history
- [x] The popover model exposes the samples and the peak, so the renderer scales without re-deriving them
- [x] The history survives the popover being closed and reopened

### Tasks

- [x] Failing tests for capacity, eviction order, offline gaps, and `peak` on an empty history
- [x] `src/domain/history.ts` — pure ring buffer, no I/O and no Electron
- [x] Record a sample on every online poll in `main.ts`
- [x] Extend `PopoverModel` with the series and its peak

### Notes

API for the tasks that build on this:

```
src/domain/history.ts
  DEFAULT_RATE_HISTORY_CAPACITY = 90            // ~3 min at T-11's 2s active interval
  RateReading { downloadBytesPerSecond, uploadBytesPerSecond }
  RateSample extends RateReading { at: Date }
  RateHistory { capacity; record(reading | null): void; samples(): RateSample[] }
  createRateHistory(capacity?, clock?): RateHistory
  peak(samples): number
src/main/view-model.ts
  PopoverHistory { download: number[]; upload: number[]; peak: number }   // oldest-first, bytes/s
  PopoverModel.history: PopoverHistory
  PopoverInput.history?: readonly RateSample[]                            // buildPopoverModel never records
```

`record(null)` on an offline poll is a no-op, so a gap stays a gap rather than a zero. The
ring lives in the `startMenuBarApp` closure, not in the panel, which is why closing and
reopening the popover does not lose it. `history` crosses to the renderer through
`popover.ts`'s existing `JSON.stringify(model)` as plain number arrays — no `Date` survives
the trip and `popover.ts` needed no change.

Two deviations, both reviewed and accepted by QA. A production seam
`MenuBarOptions.popover?: Popover` was added to `main.ts` so the model reaching the renderer
is observable without a real Electron window — judged idiomatic dependency injection, not
production code bent to a test. And the pre-existing "the renderer gets only display
strings" assertion now excludes `history`, narrowly and with a comment, because a chart is
geometry rather than text; every other field is still string-checked. A prettier hook
reformatted `src/main/main.ts` and `test/main/main.test.ts` to double quotes, so those
commits carry unrelated quote churn.

## T-13 Show the month's usage as a dial instead of a bar

T-13 · status: done · size: M · needs: T-10 · files: src/renderer/popover.ts, src/renderer/index.html, src/renderer/popover.css, src/main/view-model.ts, test/renderer/popover.test.ts, test/main/view-model.test.ts, package.json, package-lock.json

The flat progress bar becomes a circular arc with the percentage at its centre and the
absolute figures beside it. Drawn as inline SVG built from numbers already in the model —
the page's `default-src 'none'` CSP rules out loading any chart library.

### Acceptance

- [x] The arc's stroke-dash length is proportional to the percentage used: 0% draws nothing, 100% draws the full sweep
- [x] Above 100% the arc is drawn full and not wrapped around a second time
- [x] With no plan limit configured the dial renders in an "unset" style with no percentage, and the prompt to set a limit still shows
- [x] The dial's colour follows the usage state — `ok`, `warn`, `over` and `unset` are visually distinct
- [x] The dial carries an accessible label stating the percentage and the absolute usage
- [x] Applying a model twice updates the existing SVG rather than appending a second one
- [x] The panel still fits `POPOVER_HEIGHT` with no scrollbar — confirmed by eye, see the caveat below

### Tasks

- [x] Failing renderer tests for the sweep at 0%, 50%, 100% and 120%, and for the unset state
- [x] Replace the bar markup with an SVG dial in `index.html`
- [x] Render the arc in `popover.ts` from the model's percentage and state
- [x] Style the four states in `popover.css`
- [x] Delete the bar styles left unused

### Notes

Model change T-14 builds on: `PopoverProgress.fillWidth` is gone. In its place `sweep`
(number, 0..1, clamped in the model so an overrun can only ever draw a full ring while `label`
still reads the true `"117%"`) and `description` (the dial's accessible label). `sweep` is
numeric in the same spirit as T-12's `history` — geometry, not text.

The dial is one `<circle class="dial-track">` plus one `<circle data-arc>` in a 100×100
viewBox, r=42, rotated −90° so it starts at twelve o'clock. Built once, thereafter only
`stroke-dasharray` and `aria-label` are rewritten. `stroke-linecap: butt` so a zero sweep
draws genuinely nothing rather than a round-cap dot. One `--dial` custom property is swapped
per state.

This task set up **the project's first renderer test suite**: `test/renderer/popover.test.ts`
with a `// @vitest-environment jsdom` docblock and `jsdom` as a devDependency. `vitest.config.ts`
is untouched, so the rest of the run stays on `node`. Gotcha for anything extending it: under
jsdom the global `URL` is jsdom's own and `fileURLToPath` rejects it, so the suite resolves
`src/renderer/` via `node:path` from `fileURLToPath(import.meta.url)` — reuse that helper
rather than `new URL(..., import.meta.url)`.

Three limits on what the tests actually prove, all reviewed by QA and judged acceptable:
one sweep test was adjusted after RED to compare against the gap the renderer writes rather
than `2πr` at full precision (it failed by 5e-4), with a separate test asserting that gap
really is the circumference — the pair still pins the behaviour. "Four states visually
distinct" is asserted against the stylesheet's `--dial` declarations, because jsdom has no
cascade for SVG paint. And **the height criterion is a documented budget, not a measurement**
— jsdom has no layout engine, so `--dial-size` (104px) + 240px of unchanged chrome ≤ 380px is
arithmetic, not a rendered result. Hand-checked at roughly 335px tall.

## T-14 Show download and upload rates as live sparklines

T-14 · status: done · size: M · needs: T-12, T-13 · files: src/renderer/popover.ts, src/renderer/index.html, src/renderer/popover.css, test/renderer/popover.test.ts

Two stacked sparklines replace the "Down now" and "Up now" text figures: the shape shows
what a single number cannot, and the current value stays as a label beneath. Both share one
vertical scale so the two series are comparable at a glance.

### Acceptance

- [x] Each sparkline renders one SVG polyline with one point per sample in the model
- [x] Download and upload share a single vertical scale derived from the model's peak
- [x] An all-zero history renders a flat line at the baseline, not a divide-by-zero or an empty element
- [x] Fewer than two samples renders the empty state, not a broken path
- [x] The current rate is shown as text beside each sparkline, formatted by the existing rate formatter
- [x] Applying a model twice replaces the points rather than accumulating them
- [x] Offline renders the sparklines in a stale style, keeping the last known shape rather than blanking it

### Tasks

- [x] Failing renderer tests for point count, shared scale, all-zero, single-sample and repeated apply
- [x] Add the two sparkline elements to `index.html` and drop the two rate `<dd>` stats
- [x] Build the polyline points in `popover.ts` from samples and peak
- [x] Style both series and the stale state in `popover.css`

### Notes

`SPARK_MINIMUM_SAMPLES = 2`; below that the host carries `data-empty="true"`, `points` is
cleared, and CSS hides the line so the baseline axis shows rather than a stub path. The
divide-by-zero guard is `peak > 0 ? value / peak : 0`, so an all-zero history flattens onto
the baseline instead of throwing. Offline needs no special data handling — offline polls
record no sample, so the history is simply unchanged and the same shape redraws in a muted
stale style.

Two decisions beyond the criteria, both easy to revert. **Upload got its own colour**
(`--up`, green `#30d158` light / `#32d74b` dark) rather than sharing `--accent` with download,
because two identically-coloured lines were hard to tell apart; change `[data-spark="upload"]
.spark-line` to `var(--accent)` to undo. And `.stats` spacing was tightened (margin-top 16→12,
padding-top 14→10) to buy 8px for the new rates block, which also made the two ruled sections
under the dial share one gap.

T-13's panel-fit test was updated, not loosened: its `CHROME_HEIGHT` of 240 described a layout
with a 3-row stats grid and no rates section, so it had become factually wrong. It is now 220
against real chrome of ~209, and the assertion additionally budgets `--spark-height` × 2 plus
the row gap — 104 + 44 + 6 + 220 = 374 ≤ 380. QA checked that arithmetic independently. Full
content measures ~363px, leaving ~17px of slack.

**Not machine-verified:** `preserveAspectRatio="none"` and `vector-effect="non-scaling-stroke"`
keep the 100×24 user-unit box stretching to the row width without the stroke thickening, and
jsdom can render neither. Line weight and the 22px row height rest on a human eye. The height
budget above is arithmetic, not a measurement.

The SVGs are `aria-hidden="true"`; the formatted rate text beside each line is what a screen
reader announces.

## T-15 Show sizes in French octets (Go) instead of English bytes (GB)

T-15 · status: done · size: S · needs: T-14 · files: src/domain/format.ts, src/main/tray.ts, src/main/view-model.ts, test/domain/format.test.ts, test/main/tray.test.ts, test/main/view-model.test.ts, test/main/poller.test.ts, test/main/main.test.ts, test/renderer/popover.test.ts, docs/ARCHITECTURE.md

The app is French-facing but every size reads in English units. This swaps the
display labels to octets across the whole scale — base unit included, so nothing
mixes `B` with `Go` — and widens the tray suffix to match. The decimal 1000³
scaling is not touched: only the strings change, so `4427475340` still scales to
`4.43`, it just reads `4.43 Go`.

The router's own `DataLimit` values (`0MB`, `50GB`) are wire format and keep
their English suffixes in `src/hilink/parse.ts`; that parser is out of scope.

### Acceptance

- [x] `formatBytes` returns `"4.43 Go"` for `4427475340` and `"1.02 Ko"` for `1024`
- [x] `formatBytes` returns `"512 o"` for `512` — the base unit is `o`, with no decimals
- [x] `formatRate` returns `"2.4 Ko/s"` for `2400` and `"0 o/s"` for `0`
- [x] `formatBytes` returns `"1.50 To"` for `1_500_000_000_000`
- [x] The unknown-value dash `"—"` is still returned for a non-finite byte count or rate
- [x] The tray title for `5_830_718_387` reads `"5.8Go"`, and for `52_000_000_000` reads `"52Go"`
- [x] The tray title stays at or under 12 characters at its worst case (`999Go ⚠ 999%`)
- [x] The popover's month total and rate labels read in octets, asserted through the existing renderer tests
- [x] No test or source file outside `src/hilink/parse.ts` asserts a `GB`, `MB`, `KB` or `kB` display string

### Tasks

- [x] Failing tests in `test/domain/format.test.ts` for the octet spelling of `formatBytes` and `formatRate`, covering the `o` base unit, the `To` ceiling and the non-finite dash
- [x] Failing tests in `test/main/tray.test.ts` for the `"5.8Go"` and `"52Go"` tray titles and the 12-character worst case
- [x] Replace `BYTE_UNITS` and `RATE_UNITS` in `src/domain/format.ts` with the octet scale, and update the `unit === 'B'` / `unit === 'B/s'` zero-decimal guards to the new base unit
- [x] Update the doc comments in `src/domain/format.ts` so the examples show octets
- [x] Update `UNIT_LETTERS` in `src/main/tray.ts` to the octet suffixes, and confirm `compactBytes` still keys off the new unit strings
- [x] Update the expected strings in `test/renderer/popover.test.ts` and the wording in `test/config/config.test.ts`
- [x] Confirm the `files:` line above reflects everything actually touched

## T-16 Read the carrier's USSD replies as data instead of text

T-16 · status: done · size: S · needs: T-02 · files: src/hilink/ussd-parse.ts, src/hilink/types.ts, src/hilink/parse.ts, test/hilink/ussd-parse.test.ts, test/fixtures/hilink/ussd-\*.xml

The carrier answers `#359#` in prose. This turns each reply into a typed object at the
`src/hilink/` boundary, exactly as the XML parsers already do: the `<content>` is
extracted from the envelope, then the text is read for the two things worth having — a
menu with numbered options, and the final allowance line.

Both live in one reply shape, because a USSD reply can carry text _and_ a menu at once:
the `#359#` answer states the credit and offers `1 Mes offres` in the same breath.

Purely textual, no I/O — a fixture per captured step is the whole test surface. Accents
are absent from the device's replies (`utilisable a toute heure`, `jusqu au`), so matching
must not depend on them.

### Acceptance

- [x] `parseUssdContent` returns `{ text, options }` from a `<response><content>…</content></response>` envelope
- [x] The `#359#` reply parses to one option `{ digit: "1", label: "Mes offres" }`
- [x] The third reply parses to options `1 Info conso` and `00 Page precedente`, keeping `00` as a string and preserving order
- [x] A reply with no numbered lines parses to an empty `options` array, not a null
- [x] `parseAllowance` reads `il vous reste 145835.9 Mo` as `145_835_900_000` bytes on the decimal 1000³ scale
- [x] `parseAllowance` reads `jusqu au 25/08/2026 inclus` as a date whose day, month and year are 25, 8 and 2026
- [x] `parseAllowance` reads the offer name `NET MONTH 200 000` as the plan label
- [x] `parseAllowance` accepts `Go`, `Mo` and `Ko` units, and a comma decimal separator (`145835,9 Mo`)
- [x] `parseAllowance` returns null for the credit line and for any reply without a `il vous reste` clause, rather than throwing
- [x] `parseUssdError` maps `111019` to a "not ready" result distinct from any other error code
- [x] A malformed or empty envelope raises the same parse error the existing XML parsers raise

### Tasks

- [x] Capture the four `#359#` replies as fixtures under `test/fixtures/hilink/`, one file per step, in the router's own envelope format
- [x] Failing tests in `test/hilink/ussd-parse.test.ts` for every criterion above, driven off those fixtures
- [x] Add `UssdReply`, `UssdOption` and `Allowance` to `src/hilink/types.ts`
- [x] Implement `parseUssdContent`, `parseAllowance` and `parseUssdError` in `src/hilink/ussd-parse.ts`, reusing the envelope helpers already in `src/hilink/parse.ts`
- [x] Confirm the volume conversion routes through the existing decimal scale rather than a second private constant

## T-17 Sign in to the router so its protected endpoints can be used

T-17 · status: done · size: M · needs: T-03 · files: src/hilink/login.ts, src/hilink/session.ts, src/hilink/client.ts, src/hilink/types.ts, test/hilink/login.test.ts, test/hilink/client.test.ts

Every `POST` on this device answers `100003` — no rights — until a login has happened. The
monitoring snapshot does not need one, so this adds an authenticated mode alongside the
existing anonymous session rather than replacing it: `snapshot()` keeps working with no
credential present.

The scheme is the `password_type: 4` SHA-256 one recorded in `docs/ARCHITECTURE.md`. Two
details are easy to get wrong and are pinned by tests: the token folded into the hash is
the handshake `TokInfo`, while every request _after_ login must use the rolling token from
the login reply's `__RequestVerificationTokenone` header, not the handshake one.

A wrong password must fail once and stop. The router locks the account after five
consecutive failures, so there is no retry, no back-off loop, and no second attempt on the
same credential.

### Acceptance

- [x] `scramblePassword(user, password, token)` produces `base64(sha256hex(user + base64(sha256hex(password)) + token))`, asserted against a hand-computed vector
- [x] `login` posts to `/api/user/login` with `password_type` 4 and the scrambled value in the `<Password>` element
- [x] A successful login returns the `SessionID` from `Set-Cookie` and the token from the `__RequestVerificationTokenone` response header
- [x] Requests issued after a successful login carry the rolling token, not the handshake `TokInfo`
- [x] A `108006` reply resolves to a failed result naming a wrong credential, and never throws
- [x] A `108007` reply resolves to a failed result naming a locked account, distinct from a wrong credential
- [x] `login` is called at most once per attempt — a failed login triggers no second request, asserted by counting fetch calls
- [x] `snapshot()` still succeeds with no credential configured, proving the anonymous path is untouched
- [x] A login attempt that times out or cannot reach the host returns the existing offline reasons rather than a login failure
- [x] `logout` posts to `/api/user/logout` and clears the stored authenticated session

### Tasks

- [x] Failing tests in `test/hilink/login.test.ts` for the scramble vector, the rolling-token rule, and each of the `108006` / `108007` / offline outcomes
- [x] Failing test asserting exactly one fetch to `/api/user/login` when the credential is rejected
- [x] Add `RouterCredential` and `LoginResult` to `src/hilink/types.ts`
- [x] Implement `scramblePassword` and `login` in `src/hilink/login.ts` using `node:crypto`
- [x] Extend `SessionStore` in `src/hilink/session.ts` to hold an authenticated session with its rolling token, separate from the anonymous one
- [x] Add a `#post` helper to `RouterClient` mirroring `#get` — same timeout, same error classes, same offline mapping
- [x] Confirm `test/hilink/client.test.ts` still passes untouched, or note in `### Notes` why a change was unavoidable

## T-18 Ask the carrier for the exact remaining allowance over USSD

T-18 · status: done · size: M · needs: T-16, T-17 · files: src/hilink/ussd.ts, src/hilink/client.ts, test/hilink/ussd.test.ts

This drives the four-step dialogue and returns one `Allowance`, or a reason it could not.
The mechanics are send-then-poll: `POST /api/ussd/send`, then `GET /api/ussd/get` until it
answers `<content>` instead of `111019`.

Navigation matches on labels — the option whose text contains `Mes offres`, then the offer,
then `Info conso` — and falls back to the recorded `1,1,1` digits only when no label
matches. That keeps a reordered carrier menu from silently landing on the wrong screen.

Two rules make this safe to run against a real SIM: `/api/ussd/release` is issued on every
exit path including failure, and a dialogue already in flight is never started twice.
Every wait is bounded, so a carrier that stops answering ends the attempt instead of
hanging it.

Timing is injected, not slept — the tests use a fake clock and must not take real seconds.

### Acceptance

- [x] A run against the four recorded fixtures returns an `Allowance` of `145_835_900_000` bytes expiring 25/08/2026, labelled `NET MONTH 200 000`
- [x] The four sends carry `#359#`, then `1`, `1`, `1` in that order, asserted from the recorded request bodies
- [x] A menu whose `Info conso` entry is numbered `2` is navigated with `2`, proving label matching beats position
- [x] A menu with no matching label falls back to the recorded digit for that step
- [x] `111019` from `/api/ussd/get` is retried until content arrives, and the poll interval comes from the injected clock rather than a real delay
- [x] A `get` that never yields content within the bounded window ends the attempt with a timeout reason
- [x] `/api/ussd/release` is requested exactly once on the success path
- [x] `/api/ussd/release` is requested on the failure path too — asserted for a mid-dialogue error, a timeout, and an unparseable reply
- [x] A non-zero `/api/ussd/status` before starting returns a "busy" reason without sending anything
- [x] A second concurrent call while one dialogue is in flight returns the "busy" reason rather than interleaving requests
- [x] A `100003` anywhere in the dialogue returns a reason naming the missing login, distinct from every other failure
- [x] The whole flow resolves to a result object and never throws, matching how `snapshot()` behaves

### Tasks

- [x] Failing tests in `test/hilink/ussd.test.ts` for the happy path over the fixtures, using a stub fetch and a fake clock
- [x] Failing tests for the reordered-menu, no-label-fallback, busy, concurrent, timeout, `100003` and release-on-failure cases
- [x] Define the menu script as data — a list of steps, each with a label pattern and a fallback digit
- [x] Implement `readAllowance` in `src/hilink/ussd.ts` against the `#post` and `#get` helpers from T-17
- [x] Wrap the release in a `finally` so no exit path can skip it, and guard re-entry with an in-flight flag
- [x] Expose the entry point on `RouterClient` so the main process never talks to endpoints directly
- [x] Verify by hand against the real router once, and record the observed reply in `### Notes`

## T-19 Keep the router password in the macOS Keychain

T-19 · status: done · size: S · needs: T-17 · files: src/main/credentials.ts, src/config/config.ts, src/config/defaults.ts, test/main/credentials.test.ts, test/config/config.test.ts

The password is the first secret this app has ever held, and `config.json` is plaintext in
the user's home directory — so it goes to the Keychain through Electron `safeStorage`
instead. The config file stores only the encrypted blob and the username; the cleartext
password is never written to disk and never logged.

`safeStorage` is unavailable before Electron's `ready` event and can be unavailable
entirely, so an absent Keychain has to be a normal state: the app runs, and Sync reports
that it needs a password rather than crashing.

Electron is stubbed in the tests — `src/domain/` and the pure modules stay free of it, and
this module is the only new place allowed to import it.

### Acceptance

- [x] `saveCredential` writes an encrypted blob and the username to config, and the plaintext password appears nowhere in the written file
- [x] `loadCredential` round-trips a saved username and password through a stubbed `safeStorage`
- [x] `loadCredential` returns null when no credential has ever been saved
- [x] `clearCredential` removes the stored blob, after which `loadCredential` returns null
- [x] `saveCredential` reports a failure, and writes nothing, when `safeStorage.isEncryptionAvailable()` is false
- [x] A stored blob that fails to decrypt returns null and does not throw, so a Keychain reset degrades to "no password"
- [x] `parseConfig` accepts a config with no credential fields, keeping every existing config file valid
- [x] `parseConfig` rejects a credential blob that is not a string, with the existing `ConfigValidationError`
- [x] No test or source file outside `src/main/credentials.ts` imports `safeStorage`

### Tasks

- [x] Failing tests in `test/main/credentials.test.ts` for the round trip, the absent case, the clear, the unavailable-encryption case and the corrupt-blob case, against a stubbed `safeStorage`
- [x] Failing tests in `test/config/config.test.ts` for the optional credential fields and the non-string rejection
- [x] Add the optional `routerUsername` and `routerPasswordBlob` fields to `AppConfig` and its validator
- [x] Implement `saveCredential`, `loadCredential` and `clearCredential` in `src/main/credentials.ts`
- [x] Confirm nothing logs the decrypted value — grep the module for the password variable reaching a log call

## T-20 Carry the real allowance forward with the router's own counter

T-20 · status: done · size: M · needs: T-18, T-05 · files: src/domain/allowance.ts, src/config/config.ts, src/config/defaults.ts, src/main/view-model.ts, test/domain/allowance.test.ts, test/config/config.test.ts, test/main/view-model.test.ts

This is the heart of the feature: the arithmetic that turns one USSD reading into a figure
that stays right for days. A sync records an anchor — the remaining volume, the expiry, and
the router's month counter _at that instant_ — and afterwards only the counter's delta is
used:

```
remainingNow = anchor.remainingBytes − (routerMonthBytes − anchor.routerMonthBytes)
```

Because only the delta matters, the anchor survives quits and restarts: the router keeps
counting while the app is closed. What it cannot survive is the counter resetting under it,
which is why `routerClearTime` is anchored too.

An untrustworthy anchor is reported as untrustworthy, never quietly repaired. It goes stale
when `MonthLastClearTime` changes, when the month counter has moved backwards, or when the
expiry date has passed. A negative computed remaining clamps to zero and is reported as
exhausted, not as a negative volume.

The dial's 100% is the highest `remainingBytes` ever anchored, held separately so it
outlives any single anchor.

Pure domain code — a clock is injected, and nothing here touches Electron or the network.

### Acceptance

- [x] With an anchor of 145 835 900 000 bytes at counter 1 000 000 000, a counter of 3 000 000 000 yields 143 835 900 000 bytes remaining
- [x] An unchanged counter yields exactly the anchored remaining, with no drift
- [x] A counter below the anchored one reports the anchor as stale with a reset reason, rather than a larger remaining
- [x] A `MonthLastClearTime` different from the anchored one reports stale with a reset reason, even when the counter has grown
- [x] An anchor whose `expiresAt` is before the injected now reports stale with an expiry reason
- [x] A delta exceeding the anchored remaining clamps to zero remaining and reports an exhausted state, never a negative
- [x] `planTotalBytes` is the maximum `remainingBytes` ever anchored, and does not fall when a later sync anchors a smaller remaining
- [x] Percentage used is computed from the anchor when one is trustworthy, and from the configured limit when none is
- [x] `daysUntilExpiry` counts whole days from the injected now to the anchored expiry, reporting 0 on the expiry day itself
- [x] A stale anchor still exposes its last computed remaining, so the panel can show a marked figure
- [x] An anchor round-trips through `saveConfig` and `loadConfig` unchanged, including the expiry date
- [x] `parseConfig` accepts a config with no anchor, keeping every existing config file valid
- [x] `parseConfig` rejects an anchor with a non-numeric byte count or an unparseable date

### Tasks

- [x] Failing tests in `test/domain/allowance.test.ts` for each arithmetic and staleness criterion, with an injected `Clock`
- [x] Failing tests in `test/config/config.test.ts` for the anchor round trip, the absent anchor and the two rejections
- [x] Define `AllowanceAnchor` and `AllowanceReading` in `src/domain/allowance.ts`
- [x] Implement `anchorFrom`, `readAllowanceNow` and `planTotalBytes` as pure functions over an injected clock
- [x] Add the anchor and the high-water plan total to `AppConfig`, its defaults and its validator, storing dates as ISO strings
- [x] Extend `buildPopoverModel` to prefer a trustworthy anchor over the configured limit, leaving its existing behaviour intact when no anchor exists
- [x] Confirm `src/domain/allowance.ts` imports neither Electron nor the network

## T-21 Sync the real figures from the panel with one button

T-21 · status: done · size: M · needs: T-19, T-20 · files: src/main/sync.ts, src/main/view-model.ts, src/main/popover.ts, src/main/main.ts, src/renderer/preload.cts, src/renderer/popover.ts, src/renderer/index.html, src/renderer/popover.css, test/main/sync.test.ts, test/main/view-model.test.ts, test/main/popover.test.ts, test/main/main.test.ts, test/renderer/popover.test.ts

The visible half: one Sync button that runs the whole dialogue, and a panel that shows the
exact remaining volume, the real expiry date and how fresh the reading is.

A sync takes tens of seconds, so the button has to say so — it reports progress through the
dialogue rather than freezing, and it cannot be pressed twice. The poll loop keeps running
throughout; USSD is only ever driven by this press, never by the timer.

When the anchor has gone stale the last computed figure stays on screen but is visibly
marked, with Sync called out — the number is never silently replaced by the old
config-limit estimate.

A missing password is a normal first-run state: Sync asks for it, and the entered value
goes straight to T-19's Keychain store.

The renderer still runs under `default-src 'none'`, so this is DOM built in TypeScript with
no new dependency, and every message crosses the existing IPC bridge.

### Acceptance

- [x] The panel renders a Sync button, and pressing it sends exactly one sync request over IPC
- [x] The button is disabled while a sync is in flight, and a second press sends nothing
- [x] While syncing, the panel shows a progress state naming the current step rather than a frozen panel
- [x] A successful sync renders the exact remaining volume in octets, the expiry as a date, and the days remaining
- [x] A successful sync renders how long ago it happened, refreshed by the existing poll push
- [x] A stale anchor renders the last computed figure together with a visible re-sync marker, and the Sync button carries an attention state
- [x] A stale anchor never renders the config-limit estimate in place of the anchored figure
- [x] A sync that fails renders the reason — busy, timeout, wrong password, locked account, no password, router offline — as distinct panel text, one case asserted per reason
- [x] With no password stored, pressing Sync renders a password prompt instead of starting a dialogue
- [x] Submitting the password prompt saves the credential and then starts the dialogue
- [x] The rate sparklines and the usage dial keep updating while a sync is in flight, proving the poll loop is not blocked
- [x] No sync is ever started by the poll timer — asserted by advancing the poll clock and counting USSD calls at zero
- [x] The Sync button is reachable by keyboard and carries an accessible name; the freshness marker is announced as text, not colour alone

### Tasks

- [x] Failing tests in `test/renderer/popover.test.ts` for the button, the disabled-while-syncing rule, the progress state, the success rendering, the stale marker and each failure reason
- [x] Failing test asserting the poll timer never triggers a USSD call
- [x] Failing tests in `test/main/popover.test.ts` for the sync IPC channel and the password-save channel
- [x] Extend `PopoverModel` with the allowance figures, the freshness state and the sync state, and cover them in `test/main/view-model.test.ts`
- [x] Add the sync and save-password IPC channels to the preload bridge and `src/main/popover.ts`
- [x] Wire the handler in `src/main/main.ts`: load the credential, run T-18's dialogue, anchor the result through T-20, persist, push the new model
- [x] Build the button, progress, stale marker and password prompt in `src/renderer/popover.ts`, styled in `popover.css` to match the existing panel
- [x] Verify by hand: press Sync against the real router, confirm the panel figure matches the USSD reply, then watch it decrease as data is used
- [x] Confirm the `files:` line above reflects everything actually touched

## T-22 Make the packaged app find its own panel

T-22 · status: done · size: S · needs: T-21 · files: package.json, src/main/popover.ts, src/renderer/index.html, test/project-setup.test.ts, test/main/popover.test.ts

`npm start` works, but `npm run package` does not: the panel's `index.html` and
`popover.css` are loaded from `src/renderer/` at runtime, while electron-forge's `ignore`
list drops `^/src$` from the bundle. A packaged build therefore starts and then fails to
find its own page.

Found during T-21's review; it predates that task and was deliberately left out of its
scope. The fix is to make the two assets part of the build output rather than something
read out of the source tree — either copied into `dist/renderer/` by the build step, or
kept in the bundle by narrowing the `ignore` list. The first is preferable: it keeps
`dist/` the single thing that ships.

### Acceptance

- [x] `npm run build` puts `index.html` and `popover.css` under `dist/renderer/`
- [x] `src/main/popover.ts` resolves the page from the build output, not from `src/`
- [x] A packaged build launches and renders the panel, with the dial, sparklines and Sync button all present
- [x] `npm start` still works unchanged
- [x] A test asserts the two assets exist in the build output, so this cannot regress silently

### Tasks

- [x] Failing test asserting `dist/renderer/index.html` and `dist/renderer/popover.css` exist after a build
- [x] Copy the two assets into `dist/renderer/` as part of `npm run build`
- [x] Point `src/main/popover.ts` at the built copy
- [x] Verify by hand: `npm run package`, launch the packaged app, confirm the panel renders and Sync still works

### Notes

The build copies with `cp` rather than a copy script — the app is macOS-only, so a
portable copy step would be machinery for a platform that never runs.

`index.html`'s script tag moved from `../../dist/renderer/popover.js` to
`./popover.js`. Once the page ships inside `dist/renderer/`, a walk up two levels
leaves the bundle entirely; the built page's own assertion in
`test/project-setup.test.ts` guards that.

The build-output test runs `npm run build` itself instead of inspecting whatever
`dist/` happens to be lying around — an assertion about build output that a stale
directory can satisfy proves nothing. It costs the suite about 3.5s.

## T-23 Say which error the router actually returned when a sync fails

T-23 · status: done · size: S · needs: T-21 · files: src/hilink/ussd.ts, src/hilink/client.ts, src/main/main.ts, src/main/view-model.ts, test/hilink/ussd.test.ts, test/main/view-model.test.ts, test/main/main.test.ts

Pressing Sync against the real router ends in "The router refused the request." — the
panel's wording for reason `error`. That reason has exactly one source: `ussd.ts:200`,
where a `HilinkApiError` whose code is neither `NO_RIGHTS_CODE` nor `125002` collapses
into the bare string `error`. The router's numeric code — the only thing that says _why_
it refused — is discarded there and appears in no log and no message.

The dialogue has never completed end to end against the real router, so the code is
unknown and cannot be guessed. Nothing can be fixed until one press names it. This task
carries the code through the boundary and stops there: handling whatever code it turns
out to be is a separate task, written once the code is known.

Two things must survive to the surface: the code itself, and the endpoint that returned
it, since `/api/ussd/send` and `/api/ussd/get` failing tell different stories. The
`error` reason therefore becomes a carrier rather than a bare string, and the panel
sentence names the code instead of hiding it.

### Acceptance

- [x] `UssdFailure`'s `error` case carries the router's numeric code and the endpoint that returned it, rather than being a bare string
- [x] A `HilinkApiError` raised from `/api/ussd/send` produces a failure whose code and endpoint match the ones the router returned
- [x] A `HilinkApiError` raised from `/api/ussd/get` does the same, with `/api/ussd/get` as the endpoint
- [x] Codes already mapped keep their own reasons: `NO_RIGHTS_CODE` still yields `not-logged-in` and `125002` still yields `session`
- [x] The panel's failure line for an unmapped code names the code, e.g. "The router refused the request (code 111019)."
- [x] Every other `SyncFailure` keeps the sentence it has today, asserted by the existing view-model tests
- [x] The code and endpoint are written to the main-process log on every such failure, so the value is recoverable even if the panel is dismissed

### Tasks

- [x] Failing tests: a stubbed transport raising `HilinkApiError('/api/ussd/send', 111019)` yields a failure carrying code 111019 and that endpoint; the same for `/api/ussd/get`; the two already-mapped codes keep their reasons
- [x] Failing view-model test: the unmapped-code failure renders a sentence naming the code
- [x] Widen `UssdFailure`'s `error` case to carry `{ code, endpoint }` and update `failureReason` in `src/hilink/ussd.ts`
- [x] Follow the type through `src/hilink/client.ts` and `src/main/sync.ts` until it compiles
- [x] Render the code in `SYNC_FAILURE_TEXT`'s `error` entry in `src/main/view-model.ts`
- [x] Log code and endpoint from the main process when a sync ends in that reason
- [x] Verify by hand: press Sync against the real router and record the code and endpoint it names — that value is the input to the follow-up task
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

The `error` case became a `RouterRefusal` object — `{ kind, source, code, endpoint }` — rather
than a widened string. `source` distinguishes the router's own API code from a plain HTTP
status, because the two are different numbers with the same shape and reading "code 404"
as a carrier code would send the follow-up task hunting for something that does not exist.
That distinction was not free: the HTTP path turned out to be a real producer of this
failure, not a hypothetical one — the pre-existing test at `test/hilink/ussd.test.ts`
("resolves to a reason when the USSD endpoints answer nothing usable") was already
exercising it and asserting the bare `"error"`.

The bare string `"error"` still exists in `OfflineReason`, so it remains a legal
`SyncFailure` through the snapshot and login paths, which this task did not touch. In the
USSD path it is now unreachable: every failure there is either a named reason or a
refusal carrying a number.

`src/main/sync.ts` needed no change at all — `SyncFailure` is built on `UssdFailure`, so
widening the latter carried through on its own.

The manual gate passed: a real press named a code. **The observed code and endpoint are
not written down here yet** — recording that value is the first thing the follow-up task
needs.

## T-24 Give every POST a token the router has not already spent

T-24 · status: done · size: M · needs: T-23 · files: src/hilink/session.ts, src/hilink/client.ts, src/hilink/login.ts, src/hilink/parse.ts, test/hilink/session.test.ts, test/hilink/token.test.ts, test/hilink/parse.test.ts

T-23's manual gate produced the number it was written for. Pressing Sync against the real
router answers:

```
sync refused: api code 125003 at /api/ussd/send
```

`125003` is HiLink's _wrong session token_ — distinct from `125002` (wrong session), which
the client already handles by re-handshaking. The session is fine; the token is not.

The cause is visible without the router. `login()` reads one rolling token off the reply
headers and hands it to `SessionStore.authenticate()`; from then on `sessionHeaders()`
replays that same string on every request (`src/hilink/client.ts:216`,
`src/hilink/session.ts:18`). But the device's verification token is **single-use on a
`POST`** — it rotates on each reply. The login POST spends the handshake token and is
issued a fresh one; `/api/ussd/send`, the very next POST, presents the login's token a
second time and is refused. `#collect()`'s `GET`s never noticed because reads do not
consume the token.

So the token stops being a fixed property of the session and becomes a value that advances
with every reply. Two things carry it: each response's `__RequestVerificationToken` header
(the login's `…one` / `…two` pair being the same mechanism under a different name), and,
when a reply carries none, `GET /api/webserver/token`, whose `<token>` element the device
answers with the current one — its last 32 characters are the usable token.

A refused POST must also be recoverable: a single `125003` retry after refreshing the
token, and no more. Re-logging-in is explicitly not the recovery path — the account locks
after five consecutive login failures, and a spent token is not a credential problem.

### Acceptance

- [x] `SessionStore` exposes a way to advance the stored token, leaving the session cookie untouched
- [x] Every response that carries a `__RequestVerificationToken`, `…one` or `…two` header advances the stored token before the next request goes out
- [x] Two `POST`s issued back to back carry two different tokens when the first reply rotated it
- [x] A `POST` refused with `125003` refreshes the token from `GET /api/webserver/token` and is retried exactly once
- [x] A second `125003` on the retry surfaces as a failure and issues no third request
- [x] `125003` never triggers a login: a stubbed transport asserts `POST /api/user/login` is issued at most once across the whole dialogue
- [x] `parseToken` returns the last 32 characters of the `<token>` element, and rejects a reply with no `<token>`
- [x] `snapshot()`, `login()` and `logout()` keep their current behaviour, asserted by the existing client tests

### Tasks

- [x] Failing test: a stubbed transport whose first POST reply carries a rotated `__RequestVerificationToken` header — the second POST must carry the new value, not the login's
- [x] Failing test: a POST answered with `125003` refreshes from `/api/webserver/token` and retries once; a second `125003` fails without a third attempt; no login is issued in either case
- [x] Failing test: `parseToken` on a `<token>` element and on a reply without one
- [x] Add `parseToken` to `src/hilink/parse.ts` and a `TOKEN` endpoint constant to `src/hilink/client.ts`
- [x] Add token advancement to `SessionStore` and a shared header-reading helper next to `ROLLING_TOKEN_HEADER` in `src/hilink/login.ts`
- [x] Advance the token from every `#request` reply, and wrap `#post` so a `125003` refreshes and retries once
- [x] Verify by hand: press Sync against the real router and confirm the dialogue reaches `/api/ussd/get` instead of being refused at `send`
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

The refusal never reaches the transport as an exception: a `POST` reply is parsed by whoever
asked for it, so `#write` reads the body itself (`isSpentTokenReply`) to decide whether the
retry is owed. That is the only place in `src/hilink/client.ts` that looks inside a reply
it is about to hand back.

`TOKEN_HEADERS` lists the bare `__RequestVerificationToken` first and the login's `…one` /
`…two` pair after it, so an ordinary reply and a login reply advance the token through the
same path. The rotation applies to whichever session `current()` would hand out, which is
why a login can still be scrambled against the untouched handshake token afterwards.

`logout()` was moved onto `#write` too — it is a write like any other, and a spent token
there would otherwise leave the router-side session standing. `login()` deliberately was
not: a retry of a login POST is a second login attempt, and five of those lock the account.

## T-25 Measure the dial against the plan the user actually bought

T-25 · status: done · size: M · needs: T-21 · files: src/domain/allowance.ts, src/main/view-model.ts, src/main/main.ts, src/config/defaults.ts, src/config/config.ts, test/domain/allowance.test.ts, test/main/view-model.test.ts, test/config/config.test.ts, test/main/main.test.ts, test/main/popover.test.ts, test/renderer/popover.test.ts, docs/ARCHITECTURE.md

The panel currently shows two numbers that describe different things and calls them one
story: `10.17 Go used this month` is the router's month counter, while `143.82 Go left`
comes from the carrier. The dial sits between them at 0%, because `buildDial` measures
`planTotalBytes − remainingBytes` and `planTotalBytes` is the highest remaining ever
anchored — with a single anchor those are the same number, so the ring is pinned to zero by
construction until a second, larger sync happens.

The fix is to state the denominator instead of inferring it. `config.planLimitBytes` — the
cap the user bought, 150 Go — becomes the dial's 100%, and the consumed figure becomes
`cap − remainingNow`. The router's counter keeps its one honest job, the delta inside
`remainingNow`, and stops being a headline. Before the first sync there is no anchor and
therefore no dial: the prompt asks for a sync rather than drawing a share of a number the
carrier never confirmed.

The high-water `planTotalBytes` machinery — `planTotalBytes()` in `allowance.ts` and the
config field it persists in `main.ts` — is what produced the bug, so it goes with it.

### Acceptance

- [x] `readAllowanceNow` takes the configured cap and reports `usedBytes` as `cap − remainingBytes`, clamped at zero
- [x] `percentUsed` on the reading is measured against the configured cap, not against any anchored remaining
- [x] A reading with cap 150 Go and remaining 143.82 Go reports 6.18 Go used and 4% — the screenshot's case no longer reads 0%
- [x] A reading whose anchor is stale reports `percentUsed` as null, unchanged from today
- [x] `readAllowanceNow` with no cap configured reports `percentUsed` as null and still reports `remainingBytes`
- [x] `monthTotal` in the popover model is the anchored used figure, not `totalUsedBytes` of the router's counter
- [x] `monthDownload` and `monthUpload` still show the router's raw counters — they are the delta's evidence and stay visible
- [x] With an anchor present and no cap set, the dial is unavailable and the prompt reads as an instruction to set a limit
- [x] With no anchor at all, the dial is unavailable and the prompt asks for a sync rather than mentioning a limit
- [x] With a trustworthy anchor and a cap, the dial's `sweep` and `label` both derive from `cap − remainingNow`
- [x] `planTotalBytes()` is gone from `src/domain/allowance.ts`, and `AppConfig.planTotalBytes` is no longer written by `main.ts`
- [x] A config file still carrying a `planTotalBytes` key loads without error and ignores it

### Tasks

- [x] Failing test: `readAllowanceNow` with cap 150 Go and remaining 143.82 Go yields `usedBytes` 6.18 Go and `percentUsed` ~4; with no cap, `percentUsed` is null
- [x] Failing test: `buildPopoverModel` reports `monthTotal` as the anchored used figure while `monthDownload`/`monthUpload` stay the router's counters
- [x] Failing test: the three dial cases — no anchor, anchor without cap, anchor with cap — produce the sync prompt, the limit prompt, and a real percentage
- [x] Failing test: a config record containing `planTotalBytes` loads and the field is absent from the parsed config
- [x] Replace `AllowanceNowInput.planTotalBytes` with the configured cap, and add `usedBytes` to `AllowanceReading`
- [x] Delete `planTotalBytes()` and the high-water bookkeeping in `main.ts`; drop the config field and its reader
- [x] Rewrite `buildDial` to take the reading and the cap, and route `monthTotal` through the reading
- [x] Verify by hand: with the real anchor and a 150 Go cap, confirm the ring and the percentage agree with `cap − remaining`
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

Two cases the criteria did not settle, decided during the build:

- **A stale anchor with a cap set draws no dial** and prompts for a sync. It does
  not fall back to the router's month counter, which is the arithmetic this task
  exists to remove. The last honest remaining volume still shows in the allowance
  section, marked stale.
- **`monthTotal` reads as a dash** whenever either half is missing — no anchor, or
  no cap. Download and upload keep showing the router's own counters beside it, so
  the evidence behind the delta stays on screen.

The dial's share can no longer pass 100%: consumption is `cap − remaining` and the
carrier's remaining never goes below zero. The overrun tests — a 117% label, a
"over at 25 GB" state — were removed rather than adapted, because the state they
described is now unreachable. `usageState` still reports `"over"`, at exactly 100%.

`buildDial` takes the cap and the warn threshold rather than the whole `AppConfig`;
`emptyModel` has no config to hand it.

Four test files beyond the two planned needed rewriting, since they built models
through the router-counter path: `test/config/config.test.ts`,
`test/main/main.test.ts`, `test/main/popover.test.ts` and
`test/renderer/popover.test.ts`.

## T-26 Make the menu bar agree with the panel

T-26 · status: done · size: S · needs: T-25 · files: src/main/tray.ts, src/main/poller.ts, src/main/view-model.ts, src/domain/allowance.ts, test/main/tray.test.ts, test/main/poller.test.ts, test/main/main.test.ts

The tray title and the over-limit notification are computed in two more places that never
learned about the anchor: `tray.ts:91` and `poller.ts:177` both divide the router's month
counter by `config.planLimitBytes`. After T-25 the panel says one thing and the menu bar
says another, which is a worse failure than the original bug — a warning that fires against
the wrong numerator is a warning the user learns to ignore.

Both call sites take the same figure the panel uses. The percentage has exactly one
definition in this app, and it lives in `src/domain/`.

### Acceptance

- [x] The tray title's percentage is derived from the anchored reading whenever a trustworthy anchor and a cap are present
- [x] The tray falls back to its current dash — not to the router counter — when there is no anchor or no cap
- [x] The warn/over notification threshold is evaluated against the same figure as the tray title
- [x] Given one snapshot, config and anchor, the tray's percentage and the popover model's `progress.label` are asserted equal in a test
- [x] The tray title still stays under 12 characters, asserted by the existing test
- [x] `percentUsed(routerMonthBytes, planLimitBytes)` appears nowhere in `src/main/`

### Tasks

- [x] Failing test: tray title and `buildPopoverModel(...).progress.label` agree for a trustworthy anchor with a cap
- [x] Failing test: with no anchor, the tray shows its no-value title rather than a router-counter percentage
- [x] Failing test: the notification threshold fires on the anchored percentage, not the router counter's
- [x] Extract the shared "percentage to show" derivation so tray, poller and view-model call one function
- [x] Rework `tray.ts` and `poller.ts` onto it
- [x] Verify by hand: read the menu bar title and the panel percentage together and confirm they match
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

The criterion said the tray "falls back to its current dash" — there was no dash.
It showed the router's month total (`5.8Go`) with no percentage, which is the
figure this task removes. A dash was chosen, matching the panel, which now shows
one for the total in exactly the same cases.

The byte half of the title moved to the anchored consumption too, so `8Go · 40%`
has both halves describing the same month. Pairing the router's counter with the
plan's share would have rebuilt the original bug inside one string.

The shared derivation is `readPlanUsage()` in `src/domain/allowance.ts`; tray,
poller and view-model all call it and read `percentUsed` off the reading. A test
asserts none of the three imports the raw `percentUsed`/`totalUsedBytes` helpers,
since drifting back is exactly how the two figures diverged.

`MAX_DISPLAYED_PERCENT` (999) is gone — the share cannot pass 100% any more, so
the widest title is now `999Go ⚠ 100%`, still exactly 12 characters.

## T-27 Let the plan cap be typed into the panel

T-27 · status: done · size: M · needs: T-25 · files: src/renderer/index.html, src/renderer/popover.css, src/renderer/popover.ts, src/renderer/preload.cts, src/main/popover.ts, src/main/main.ts, src/main/view-model.ts, src/config/config.ts, test/main/view-model.test.ts, test/renderer/popover.test.ts, test/config/config.test.ts, test/main/main.test.ts

T-25 makes the dial depend on a cap that today can only be set by hand-editing
`config.json` — a setting nobody will find, which would leave the dial permanently showing
its prompt. The panel needs a small field beside the dial: type `150`, press enter, the
value is stored in Go and the ring appears.

The password prompt added in T-21 is the pattern to follow — an input the renderer shows on
demand, an IPC call into the main process, and a re-render from the model rather than the
renderer patching its own DOM. The renderer still does no arithmetic: it sends the number
typed and shows what comes back.

### Acceptance

- [x] The popover model carries the current cap as a display string and a flag for whether the editor should be open
- [x] With no cap set, the dial's prompt area offers the editor rather than a bare sentence
- [x] Submitting a value writes `planLimitBytes` to `config.json` as bytes, using the same decimal Go scale as the display
- [x] A submitted value of `150` stores 150 000 000 000 bytes
- [x] A blank, negative, zero or non-numeric entry is rejected without writing, and the panel says why
- [x] The dial re-renders from the next model push after a successful save, with no renderer-side arithmetic
- [x] An existing cap is pre-filled in the field when the editor is reopened
- [x] The saved cap survives a restart, asserted through `config.ts` round-tripping the value

### Tasks

- [x] Failing test: the view-model exposes the cap and the editor flag for the set and unset cases
- [x] Failing test: the renderer sends the typed value through the preload bridge and rejects blank, zero, negative and non-numeric input
- [x] Failing test: `config.ts` round-trips `planLimitBytes` written from a Go figure
- [x] Failing test: the value is converted at the boundary — `150` in, 150 000 000 000 bytes on disk
- [x] Add the cap field and its state to the popover model
- [x] Add the input, its styling and its submit handling to the renderer, following the password prompt's shape
- [x] Add the IPC channel through `preload.cts` and `main/popover.ts`, and the config write in `main.ts`
- [x] Verify by hand: set 150 in the panel, confirm the ring appears and `config.json` holds the bytes
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

Two decisions taken at the clarify gate:

- **The field is always on the panel**, not an editor that opens when the cap is
  unset. A plan that changes has to be correctable, and an editor with no visible
  way to reopen is one nobody reopens. So there is no open/closed flag: the model
  carries `needsValue`, true while no cap is stored, and the stylesheet picks the
  empty field out in the accent colour.
- **Every refusal is worded in the main process.** The renderer sends the typed
  characters verbatim — even `""` and `"abc"` — and shows the sentence that comes
  back. It costs an IPC round trip to display an error, and it keeps the rule that
  the renderer decides no strings and works nothing out.

`readPlanLimitEntry` and `planLimitInGigaoctets` live in `src/config/config.ts`
beside the existing `gigabytesToBytes`, which already owned the Go↔bytes boundary
and the constant. Zero is refused there even though `gigabytesToBytes` accepts it:
it is a storable value but not a plan anyone bought.

The field is filled from the model only when it does not have focus. A poll pushes
a fresh model every two seconds while the panel is open, and writing the stored
value over a half-typed one makes the field unusable — that case has its own test.

The panel's height budget went from 340 to 350. The field and its error line sit in
the column beside the dial rather than under it, so they cost nothing until that
column outgrows the dial's own 104px; the extra 10px covers that.

## T-28 Sync by itself when there is nothing trustworthy to show

T-28 · status: done · size: S · needs: T-21 · files: src/main/main.ts, src/domain/allowance.ts, test/main/main.test.ts, test/domain/allowance.test.ts

A first launch currently shows an empty allowance section until the user finds the Sync
button, and a launch after an expiry shows a figure marked stale until they press it again.
Both are cases where the app knows it has nothing worth showing and could ask the carrier
itself.

It must ask sparingly. A USSD dialogue costs tens of seconds and a login against a device
that locks the account after five refusals, so the trigger is narrow: no anchor, an expired
one, or one invalidated by a counter reset. A healthy anchor is carried forward with no
dialogue. A failed automatic sync is reported in the panel exactly like a failed press and
is never retried on a timer.

### Acceptance

- [x] An automatic sync is started at launch when no anchor is stored
- [x] An automatic sync is started at launch when the stored anchor is expired or reset-invalidated
- [x] No automatic sync is started when the stored anchor is trustworthy
- [x] No automatic sync is started when no router password is saved — the panel shows the existing needs-password state instead
- [x] A failed automatic sync leaves the panel in the same failed state a manual press would, and issues no second attempt
- [x] The automatic sync waits for a first successful snapshot, so the anchor has a counter to pin against
- [x] A manual press during an automatic sync is refused by the existing busy guard rather than starting a second dialogue

### Tasks

- [x] Failing test: the four trigger cases — no anchor, expired, counter-reset, healthy — start a dialogue in the first three only
- [x] Failing test: with no saved password, no dialogue is started and the state is `needs-password`
- [x] Failing test: a failed automatic sync issues exactly one dialogue and leaves a failed state
- [x] Failing test: no dialogue is started before the first successful snapshot
- [x] Add the trigger decision as a pure predicate over the config and the snapshot, next to the staleness logic it mirrors
- [x] Wire it into the startup path in `main.ts`, reusing the existing sync runner and its busy guard
- [x] Verify by hand: clear the anchor from `config.json`, launch, and confirm one dialogue runs and the panel fills in
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

The predicate is `needsAutomaticSync()` in `src/domain/allowance.ts`, beside the
staleness logic it reads. `src/main/sync.ts` did not need to change at all: with no
password stored, `sync.start()` already asks for one and dials nothing, which is
exactly what the criteria call for — so the automatic path reuses it unchanged,
busy guard included.

The decision is taken once, on the first reading that arrives, and the flag is set
whichever way it went. That is what makes a failed automatic sync final: there is
no later poll, timer or reconnection that can reach it a second time.

The existing test "never starts a dialogue from the poll timer" asserted the old
contract — zero dialogues, ever. It now asserts one at launch and none after, which
is the distinction that actually protects the account.

## T-29 Drop the reset countdown the carrier never agreed with

T-29 · status: done · size: S · needs: T-25 · files: src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, src/domain/quota.ts, test/main/view-model.test.ts, test/domain/quota.test.ts, test/renderer/popover.test.ts

"Resets in 27 days" is computed from the router's `StartDay`, which `docs/ARCHITECTURE.md`
already records as disagreeing with the device's own `MonthLastClearTime` and which the
carrier has never confirmed. Next to "Valid for 28 days" — the carrier's own expiry, from
the USSD reply — it is a second, worse answer to the same question, and the two differing
by a day invites the user to wonder which is lying.

It goes. `nextResetDate`/`daysUntilReset` lose their only caller and go with it; `startDay`
stays parsed at the router boundary, because removing a field from the wire format is a
different change from removing a tile from a panel.

### Acceptance

- [x] `PopoverModel` no longer has a `daysUntilReset` field
- [x] The "Resets in" term and value are gone from `index.html`, and the renderer no longer looks for that field
- [x] The remaining tile row still renders correctly with an odd number of tiles, asserted against the rendered DOM
- [x] "Valid for" is unchanged and still sourced from the allowance reading
- [x] `daysUntilReset` and `nextResetDate` are removed from `src/domain/quota.ts` along with their tests
- [x] `startDay` is still parsed by `src/hilink/parse.ts` and still present on the snapshot type
- [x] `npm run lint` reports no unused imports or dead exports after the removal

### Tasks

- [x] Failing test: the popover model's keys no longer include `daysUntilReset`
- [x] Failing test: the rendered panel contains no "Resets in" term and the tile row layout holds
- [x] Remove the field from the model, the markup and the renderer's field map
- [x] Remove `daysUntilReset` and `nextResetDate` from `quota.ts` and delete their tests
- [x] Adjust `popover.css` if the tile row needs it after losing a cell
- [x] Verify by hand: open the panel and confirm the layout reads correctly without the tile
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

`popover.css` needed no change. Five tiles in the two-column grid leave "Valid for"
alone on the last row's left cell, which matches the width of every tile above it;
stretching it across both columns would have made the odd one out look deliberate
in the wrong way. Confirmed by eye at the manual gate.

Removing the two exported functions also stranded three private helpers —
`daysInMonth`, `resetDayOf`, `resetAfter` — and the `MILLISECONDS_PER_DAY`
constant. All four went with them, and `quota.ts` no longer takes a `Clock` for
anything.

The view-model's "single day in the singular" test moved onto the allowance's
"Valid for" figure, which is now `formatDays`' only caller.

## T-30 Draw the signal as real bars instead of a coloured square

T-30 · status: done · size: S · needs: T-07 · files: src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, test/main/view-model.test.ts, test/renderer/popover.test.ts

The top bar's `.signal-icon` is a 9px square filled with the accent colour. It carries no
information at all — it is the same square at one bar as at five — so the strength is
readable only from the `5/5` text beside it, which is a figure where an icon was promised.

It becomes four ascending bars, filled to the router's level. The bars then say what the
text said, so the `5/5` string goes with it; T-31 puts the network type in the slot it
leaves. The renderer needs the level as numbers rather than the formatted `"5/5"` string,
so the view model carries `signalBars` and `maxSignalBars` and drops `signal`. The bars
are markup, not SVG — four spans whose fill is a `data-` attribute — because a fixed shape
that never changes geometry has nothing to gain from being redrawn.

Stale and offline states keep the behaviour the square had: dimmed to `--muted` when the
figures are stale, and empty bars when there is no reading at all.

### Acceptance

- [x] `PopoverModel` exposes `signalBars` and `maxSignalBars` as numbers and no longer has `signal`
- [x] With no snapshot, both are `0` and the rendered bars are all unfilled
- [x] The header renders exactly four bars, and the number filled matches `round(signalBars / maxSignalBars * 4)`, asserted at 0, 1, 3 and 5 of 5
- [x] The `5/5` text is gone from `index.html` and from the renderer's field map
- [x] The bar group carries an accessible label stating the level (e.g. `Signal 5 of 5`)
- [x] `:root[data-stale="true"]` dims the filled bars, asserted against the stylesheet's selector
- [x] `maxSignalBars` of `0` from the router renders as unfilled rather than dividing by zero

### Tasks

- [x] Failing test: the popover model carries numeric `signalBars`/`maxSignalBars` and no `signal`
- [x] Failing test: the rendered header contains four bars with the expected filled count at each level
- [x] Failing test: a zero `maxSignalBars` renders unfilled and throws nothing
- [x] Replace `signal` with the two numbers in `src/main/view-model.ts`
- [x] Replace the icon span with a four-bar group in `index.html` and fill it from the model in `popover.ts`
- [x] Style the bars in `popover.css` — ascending heights, filled vs empty, stale dimming
- [x] Verify by hand against the live router: the bars match the level the router reports

### Notes

The aria-label is built in the view model, not the renderer — a third field
`signalDescription` beside the two numbers, so the no-formatting rule in
`docs/ARCHITECTURE.md` still holds. It reads `No signal reading yet` when the
scale is zero, which is a router that has not answered rather than a connection
at its worst.

`data-filled` on each bar tripped an older assertion guarding T-13's removed
flat bar, which matched the bare substring `data-fill`. That assertion now
matches `data-fill=` — the attribute it was actually written to catch.

## T-31 Say which network the router is actually on

T-31 · status: done · size: S · needs: T-30 · files: src/hilink/parse.ts, src/hilink/types.ts, src/domain/network-type.ts, src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, test/hilink/parse.test.ts, test/domain/network-type.test.ts, test/main/view-model.test.ts, test/renderer/popover.test.ts, test/main/main.test.ts, test/main/poller.test.ts, test/main/popover.test.ts, test/main/tray.test.ts

T-30 leaves the slot beside the bars empty. `/api/monitoring/status` already answers
`CurrentNetworkTypeEx` — a numeric code, `101` for LTE on this device — and it is the one
fact the top bar is missing: bars at 5/5 on a 2G fallback are not the same connection as
bars at 5/5 on LTE.

The code is parsed at the router boundary like every other numeric field, and mapped to a
short label (`4G`, `3G`, `2G`) in `src/domain/` — the mapping is a table of carrier-agnostic
constants and belongs with the pure code, not in the client. An unknown code is rendered as
the bare code rather than guessed at or hidden, for the same reason an unrecognised error
code is carried to the surface with its number.

### Acceptance

- [x] `RouterStatus` carries `networkTypeCode` as a number, parsed from `CurrentNetworkTypeEx`
- [x] A status reply missing the field fails at the boundary like every other required field
- [x] `src/domain/network-type.ts` maps codes to labels, asserted for LTE (`101`), a 3G code, a 2G code and `0`
- [x] An unmapped code renders as the code itself, prefixed so it reads as a code and not a label
- [x] The header shows the label beside the signal bars, asserted against the rendered DOM
- [x] With no snapshot the slot shows the same em-dash placeholder every other empty field uses
- [x] `src/domain/network-type.ts` imports neither Electron nor the network

### Tasks

- [x] Failing test: `parse.ts` reads `CurrentNetworkTypeEx` into `networkTypeCode`
- [x] Failing test: the code-to-label map answers correctly for LTE, 3G, 2G, unknown and zero
- [x] Failing test: the rendered header shows the label next to the bars
- [x] Parse the field and add it to the status type
- [x] Write `src/domain/network-type.ts` with the mapping table
- [x] Carry the label through the view model and render it in the header slot
- [x] Verify by hand against the live router: the label matches what the router's own web UI reports

### Notes

An unmapped code reads `Type 102`, and code `0` reads `No service` rather than a
generation — attached to nothing is a different answer from a radio no table
covers. Before the first reading the slot is the em-dash, not `No service`:
nothing has been read, so there is no claim to make about the link.

`networkTypeCode` is required on `RouterStatus`, so five test status fixtures
outside this task's own files needed the field — `main`, `poller`, `popover` and
`tray` under `test/main/`, plus the renderer suite. They are in `files:` above.

Adding it surfaced that **`test/` is type-checked by none of the three commands**
in `docs/ARCHITECTURE.md`. `npm run build` narrows to `src/`, and `npx tsc -p
tsconfig.json --noEmit` reports 8 pre-existing errors in test files (TS2353
`planTotalBytes` left by T-25, TS2488 on NodeList spreads, TS2375 on
`exactOptionalPropertyTypes`). None are this task's; all five it did introduce
were fixed. Worth its own task.

## T-32 Put Sync where the panel is looked at first

T-32 · status: done · size: S · needs: T-21 · files: src/renderer/index.html, src/renderer/popover.css, test/renderer/popover.test.ts

The Sync button sits in a footer under five stat tiles, which is the last place the eye
reaches on a panel whose whole point is the figure at the top. It moves into the header
row, beside the freshness marker.

The status line does not follow it. Those are the step names arriving during a dialogue
that takes tens of seconds — a live region several lines long — and a header that grows
and shrinks while a sync runs would push the dial down mid-read. It stays where the footer
was, as a line with no button above it.

This is layout only: the button's id, handlers, disabled state and `data-attention`
behaviour are unchanged, and the tests that cover them must keep passing untouched.

### Acceptance

- [x] The Sync button is a child of `.header` in the rendered DOM
- [x] The status line is not in `.header`, and still sits below the stat tiles
- [x] Every existing sync test passes with no change to its assertions
- [x] `data-attention="true"` still highlights the button in its new position
- [x] The button keeps its `aria-label` and stays reachable by keyboard in header order
- [x] The header does not change height when the status line fills with text, asserted against the layout rules
- [x] The carrier name still truncates with an ellipsis rather than pushing the button out of the row

### Tasks

- [x] Failing test: the Sync button is inside the header and the status line is not
- [x] Failing test: a long carrier name truncates and the button stays in the row
- [x] Move the button markup into `.header`, leaving the status line where the footer was
- [x] Restyle in `popover.css` — header row spacing, the status line without its button
- [x] Confirm the existing sync tests pass with no edits
- [x] Verify by hand: press Sync from the header and watch the steps arrive below without the panel shifting

### Notes

Two of the seven new tests were genuinely RED — the button being in the header,
and it coming before the plan-size field in the tab order. The other five pin
behaviour the criteria require _not_ to change, so they passed before the move
as well as after; that is what they are for, and the alternative would have been
to assert nothing about them.

`.header` moved from `align-items: baseline` to `center`. A button's baseline
sits inside its own padding, which lifted it out of line with the text beside
it once it joined the row. `.network` took `flex: 1 1 auto` so the freshness
marker and the button sit against the right edge rather than being spread by
`justify-content`.

## T-33 Give the app a mark of its own in Finder and the Dock

T-33 · status: done · size: M · needs: — · files: assets/icon.svg, scripts/render-svg.mjs, scripts/make-icon.mjs, assets/icon.iconset/\*.png, assets/icon.icns, package.json, eslint.config.js, docs/ARCHITECTURE.md, test/assets/icon.test.ts

The packaged bundle currently carries Electron's default icon, so a built
`ck-connect-check.app` is indistinguishable from every other unbranded Electron
app in Finder. The mark is the panel's own language: a ring whose sweep reads as
consumed share, with the signal bars set inside it.

`scripts/render-svg.mjs` is the shared rasteriser — it opens an offscreen
Electron `BrowserWindow` at a given pixel size, loads an SVG, captures the page
and writes a PNG. T-34 reuses it, so it takes the source path, the size and the
destination as arguments and knows nothing about which artwork it is drawing.

`scripts/make-icon.mjs` drives it across the ten sizes an `.iconset` needs, then
calls `iconutil -c icns`. Both the PNGs and the `.icns` are committed: packaging
must never depend on the rasteriser having been run first.

### Acceptance

- [x] `assets/icon.svg` exists, is a square `viewBox`, and contains no raster `<image>` element
- [x] `npm run icon` writes all ten `.iconset` PNGs at 16, 32, 32, 64, 128, 256, 256, 512, 512 and 1024 pixels, each square, verified with `sips -g pixelWidth -g pixelHeight`
- [x] `npm run icon` produces `assets/icon.icns`, confirmed to contain the 16, 32, 128, 256 and 512 point sizes — by converting the archive back out, not by `iconutil -l`, which does not exist. See Notes.
- [x] Running `npm run icon` twice leaves every generated file byte-identical — the rasterisation is deterministic
- [x] `package.json` sets `config.forge.packagerConfig.icon` to a path that resolves to an existing file on disk
- [x] The forge `ignore` list matches `assets/` and `scripts/`, so neither reaches the asar
- [x] `npm test` and `npm run lint` still exit 0

### Tasks

- [x] Failing `test/assets/icon.test.ts` — asserts the SVG's shape, the resolved `packagerConfig.icon` path, the ignore entries, and the generated file set and dimensions
- [x] Write `assets/icon.svg` — the ring sweep, the bars inside it, on a rounded macOS-style squircle field
- [x] `scripts/render-svg.mjs` — offscreen `BrowserWindow`, `capturePage`, PNG out, one size per invocation
- [x] `scripts/make-icon.mjs` — the ten sizes into `assets/icon.iconset/`, then `iconutil -c icns`
- [x] Add the `icon` script to `package.json` and point `packagerConfig.icon` at `assets/icon.icns`
- [x] Extend the forge `ignore` list with `^/assets$` and `^/scripts$`
- [x] Commit the generated `.iconset` PNGs and the `.icns`
- [x] Verify by hand: `npm run package`, then confirm the built `.app` shows the mark in Finder — the Dock half does not apply. See Notes.
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

`iconutil -l` does not exist — the tool takes `--convert`, `--output` and
nothing else. The acceptance criterion's intent is met the documented way
instead: the test converts the built `.icns` back out to an `.iconset` in a
temp directory and reads the point sizes off the filenames, which proves what
the archive actually contains rather than what it was asked to contain.

Three things about driving Electron as a rasteriser cost a run each, and are
worth knowing before T-34 reuses `render-svg.mjs`:

- **`await app.whenReady()` at the top level of an ESM main entry deadlocks.**
  `ready` is emitted only once the main module has finished evaluating, so the
  await waits on an event that is waiting on the await. `app.on("ready", …)`
  is the form that works. Nothing is drawn and nothing is printed.
- **Destroying the last window quits the app.** Each size is captured in its own
  window, so the list empties between sizes and the default `window-all-closed`
  handler ends the run after the first PNG — exit code 0, no error.
  `configureDeterministicRendering()` now registers an empty handler.
- **`--force-device-scale-factor=1` has to be a real command-line argument.**
  Chromium resolves the display scale while initialising the screen, before the
  main module is evaluated, so `app.commandLine.appendSwitch` is too late and a
  Retina display silently returns captures at twice the size requested.

`npm run icon`, and therefore `npm test`, launches a GUI Electron process. A
sandboxed shell blocks that launch and the run hangs with no output.

The manual step asked for the mark in the Dock during launch. It cannot be
there: T-09 set `LSUIElement`, so this is a menu bar agent with no Dock
presence at all. Finder, Get Info and Spotlight are where the mark shows, and
that is where it was signed off. The packaged bundle's
`Contents/Resources/electron.icns` is byte-identical to `assets/icon.icns`,
and `CFBundleIconFile` names it.

## T-34 Put the signal glyph next to the number in the menu bar

T-34 · status: done · size: M · needs: T-33, T-30 · files: assets/tray/bars-0.svg … bars-4.svg, assets/tray/\*Template\*.png, scripts/make-tray-icons.mjs, src/main/tray-icon.ts, src/main/main.ts, package.json, test/main/tray-icon.test.ts, test/main/main.test.ts, test/assets/icon.test.ts, test/project-setup.test.ts

`main.ts:100` builds the tray from `nativeImage.createEmpty()`, so the menu bar
shows a bare number with nothing identifying it. The glyph added here is the
four bars, and it changes with the level the router reports — a tray image that
looked the same at one bar as at five would be the decoration T-30 removed from
the panel.

Five artworks, one per filled count from none to four, rasterised at 16 and 32
pixels through T-33's `render-svg.mjs`. They are template images: macOS recolours
them for light, dark and selected menu bars, which is the only way a tray icon
looks right in all three.

`src/main/tray-icon.ts` owns the mapping from a snapshot's bar count to an image,
loads the five once at startup, and is pure enough to test without a tray — the
Electron call it needs is `nativeImage.createFromPath`, which the test stubs.

### Acceptance

- [x] Five bar artworks exist and `npm run icon` rasterises each at 16 and 32 pixels
- [x] Every generated tray PNG is square and its filename ends `Template` or `Template@2x`, the macOS convention `nativeImage` recognises
- [x] `trayImageFor(bars)` answers a distinct image path for each of 0, 1, 2, 3 and 4 filled bars
- [x] `trayImageFor` clamps out-of-range input — a negative count and a count above the maximum both resolve to an existing path, never `undefined`
- [x] A snapshot whose `maxSignalBars` is 0 resolves to the empty-bars image and throws nothing
- [x] Every image handed to the tray has `setTemplateImage(true)` applied
- [x] The tray is set from a real image at startup rather than `nativeImage.createEmpty()`
- [x] The image is only reassigned when the bar count actually changes, not on every poll
- [x] The tray title still fits under 12 characters alongside the glyph
- [x] `npm test` and `npm run lint` still exit 0

### Tasks

- [x] Failing `test/main/tray-icon.test.ts` — the mapping, the clamping, the template flag, the change-only reassignment
- [x] Draw `assets/tray/bars-0.svg` … `bars-4.svg`, sized for a 16-point menu bar
- [x] `scripts/make-tray-icons.mjs` over T-33's renderer, wired into the `icon` script
- [x] `src/main/tray-icon.ts` — load the five, map a bar count to one, apply the template flag
- [x] Replace `nativeImage.createEmpty()` in `main.ts` and set the image from the snapshot in `tray.ts`
- [x] Make sure the packaged app can find the images — they sit outside the asar, like the panel's assets in T-22
- [x] Verify by hand: watch the glyph in a light and a dark menu bar, and confirm it follows the signal level
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

The glyphs ship _inside_ the asar, not outside it. The task above said outside,
"like the panel's assets in T-22" — but T-22 put its assets in `dist/`, which
electron-forge packs into `app.asar` along with everything else it keeps. The
two halves of that sentence contradict each other, and the half worth following
is the precedent: `npm run build` copies the ten PNGs into `dist/assets/tray/`,
`tray-icon.ts` resolves them by the same `import.meta.url` walk `popover.ts`
uses for its page, and `nativeImage.createFromPath` reads an asar path without
being told it is one. Verified on the built bundle: `asar list` shows all ten
under `/dist/assets/tray/`.

The image is set from `main.ts` rather than from `tray.ts`. `tray.ts` is pure —
a snapshot and the config in, a string out, no Electron — and the reason it is
pure is that every rendering case is testable without a screen. Handing it a
`Tray` to call `setImage` on would have ended that for one line of wiring, so
`main.ts` keeps it, beside the `setTitle` it already owns.

Only the 1x path is ever named. `nativeImage.createFromPath` finds the `@2x`
file sitting beside it by convention, so asking for the Retina variant by name
would be asking twice.

The five levels are loaded once at creation rather than per poll, and
`apply()` remembers which one is showing — a poll every thirty seconds for the
life of the app is a long time to keep reassigning the same image.

`bars-0.svg`'s header comment originally contained the literal `class="filled"`
while describing the artwork, which the "fills one more bar at each level" test
counted as a filled bar. The test now matches `<rect …class="filled"`, so prose
about the drawing cannot be mistaken for the drawing.

## T-35 Introduce the app to someone arriving from GitHub

T-35 · status: done · size: M · needs: T-33, T-34 · files: README.md, docs/media/icon.png, test/readme.test.ts

The repository is public and has no README, so a visitor sees a directory
listing and nothing that says what the app is, which hardware it speaks to, or
how to build it. This writes that page.

It has to be honest about the narrow part: the router side was verified against
one device, a Huawei B310s-22 on `21.333.01.00.00`, and the `#359#` USSD path is
one carrier's menu. Both are stated as what was tested rather than as a
compatibility claim.

The test that accompanies it is a documentation-rot guard: every npm script the
README tells a reader to run must exist in `package.json`, and every relative
image and file path it links must resolve.

### Acceptance

- [x] `README.md` exists and opens with the app name, the icon, and a one-sentence statement of what it does
- [x] It contains sections for what it does, the hardware it was tested against, install and build, how the plan cap and USSD sync work, the config file, and troubleshooting
- [x] Every relative link and image path in the README resolves to a file that exists
- [x] Every `npm run <script>` named in the README exists in `package.json`
- [x] The README names the tested device and software version, and says the `#359#` menu is one carrier's
- [x] It documents each `config.json` key the app reads, and states that the router password is in the Keychain and not in that file
- [ ] A screenshot of the panel and one of the menu bar item are committed under `docs/media/` and referenced
- [x] `npm test` and `npm run lint` still exit 0

### Tasks

- [x] Failing `test/readme.test.ts` — required headings, link resolution, script names against `package.json`
- [ ] Capture the panel and menu bar screenshots from a running build into `docs/media/`
- [x] Export a PNG of the icon for the README header from T-33's iconset
- [x] Write the README against the sections the criteria name
- [x] Read the config keys straight from `src/config/` so the reference matches the code
- [x] Troubleshooting: router unreachable, wrong password and the five-failure lockout, a sync that names a router error code
- [x] Verify by hand: read it as a stranger would and follow the build steps on a clean checkout
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

**The two screenshots were not taken, and that criterion is not met.** They need
a running app on a real screen, which nothing in the suite can produce; the app
was launched for the capture and the images never arrived, and the decision was
to finish without them. The README therefore shows the icon and no screenshots,
and the assertion that would have guarded them was _removed_ rather than
skipped — a skipped test that describes files nobody has taken is worse than an
absent one. The link check already in place covers both images the moment the
README references them, so adding them later is: drop the two PNGs into
`docs/media/`, add the two image lines under the opening paragraph, and the
existing test starts guarding them with no edit.

The config table is checked against the code rather than against a list kept in
the test: `configKeys()` parses the `AppConfig` interface out of
`src/config/defaults.ts`, so a setting added to the app without a line in the
README fails the suite. That is the whole point of the guard — the README's
claims are checked against what has to honour them, not against themselves.

The README states the tested device and version as what was tested, never as a
compatibility claim, and says in as many words that the `#359#` path is one
carrier's own menu. Both are the honest narrow parts of this project, and the
test asserts they stay stated.

## T-36 Ask how long the plan lasts so the pace has a period

T-36 · status: done · size: M · needs: T-27 · files: src/config/config.ts, src/config/defaults.ts, src/main/view-model.ts, src/main/main.ts, src/main/popover.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, src/renderer/preload.cts, README.md, test/config/config.test.ts, test/main/view-model.test.ts, test/main/main.test.ts, test/renderer/popover.test.ts

The cap answers "how much"; nothing yet answers "over how long". T-27 put a cap
field in the panel and this puts a plan-length field beside it, because the
`pace` band in T-37 divides by a period the carrier's USSD reply never states —
it gives an expiry date, not a duration. With `planDays` set, the period start is
`expiresAt − planDays` and the band becomes arithmetic on figures already in hand.

This field is a **refinement, not a precondition**. T-37's tier 1 reading
(`remainingNow / daysUntilExpiry`) needs neither this nor the cap, so the panel is
useful before this is ever typed. Filling it in adds the band and the flat daily
budget, and nothing else stops working while it is blank.

`planDays` is `number | null` like `planLimitBytes`, so an unset value
round-trips rather than defaulting to 30 and quietly inventing a period.

### Acceptance

- [x] `config.ts` round-trips `planDays` as `number | null` and an absent key loads as `null`
- [x] a `planDays` of `0`, a negative number or a non-integer is rejected on load and read as `null`
- [x] the popover model exposes `planDays` and an editor flag for the set and unset cases
- [x] the panel has a plan-length input next to the cap, and typing `30` in it writes `30` to config through the preload bridge
- [x] a blank plan-length submission is rejected and leaves the stored value untouched
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for every criterion above
- [x] Add `planDays` to `AppConfig`, its validation on load and its default in `defaults.ts`
- [x] Expose it through the view-model with the editor flag
- [x] Add the input, its handler and its style beside the cap field
- [x] Route the setter through `preload.cts` alongside the existing cap setter
- [x] Manual: type `30` in the panel and confirm `config.json` holds it after a restart
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

The form lookups in `src/renderer/popover.ts` are element-qualified —
`form[data-plan-limit]`, `form[data-plan-days]` — because `applyPlanLimit` and
`applyPlanDays` write those same attribute names onto the `<html>` root as state
flags. A bare attribute selector matches the root element first, so the listener
was being hung off `<html>` rather than off the form. T-27's cap only worked
because a submit event bubbles up to the root; adding a second form broke it,
since both then contended for the same `data-bound` marker on one element. The
cap's lookup was corrected in the same pass.

`:root[data-plan-limit="unset"]`'s accent rule is now scoped to
`[data-plan-limit-input]` for the same reason: both fields share the
`.plan-limit-input` class, so the unscoped rule outlined the length field too.
The length is a refinement rather than a precondition, so it is deliberately not
flagged when blank.

`src/main/popover.ts`, `test/main/main.test.ts` and `README.md` joined the
`files:` list — the IPC channel, the wiring test, and the settings row
`readme.test.ts` derives from `AppConfig`.

## T-37 Work out whether the connection is being used moderately

T-37 · status: done · size: M · needs: T-36 · files: src/domain/pace.ts, test/domain/pace.test.ts

The arithmetic from `## Reading the consumption pace` in `docs/ARCHITECTURE.md`,
as a pure function in `src/domain/` with no Electron and no network — the same
boundary `allowance.ts` keeps.

The reading is **tiered**, because the app already holds most of what the answer
needs. A sync states a remaining volume and an expiry date, and those two alone
give the number that gets looked at daily. The cap and the plan length each add a
layer on top; neither gates the others.

```
readPace({ anchor, month, planLimitBytes, planDays, clock })
  → null                                     // no anchor, or no expiry, or expired
  | { tier: 1 | 2 | 3,
      daysUntilExpiry,
      sustainablePerDay,        // tier 1+: remainingNow / daysUntilExpiry
      usedShare:         null,  // tier 2+: usedNow / planLimitBytes
      elapsedShare:      null,  // tier 3:  (now − periodStart) / planDays
      pace:              null,  // tier 3:  usedShare / elapsedShare
      affordedPerDay:    null,  // tier 3:  planLimitBytes / planDays
      state:             null } // tier 3:  'safe' | 'warning' | 'over'
```

Tier 1 needs the anchor only. Tier 2 adds `planLimitBytes`. Tier 3 adds
`planDays`. Fields belonging to an unreached tier are `null`, never absent, so the
caller reads one shape and the renderer branches on `tier`.

The bands are `safe` at `pace ≤ 1.00`, `warning` up to `1.20`, `over` above it.
The weekend case in the request needs no special handling: both shares are
cumulative, so a week of nothing pulls `usedShare` back under `elapsedShare` on
its own.

Three edges decide whether this is trustworthy or noise. On the plan's first hours
`elapsedShare` is near zero and the ratio explodes, so a period less than one day
elapsed reports `safe` regardless. Past the expiry `daysUntilExpiry` is zero and
every division would blow up, so an expired anchor yields `null` outright — the
same answer `allowance.ts` already gives it. And a carrier reply that stated no
expiry at all leaves `daysUntilExpiry` null, which is the same `null` for the same
reason: there is no period to divide by.

An untrustworthy anchor — T-28's `counter-reset` — also yields `null`. Its
`remainingNow` is the anchored figure with no delta applied, so a pace drawn from
it would describe a moment that has already passed.

### Acceptance

- [x] **tier 1** — an anchor with 30 Go remaining and 10 days to expiry, no cap and no `planDays`, reports `tier: 1` and a `sustainablePerDay` of 3 Go
- [x] a tier 1 result has `pace`, `state`, `usedShare`, `elapsedShare` and `affordedPerDay` all exactly `null`
- [x] **tier 2** — adding a 150 Go cap reports `tier: 2`, a `usedShare` matching `readAllowanceNow`'s share, and still a `null` `state`
- [x] **tier 3** — 30 Go over 30 days with 2 Go used on day 1 reports `tier: 3` and `over` — one day elapsed, two days' worth spent
- [x] the same plan with 2 Go used on day 8 reports `safe`, and `pace` is below 1
- [x] 30 Go over 30 days with 20 Go used on day 15 reports `over`, and 16 Go on day 15 reports `warning`
- [x] a missing anchor, an anchor with a null `expiresAt`, and an anchor past its expiry each yield `null` and never divide by zero
- [x] an anchor whose staleness is `counter-reset` yields `null`
- [x] under one elapsed day the state is `safe` whatever has been used, and `pace` is not `Infinity` or `NaN`
- [x] `affordedPerDay` is 1 Go for a 30 Go / 30 day plan, and `sustainablePerDay` rises as usage stops while `affordedPerDay` does not
- [x] `sustainablePerDay` is computed from `readAllowanceNow(...).remainingBytes`, asserted by a case where the router counter has advanced since the anchor
- [x] `src/domain/pace.ts` imports neither `electron` nor anything under `src/hilink/`
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for every criterion above, with a fixed clock, one describe block per tier
- [x] Implement the tier 1 core — `daysUntilExpiry` and `sustainablePerDay` — and its null cases
- [x] Layer tier 2's `usedShare` and tier 3's `elapsedShare`, `pace`, `affordedPerDay` and band on top
- [x] Name the band thresholds and the one-day floor as constants
- [x] Reuse `readAllowanceNow` for `remainingNow` and `daysUntilExpiry` rather than recomputing either
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

`src/domain/allowance.ts` was in the planned `files:` list but needed no change:
`AllowanceNowInput` was already exported, so `pace.ts` reaches the router's
month-counter type through it and imports nothing under `src/hilink/` — which is
what the boundary criterion asks for.

Both null guards are on the reading rather than on the anchor: `!trustworthy`
covers the expired and counter-reset cases in one, and `daysUntilExpiry <= 0`
catches an expiry later today, which is not yet past but has no run of days to
divide the remainder across.

## T-38 Show the pace and its warning on the panel

T-38 · status: todo · size: M · needs: T-37 · files: src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, test/main/view-model.test.ts, test/renderer/popover.test.ts

One row under the dial, in the same shape as the existing tiles, growing with the
tier T-37 reports:

- **tier 1** — `sustainablePerDay` alone: "2.40 Go/jour jusqu'au 15 août". This is
  the row every synced user sees, with nothing typed in.
- **tier 2** — the same, plus the consumed share already on the dial, so the row
  says what the ring shows in words.
- **tier 3** — the band as a coloured word, `affordedPerDay` beside
  `sustainablePerDay`, and a sentence saying which way the pace is going.

`over` uses the same accent the warning threshold already uses so the panel has
one visual language for trouble. Below tier 3 there is no band and no colour — an
uncoloured row is the honest rendering of "here is the figure, no judgement".

When `readPace` yields `null` the row is absent rather than empty — a pace over a
period nobody stated is the same lie the dial refuses to draw before a sync.

Tiers 1 and 2 hint at what would sharpen them, pointing at the cap and plan-length
fields T-27 and T-36 put in the panel, so the reason the band is missing is on
screen next to its absence.

### Acceptance

- [ ] the popover model carries a `pace` field that is `null` exactly when `readPace` returns `null`, and otherwise carries the tier through unchanged
- [ ] a tier 1 model renders `sustainablePerDay` and the expiry, and no band word, no `data-state` and no `affordedPerDay`
- [ ] a tier 2 model renders the consumed share as well, and still no band word
- [ ] a tier 3 `safe` model renders the band word, `affordedPerDay` and `sustainablePerDay` together
- [ ] `warning` and `over` models render with distinct `data-state` values, asserted against the stylesheet's selectors
- [ ] a `null` pace renders no pace row at all, and the panel's height is unchanged in every other respect
- [ ] tiers 1 and 2 render a hint naming the missing setting, and tier 3 renders none
- [ ] the daily figures are formatted with the octet helper, so a 1 000 000 000-byte figure reads `1.00 Go`
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [ ] Failing tests for every criterion above, one per tier
- [ ] Thread `readPace` into `buildPopoverModel`
- [ ] Render the row, branching on `tier`, with the three band states inside tier 3
- [ ] Style the bands against the existing accent variables, adding none that duplicate them
- [ ] Manual: with a real anchor and no cap typed, confirm the tier 1 row reads correctly
- [ ] Manual: type the cap and the length, confirm the band appears and matches a hand calculation
- [ ] Update the `files:` line above to reflect everything actually touched

## T-39 Know when the carrier figure has gone stale

T-39 · status: done · size: S · needs: T-28 · files: src/domain/allowance.ts, src/config/config.ts, src/config/defaults.ts, README.md, test/domain/allowance.test.ts, test/config/config.test.ts

T-28 decides whether an anchor is _usable_. This adds the second question —
whether a usable anchor is _recent_ — as a pure predicate beside it, so T-40 wires
policy without holding any arithmetic:

```
isAnchorStale(anchor, now, staleAfterMinutes) → boolean
```

`syncStaleAfterMinutes` joins the config with a default of 30. No anchor at all is
not "stale": that case is already T-28's no-usable-anchor path, and conflating the
two would make the caller run the same dialogue for two different reasons.

### Acceptance

- [x] an anchor synced 31 minutes ago with a 30-minute setting is stale, and one synced 29 minutes ago is not
- [x] the boundary is exact — 30 minutes to the millisecond is not yet stale
- [x] a `null` anchor is reported not-stale, and the existing usability check still reports it unusable
- [x] an anchor with a `syncedAt` in the future is not stale and throws nothing
- [x] `config.ts` round-trips `syncStaleAfterMinutes`, defaults it to 30, and rejects zero or negative values back to the default
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for every criterion above, with a fixed clock
- [x] Implement `isAnchorStale` next to the existing usability predicate
- [x] Add the config key, its default and its validation
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

An invalid `syncStaleAfterMinutes` falls back for that key alone rather than
throwing, which is the one setting in `config.ts` that does not take the whole
file down with it. A hand-typed `0` would otherwise discard the stored allowance
anchor, and recovering that costs a full USSD dialogue and a login against a
device that locks after five refusals. Decided with the user during the build.

`README.md` joined the `files:` list: `readme.test.ts` derives the documented
settings list from the `AppConfig` interface, so a new config key without a
README row fails the suite.

## T-40 Re-sync by itself on open and after a long silence

T-40 · status: todo · size: M · needs: T-39 · files: src/main/sync.ts, src/main/main.ts, src/main/popover.ts, src/main/view-model.ts, test/main/sync.test.ts, test/main/main.test.ts

Both halves of the request are the same rule evaluated at two moments: if the
anchor is stale, run one dialogue. Opening the panel evaluates it, and a
background timer evaluates it for an app nobody has opened all afternoon.

The guards are what keep a 30-minute window off the router's five-failure
lockout, and each is a test rather than a comment:

- one dialogue in flight at a time, ever
- nothing starts without a stored password, or while the router is unreachable,
  or before the first successful snapshot
- a failure parks automatic syncing until an explicit Sync press; the stale clock
  restarts only on success
- the check is on open and on its own timer, never on a poll tick

### Acceptance

- [ ] opening the panel with a stale anchor starts exactly one dialogue, and opening it with a fresh one starts none
- [ ] the background timer starts a dialogue for a stale anchor with the panel closed
- [ ] opening the panel twice inside one stale window starts exactly one dialogue in total
- [ ] a dialogue already in flight is never joined by a second, asserted with a deferred stub
- [ ] a failed automatic sync issues exactly one dialogue, and no further automatic dialogue is issued however long the anchor stays stale
- [ ] an explicit Sync press after that failure runs, and a success re-arms automatic syncing
- [ ] no dialogue starts with no stored password, with the router unreachable, or before the first snapshot
- [ ] a poll tick alone never starts a dialogue
- [ ] the panel reports an automatic sync's steps in the same status line an explicit press uses, marked as automatic
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [ ] Failing tests for every criterion above, with a fake timer and a stubbed dialogue
- [ ] Extend `sync.ts` with the stale-triggered entry point and the in-flight and parked flags
- [ ] Call it from the popover's show path and from a timer in `main.ts`
- [ ] Surface the automatic marker through the view-model
- [ ] Manual: back-date `syncedAt` in `config.json`, open the panel, confirm one dialogue runs and a second open does not
- [ ] Manual: with a wrong password stored, confirm one attempt is made and none follow
- [ ] Update the `files:` line above to reflect everything actually touched

## T-41 Release the pace and the automatic sync as 0.2.0

T-41 · status: todo · size: S · needs: T-38, T-40, T-42 · files: package.json, package-lock.json, README.md, test/readme.test.ts, test/project-setup.test.ts

Version 0.2.0, and a README that describes the app as it now behaves: a tiered
pace reading under the dial, a plan length to enter beside the cap, a sync that
happens by itself when the carrier figure is over half an hour old, and what to do
after a top-up. T-35's README test already asserts the document matches reality,
so this extends that test rather than trusting prose.

### Acceptance

- [ ] `package.json` reads `0.2.0` and `package-lock.json` agrees
- [ ] `app-info.ts`'s version, or whatever the app reports as its version, reads 0.2.0
- [ ] the README documents the plan-length setting, the three pace tiers and their bands, the 30-minute automatic sync, and the top-up flow
- [ ] the README states that loading a new plan needs a Sync and a cap confirmation, and no reset
- [ ] the README test asserts each of those claims against the source that implements it
- [ ] the README's settings list matches the keys `config.ts` actually parses, `planDays` and `syncStaleAfterMinutes` included
- [ ] `npm test`, `npm run lint`, `npm run build` and `npm run package` all exit 0

### Tasks

- [ ] Failing README and project-setup tests for the claims above
- [ ] Bump the version in `package.json` and refresh the lockfile
- [ ] Write the four README sections
- [ ] Manual: package the app and confirm it reports 0.2.0
- [ ] Update the `files:` line above to reflect everything actually touched

## T-42 Notice a new plan instead of reporting the old one's share

T-42 · status: todo · size: M · needs: T-27, T-28 · files: src/domain/allowance.ts, src/config/config.ts, src/main/sync.ts, src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, test/domain/allowance.test.ts, test/config/config.test.ts, test/main/sync.test.ts, test/main/view-model.test.ts, test/renderer/popover.test.ts

Loading a new plan needs no reset control: `anchorFrom` builds a whole new anchor
on every sync — label, remaining, expiry and both router counters — so a reset
button would clear nothing a Sync does not already overwrite. What a sync cannot
refresh is the two values the user typed, and a cap left over from the previous
plan is a **silent fault**. `readAllowanceNow` computes
`usedBytes = max(0, cap − remainingBytes)`, so topping up from a 50 Go plan to a
150 Go one without retyping the cap clamps consumption to zero and the dial reads
0% indefinitely, with nothing on screen suggesting why.

So the new plan is detected instead, as a pure predicate beside the existing
staleness one:

```
isNewPlan(anchor, previous, planLimitBytes) → boolean
```

True when the anchor's `planLabel` differs from the previous anchor's, when its
`expiresAt` moves later, or when its `remainingBytes` exceeds the configured cap —
that last one alone catches a top-up the carrier labelled identically.

Detection sets `planCapConfirmed: false` in the config. While it is false the
panel keeps T-37's tier 1 reading, which needs no cap and is therefore still true,
and drops the dial and the band rather than drawing either from a cap the carrier
has contradicted. Confirming or retyping the cap sets it back to true.

`previous` is the anchor being replaced, so the comparison happens inside the sync
that writes the new one; a first-ever sync has no previous and is not a new plan.

### Acceptance

- [ ] `isNewPlan` is true for a differing `planLabel`, for an `expiresAt` later than the previous one, and for `remainingBytes` above the configured cap
- [ ] it is false when label, expiry and remaining are all unchanged, and false when there is no previous anchor
- [ ] it is false for an `expiresAt` that moved _earlier_, and throws nothing when either `expiresAt` is null
- [ ] it is false when no cap is configured and only the remaining volume grew — with no cap there is nothing to contradict
- [ ] `config.ts` round-trips `planCapConfirmed` as a boolean, defaulting to `true` so an existing config is not flagged on first launch
- [ ] a sync whose new anchor is a new plan writes `planCapConfirmed: false`, and one that is not leaves the flag untouched
- [ ] with the flag false the popover model's `percentUsed` and `pace.tier` 2 and 3 fields are null, while the tier 1 reading is unchanged
- [ ] with the flag false the panel renders the confirmation prompt and no dial, asserted against the stylesheet's selectors
- [ ] submitting the cap through the existing T-27 setter sets the flag true, and the dial returns in the same model build
- [ ] confirming without changing the cap also sets it true, so an unchanged plan size costs one click
- [ ] the tray title follows the same rule as the dial, never showing a share computed from an unconfirmed cap
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [ ] Failing tests for every criterion above, with a fixed clock
- [ ] Implement `isNewPlan` beside `stalenessOf`, exported and pure
- [ ] Add `planCapConfirmed` to `AppConfig`, its default and its validation
- [ ] Call the predicate where the sync writes its anchor, and clear the flag there only
- [ ] Gate `percentUsed` and the tier 2/3 pace fields on the flag in the view-model
- [ ] Render the confirmation prompt and wire its two actions to the existing cap setter
- [ ] Manual: edit `config.json` to a cap below the anchored remaining, open the panel, confirm the prompt appears and the dial does not
- [ ] Manual: confirm the cap and watch the dial and the band return
- [ ] Update the `files:` line above to reflect everything actually touched
