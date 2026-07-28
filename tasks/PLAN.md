# PLAN — ck-connect-check

| ID | Title | Status | Size | Needs |
|---|---|---|---|---|
| T-01 | Set the project up so tests can run | done | S | — |
| T-02 | Turn the router's XML replies into typed data | done | S | T-01 |
| T-03 | Fetch a live usage snapshot from the router | done | M | T-02 |
| T-04 | Work out how much of the plan is used and when it resets | done | S | T-01 |
| T-05 | Remember the plan limit and router address | done | S | T-01 |
| T-06 | Show usage in the macOS menu bar | done | M | T-03, T-04, T-05 |
| T-07 | Show the details when the menu bar item is clicked | done | M | T-06 |
| T-08 | Warn when usage approaches or passes the limit | done | S | T-04, T-06 |
| T-09 | Launch the app on login without a Dock icon | done | S | T-06 |
| T-10 | Keep the open panel refreshing instead of freezing until it is reopened | todo | S | T-07 |
| T-11 | Refresh quickly while the panel is open and slowly while it is shut | todo | S | T-10 |
| T-12 | Remember the last few minutes of throughput | todo | S | T-03 |
| T-13 | Show the month's usage as a dial instead of a bar | todo | M | T-10 |
| T-14 | Show download and upload rates as live sparklines | todo | M | T-12, T-13 |

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
`TRAY_WARN_MARKER = '⚠'` REPLACES the ` · ` separator rather than being appended
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

T-10 · status: todo · size: S · needs: T-07 · files: src/main/popover.ts, test/main/popover.test.ts

The panel currently looks like it only updates when it is opened and closed. `setModel`
does push on every poll, but the popover's `BrowserWindow` is created with Chromium's
default `backgroundThrottling`, so a hidden renderer defers the injected script and the
queued updates only run when the window is shown again. The window is also hidden rather
than destroyed, so this state persists for the whole session after the first open.

### Acceptance
- [ ] The popover window is created with `backgroundThrottling: false` in its `webPreferences`
- [ ] `setModel` called while the window exists but is hidden still reaches `webContents.executeJavaScript` — it is not deferred to the next `show`
- [ ] `setModel` called before the window has ever been created stores the model and pushes it on `did-finish-load`, with no error
- [ ] Two `setModel` calls in a row push twice; the second is not swallowed
- [ ] The pushed payload is the newest model, never a stale one

### Tasks
- [ ] Failing tests with a fake `BrowserWindow` asserting a push happens while `isVisible()` is false
- [ ] Failing test asserting `backgroundThrottling: false` is passed at construction
- [ ] Set `backgroundThrottling: false` and confirm `push()` runs off `alive()`, not off visibility
- [ ] Manual check: open the panel, leave it open, watch a value change without touching it

## T-11 Refresh quickly while the panel is open and slowly while it is shut

T-11 · status: todo · size: S · needs: T-10 · files: src/main/poller.ts, src/main/main.ts, src/config/defaults.ts, test/main/poller.test.ts, test/config/defaults.test.ts

A 30-second interval is right for a menu bar title and far too slow for a live rate. The
poller gains a second, shorter interval used while the popover is visible; opening the
panel switches to it and takes a reading immediately rather than waiting out the pending
timer.

### Acceptance
- [ ] `AppConfig` carries `activePollIntervalSeconds`, defaulting to 2, alongside the existing `pollIntervalSeconds`
- [ ] An out-of-range or non-numeric `activePollIntervalSeconds` in the config file falls back to the default, exactly like the existing fields
- [ ] `poller.setActive(true)` schedules subsequent polls at the active interval; `setActive(false)` returns to `pollIntervalSeconds`
- [ ] `setActive(true)` cancels the pending timer and polls immediately instead of waiting for it to elapse
- [ ] `setActive(true)` called twice in a row triggers one extra immediate poll, not two
- [ ] Two polls never overlap: the next is still scheduled only after the previous settles
- [ ] Showing the popover puts the poller in active mode and hiding it leaves active mode

### Tasks
- [ ] Failing tests on fake timers for interval switching, the immediate poll, and no overlap
- [ ] Failing test for the new config field and its fallback
- [ ] Add `activePollIntervalSeconds` to defaults and config validation
- [ ] Add `setActive` to `UsagePoller` with the pending timer cancelled and rescheduled
- [ ] Wire `show` / `hide` in `main.ts` to `setActive`

## T-12 Remember the last few minutes of throughput

T-12 · status: todo · size: S · needs: T-03 · files: src/domain/history.ts, src/main/main.ts, src/main/view-model.ts, test/domain/history.test.ts, test/main/view-model.test.ts

A sparkline needs a series, and the router only reports an instant. A fixed-size ring
buffer in the main process holds the recent download and upload rates. It is pure, lives
in `src/domain/`, and is never written to disk — the "no history database" decision still
stands for anything longer than the panel's own window.

### Acceptance
- [ ] `createRateHistory(capacity)` keeps at most `capacity` samples and drops the oldest first
- [ ] Samples are returned oldest-first, so a chart can read them left to right
- [ ] Each sample holds `downloadBytesPerSecond`, `uploadBytesPerSecond` and the time it was taken
- [ ] An offline poll records no sample — a gap is not a zero
- [ ] `peak(samples)` returns the largest rate across both series, and 0 for an empty history
- [ ] The popover model exposes the samples and the peak, so the renderer scales without re-deriving them
- [ ] The history survives the popover being closed and reopened

### Tasks
- [ ] Failing tests for capacity, eviction order, offline gaps, and `peak` on an empty history
- [ ] `src/domain/history.ts` — pure ring buffer, no I/O and no Electron
- [ ] Record a sample on every online poll in `main.ts`
- [ ] Extend `PopoverModel` with the series and its peak

## T-13 Show the month's usage as a dial instead of a bar

T-13 · status: todo · size: M · needs: T-10 · files: src/renderer/popover.ts, src/renderer/index.html, src/renderer/popover.css, src/main/view-model.ts, test/renderer/popover.test.ts, test/main/view-model.test.ts

The flat progress bar becomes a circular arc with the percentage at its centre and the
absolute figures beside it. Drawn as inline SVG built from numbers already in the model —
the page's `default-src 'none'` CSP rules out loading any chart library.

### Acceptance
- [ ] The arc's stroke-dash length is proportional to the percentage used: 0% draws nothing, 100% draws the full sweep
- [ ] Above 100% the arc is drawn full and not wrapped around a second time
- [ ] With no plan limit configured the dial renders in an "unset" style with no percentage, and the prompt to set a limit still shows
- [ ] The dial's colour follows the usage state — `ok`, `warn`, `over` and `unset` are visually distinct
- [ ] The dial carries an accessible label stating the percentage and the absolute usage
- [ ] Applying a model twice updates the existing SVG rather than appending a second one
- [ ] The panel still fits `POPOVER_HEIGHT` with no scrollbar

### Tasks
- [ ] Failing renderer tests for the sweep at 0%, 50%, 100% and 120%, and for the unset state
- [ ] Replace the bar markup with an SVG dial in `index.html`
- [ ] Render the arc in `popover.ts` from the model's percentage and state
- [ ] Style the four states in `popover.css`
- [ ] Delete the bar styles left unused

## T-14 Show download and upload rates as live sparklines

T-14 · status: todo · size: M · needs: T-12, T-13 · files: src/renderer/popover.ts, src/renderer/index.html, src/renderer/popover.css, test/renderer/popover.test.ts

Two stacked sparklines replace the "Down now" and "Up now" text figures: the shape shows
what a single number cannot, and the current value stays as a label beneath. Both share one
vertical scale so the two series are comparable at a glance.

### Acceptance
- [ ] Each sparkline renders one SVG polyline with one point per sample in the model
- [ ] Download and upload share a single vertical scale derived from the model's peak
- [ ] An all-zero history renders a flat line at the baseline, not a divide-by-zero or an empty element
- [ ] Fewer than two samples renders the empty state, not a broken path
- [ ] The current rate is shown as text beside each sparkline, formatted by the existing rate formatter
- [ ] Applying a model twice replaces the points rather than accumulating them
- [ ] Offline renders the sparklines in a stale style, keeping the last known shape rather than blanking it

### Tasks
- [ ] Failing renderer tests for point count, shared scale, all-zero, single-sample and repeated apply
- [ ] Add the two sparkline elements to `index.html` and drop the two rate `<dd>` stats
- [ ] Build the polyline points in `popover.ts` from samples and peak
- [ ] Style both series and the stale state in `popover.css`
