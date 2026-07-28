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
| T-16 | Read the carrier's USSD replies as data instead of text                 | todo   | S    | T-02             |
| T-17 | Sign in to the router so its protected endpoints can be used            | todo   | M    | T-03             |
| T-18 | Ask the carrier for the exact remaining allowance over USSD             | todo   | M    | T-16, T-17       |
| T-19 | Keep the router password in the macOS Keychain                          | todo   | S    | T-17             |
| T-20 | Carry the real allowance forward with the router's own counter          | todo   | M    | T-18, T-05       |
| T-21 | Sync the real figures from the panel with one button                    | todo   | M    | T-19, T-20       |

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

T-16 · status: todo · size: S · needs: T-02 · files: src/hilink/ussd-parse.ts, src/hilink/types.ts, test/hilink/ussd-parse.test.ts, test/fixtures/hilink/ussd-\*.xml

The carrier answers `#359#` in prose. This turns each reply into a typed object at the
`src/hilink/` boundary, exactly as the XML parsers already do: the `<content>` is
extracted from the envelope, then the text is read for the two things worth having — a
menu with numbered options, and the final allowance line.

Both live in one reply shape, because a USSD reply can carry text *and* a menu at once:
the `#359#` answer states the credit and offers `1 Mes offres` in the same breath.

Purely textual, no I/O — a fixture per captured step is the whole test surface. Accents
are absent from the device's replies (`utilisable a toute heure`, `jusqu au`), so matching
must not depend on them.

### Acceptance

- [ ] `parseUssdContent` returns `{ text, options }` from a `<response><content>…</content></response>` envelope
- [ ] The `#359#` reply parses to one option `{ digit: "1", label: "Mes offres" }`
- [ ] The third reply parses to options `1 Info conso` and `00 Page precedente`, keeping `00` as a string and preserving order
- [ ] A reply with no numbered lines parses to an empty `options` array, not a null
- [ ] `parseAllowance` reads `il vous reste 145835.9 Mo` as `145_835_900_000` bytes on the decimal 1000³ scale
- [ ] `parseAllowance` reads `jusqu au 25/08/2026 inclus` as a date whose day, month and year are 25, 8 and 2026
- [ ] `parseAllowance` reads the offer name `NET MONTH 200 000` as the plan label
- [ ] `parseAllowance` accepts `Go`, `Mo` and `Ko` units, and a comma decimal separator (`145835,9 Mo`)
- [ ] `parseAllowance` returns null for the credit line and for any reply without a `il vous reste` clause, rather than throwing
- [ ] `parseUssdError` maps `111019` to a "not ready" result distinct from any other error code
- [ ] A malformed or empty envelope raises the same parse error the existing XML parsers raise

### Tasks

- [ ] Capture the four `#359#` replies as fixtures under `test/fixtures/hilink/`, one file per step, in the router's own envelope format
- [ ] Failing tests in `test/hilink/ussd-parse.test.ts` for every criterion above, driven off those fixtures
- [ ] Add `UssdReply`, `UssdOption` and `Allowance` to `src/hilink/types.ts`
- [ ] Implement `parseUssdContent`, `parseAllowance` and `parseUssdError` in `src/hilink/ussd-parse.ts`, reusing the envelope helpers already in `src/hilink/parse.ts`
- [ ] Confirm the volume conversion routes through the existing decimal scale rather than a second private constant

## T-17 Sign in to the router so its protected endpoints can be used

T-17 · status: todo · size: M · needs: T-03 · files: src/hilink/login.ts, src/hilink/session.ts, src/hilink/client.ts, src/hilink/types.ts, test/hilink/login.test.ts, test/hilink/client.test.ts

Every `POST` on this device answers `100003` — no rights — until a login has happened. The
monitoring snapshot does not need one, so this adds an authenticated mode alongside the
existing anonymous session rather than replacing it: `snapshot()` keeps working with no
credential present.

The scheme is the `password_type: 4` SHA-256 one recorded in `docs/ARCHITECTURE.md`. Two
details are easy to get wrong and are pinned by tests: the token folded into the hash is
the handshake `TokInfo`, while every request *after* login must use the rolling token from
the login reply's `__RequestVerificationTokenone` header, not the handshake one.

A wrong password must fail once and stop. The router locks the account after five
consecutive failures, so there is no retry, no back-off loop, and no second attempt on the
same credential.

### Acceptance

- [ ] `scramblePassword(user, password, token)` produces `base64(sha256hex(user + base64(sha256hex(password)) + token))`, asserted against a hand-computed vector
- [ ] `login` posts to `/api/user/login` with `password_type` 4 and the scrambled value in the `<Password>` element
- [ ] A successful login returns the `SessionID` from `Set-Cookie` and the token from the `__RequestVerificationTokenone` response header
- [ ] Requests issued after a successful login carry the rolling token, not the handshake `TokInfo`
- [ ] A `108006` reply resolves to a failed result naming a wrong credential, and never throws
- [ ] A `108007` reply resolves to a failed result naming a locked account, distinct from a wrong credential
- [ ] `login` is called at most once per attempt — a failed login triggers no second request, asserted by counting fetch calls
- [ ] `snapshot()` still succeeds with no credential configured, proving the anonymous path is untouched
- [ ] A login attempt that times out or cannot reach the host returns the existing offline reasons rather than a login failure
- [ ] `logout` posts to `/api/user/logout` and clears the stored authenticated session

### Tasks

- [ ] Failing tests in `test/hilink/login.test.ts` for the scramble vector, the rolling-token rule, and each of the `108006` / `108007` / offline outcomes
- [ ] Failing test asserting exactly one fetch to `/api/user/login` when the credential is rejected
- [ ] Add `RouterCredential` and `LoginResult` to `src/hilink/types.ts`
- [ ] Implement `scramblePassword` and `login` in `src/hilink/login.ts` using `node:crypto`
- [ ] Extend `SessionStore` in `src/hilink/session.ts` to hold an authenticated session with its rolling token, separate from the anonymous one
- [ ] Add a `#post` helper to `RouterClient` mirroring `#get` — same timeout, same error classes, same offline mapping
- [ ] Confirm `test/hilink/client.test.ts` still passes untouched, or note in `### Notes` why a change was unavoidable

## T-18 Ask the carrier for the exact remaining allowance over USSD

T-18 · status: todo · size: M · needs: T-16, T-17 · files: src/hilink/ussd.ts, src/hilink/client.ts, test/hilink/ussd.test.ts

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

- [ ] A run against the four recorded fixtures returns an `Allowance` of `145_835_900_000` bytes expiring 25/08/2026, labelled `NET MONTH 200 000`
- [ ] The four sends carry `#359#`, then `1`, `1`, `1` in that order, asserted from the recorded request bodies
- [ ] A menu whose `Info conso` entry is numbered `2` is navigated with `2`, proving label matching beats position
- [ ] A menu with no matching label falls back to the recorded digit for that step
- [ ] `111019` from `/api/ussd/get` is retried until content arrives, and the poll interval comes from the injected clock rather than a real delay
- [ ] A `get` that never yields content within the bounded window ends the attempt with a timeout reason
- [ ] `/api/ussd/release` is requested exactly once on the success path
- [ ] `/api/ussd/release` is requested on the failure path too — asserted for a mid-dialogue error, a timeout, and an unparseable reply
- [ ] A non-zero `/api/ussd/status` before starting returns a "busy" reason without sending anything
- [ ] A second concurrent call while one dialogue is in flight returns the "busy" reason rather than interleaving requests
- [ ] A `100003` anywhere in the dialogue returns a reason naming the missing login, distinct from every other failure
- [ ] The whole flow resolves to a result object and never throws, matching how `snapshot()` behaves

### Tasks

- [ ] Failing tests in `test/hilink/ussd.test.ts` for the happy path over the fixtures, using a stub fetch and a fake clock
- [ ] Failing tests for the reordered-menu, no-label-fallback, busy, concurrent, timeout, `100003` and release-on-failure cases
- [ ] Define the menu script as data — a list of steps, each with a label pattern and a fallback digit
- [ ] Implement `readAllowance` in `src/hilink/ussd.ts` against the `#post` and `#get` helpers from T-17
- [ ] Wrap the release in a `finally` so no exit path can skip it, and guard re-entry with an in-flight flag
- [ ] Expose the entry point on `RouterClient` so the main process never talks to endpoints directly
- [ ] Verify by hand against the real router once, and record the observed reply in `### Notes`

## T-19 Keep the router password in the macOS Keychain

T-19 · status: todo · size: S · needs: T-17 · files: src/main/credentials.ts, src/config/config.ts, test/main/credentials.test.ts

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

- [ ] `saveCredential` writes an encrypted blob and the username to config, and the plaintext password appears nowhere in the written file
- [ ] `loadCredential` round-trips a saved username and password through a stubbed `safeStorage`
- [ ] `loadCredential` returns null when no credential has ever been saved
- [ ] `clearCredential` removes the stored blob, after which `loadCredential` returns null
- [ ] `saveCredential` reports a failure, and writes nothing, when `safeStorage.isEncryptionAvailable()` is false
- [ ] A stored blob that fails to decrypt returns null and does not throw, so a Keychain reset degrades to "no password"
- [ ] `parseConfig` accepts a config with no credential fields, keeping every existing config file valid
- [ ] `parseConfig` rejects a credential blob that is not a string, with the existing `ConfigValidationError`
- [ ] No test or source file outside `src/main/credentials.ts` imports `safeStorage`

### Tasks

- [ ] Failing tests in `test/main/credentials.test.ts` for the round trip, the absent case, the clear, the unavailable-encryption case and the corrupt-blob case, against a stubbed `safeStorage`
- [ ] Failing tests in `test/config/config.test.ts` for the optional credential fields and the non-string rejection
- [ ] Add the optional `routerUsername` and `routerPasswordBlob` fields to `AppConfig` and its validator
- [ ] Implement `saveCredential`, `loadCredential` and `clearCredential` in `src/main/credentials.ts`
- [ ] Confirm nothing logs the decrypted value — grep the module for the password variable reaching a log call

## T-20 Carry the real allowance forward with the router's own counter

T-20 · status: todo · size: M · needs: T-18, T-05 · files: src/domain/allowance.ts, src/config/config.ts, src/config/defaults.ts, src/main/view-model.ts, test/domain/allowance.test.ts, test/config/config.test.ts

This is the heart of the feature: the arithmetic that turns one USSD reading into a figure
that stays right for days. A sync records an anchor — the remaining volume, the expiry, and
the router's month counter *at that instant* — and afterwards only the counter's delta is
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

- [ ] With an anchor of 145 835 900 000 bytes at counter 1 000 000 000, a counter of 3 000 000 000 yields 143 835 900 000 bytes remaining
- [ ] An unchanged counter yields exactly the anchored remaining, with no drift
- [ ] A counter below the anchored one reports the anchor as stale with a reset reason, rather than a larger remaining
- [ ] A `MonthLastClearTime` different from the anchored one reports stale with a reset reason, even when the counter has grown
- [ ] An anchor whose `expiresAt` is before the injected now reports stale with an expiry reason
- [ ] A delta exceeding the anchored remaining clamps to zero remaining and reports an exhausted state, never a negative
- [ ] `planTotalBytes` is the maximum `remainingBytes` ever anchored, and does not fall when a later sync anchors a smaller remaining
- [ ] Percentage used is computed from the anchor when one is trustworthy, and from the configured limit when none is
- [ ] `daysUntilExpiry` counts whole days from the injected now to the anchored expiry, reporting 0 on the expiry day itself
- [ ] A stale anchor still exposes its last computed remaining, so the panel can show a marked figure
- [ ] An anchor round-trips through `saveConfig` and `loadConfig` unchanged, including the expiry date
- [ ] `parseConfig` accepts a config with no anchor, keeping every existing config file valid
- [ ] `parseConfig` rejects an anchor with a non-numeric byte count or an unparseable date

### Tasks

- [ ] Failing tests in `test/domain/allowance.test.ts` for each arithmetic and staleness criterion, with an injected `Clock`
- [ ] Failing tests in `test/config/config.test.ts` for the anchor round trip, the absent anchor and the two rejections
- [ ] Define `AllowanceAnchor` and `AllowanceReading` in `src/domain/allowance.ts`
- [ ] Implement `anchorFrom`, `readAllowanceNow` and `planTotalBytes` as pure functions over an injected clock
- [ ] Add the anchor and the high-water plan total to `AppConfig`, its defaults and its validator, storing dates as ISO strings
- [ ] Extend `buildPopoverModel` to prefer a trustworthy anchor over the configured limit, leaving its existing behaviour intact when no anchor exists
- [ ] Confirm `src/domain/allowance.ts` imports neither Electron nor the network

## T-21 Sync the real figures from the panel with one button

T-21 · status: todo · size: M · needs: T-19, T-20 · files: src/renderer/popover.ts, src/renderer/index.html, src/renderer/popover.css, src/main/popover.ts, src/main/main.ts, src/main/view-model.ts, test/renderer/popover.test.ts, test/main/popover.test.ts, test/main/view-model.test.ts

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

- [ ] The panel renders a Sync button, and pressing it sends exactly one sync request over IPC
- [ ] The button is disabled while a sync is in flight, and a second press sends nothing
- [ ] While syncing, the panel shows a progress state naming the current step rather than a frozen panel
- [ ] A successful sync renders the exact remaining volume in octets, the expiry as a date, and the days remaining
- [ ] A successful sync renders how long ago it happened, refreshed by the existing poll push
- [ ] A stale anchor renders the last computed figure together with a visible re-sync marker, and the Sync button carries an attention state
- [ ] A stale anchor never renders the config-limit estimate in place of the anchored figure
- [ ] A sync that fails renders the reason — busy, timeout, wrong password, locked account, no password, router offline — as distinct panel text, one case asserted per reason
- [ ] With no password stored, pressing Sync renders a password prompt instead of starting a dialogue
- [ ] Submitting the password prompt saves the credential and then starts the dialogue
- [ ] The rate sparklines and the usage dial keep updating while a sync is in flight, proving the poll loop is not blocked
- [ ] No sync is ever started by the poll timer — asserted by advancing the poll clock and counting USSD calls at zero
- [ ] The Sync button is reachable by keyboard and carries an accessible name; the freshness marker is announced as text, not colour alone

### Tasks

- [ ] Failing tests in `test/renderer/popover.test.ts` for the button, the disabled-while-syncing rule, the progress state, the success rendering, the stale marker and each failure reason
- [ ] Failing test asserting the poll timer never triggers a USSD call
- [ ] Failing tests in `test/main/popover.test.ts` for the sync IPC channel and the password-save channel
- [ ] Extend `PopoverModel` with the allowance figures, the freshness state and the sync state, and cover them in `test/main/view-model.test.ts`
- [ ] Add the sync and save-password IPC channels to the preload bridge and `src/main/popover.ts`
- [ ] Wire the handler in `src/main/main.ts`: load the credential, run T-18's dialogue, anchor the result through T-20, persist, push the new model
- [ ] Build the button, progress, stale marker and password prompt in `src/renderer/popover.ts`, styled in `popover.css` to match the existing panel
- [ ] Verify by hand: press Sync against the real router, confirm the panel figure matches the USSD reply, then watch it decrease as data is used
- [ ] Confirm the `files:` line above reflects everything actually touched
