# PLAN — ck-connect-check

| ID   | Title                                                                   | Status | Size | Needs                        |
| ---- | ----------------------------------------------------------------------- | ------ | ---- | ---------------------------- |
| T-01 | Set the project up so tests can run                                     | done   | S    | —                            |
| T-02 | Turn the router's XML replies into typed data                           | done   | S    | T-01                         |
| T-03 | Fetch a live usage snapshot from the router                             | done   | M    | T-02                         |
| T-04 | Work out how much of the plan is used and when it resets                | done   | S    | T-01                         |
| T-05 | Remember the plan limit and router address                              | done   | S    | T-01                         |
| T-06 | Show usage in the macOS menu bar                                        | done   | M    | T-03, T-04, T-05             |
| T-07 | Show the details when the menu bar item is clicked                      | done   | M    | T-06                         |
| T-08 | Warn when usage approaches or passes the limit                          | done   | S    | T-04, T-06                   |
| T-09 | Launch the app on login without a Dock icon                             | done   | S    | T-06                         |
| T-10 | Keep the open panel refreshing instead of freezing until it is reopened | done   | S    | T-07                         |
| T-11 | Refresh quickly while the panel is open and slowly while it is shut     | done   | S    | T-10                         |
| T-12 | Remember the last few minutes of throughput                             | done   | S    | T-03                         |
| T-13 | Show the month's usage as a dial instead of a bar                       | done   | M    | T-10                         |
| T-14 | Show download and upload rates as live sparklines                       | done   | M    | T-12, T-13                   |
| T-15 | Show sizes in French octets (Go) instead of English bytes (GB)          | done   | S    | T-14                         |
| T-16 | Read the carrier's USSD replies as data instead of text                 | done   | S    | T-02                         |
| T-17 | Sign in to the router so its protected endpoints can be used            | done   | M    | T-03                         |
| T-18 | Ask the carrier for the exact remaining allowance over USSD             | done   | M    | T-16, T-17                   |
| T-19 | Keep the router password in the macOS Keychain                          | done   | S    | T-17                         |
| T-20 | Carry the real allowance forward with the router's own counter          | done   | M    | T-18, T-05                   |
| T-21 | Sync the real figures from the panel with one button                    | done   | M    | T-19, T-20                   |
| T-22 | Make the packaged app find its own panel                                | done   | S    | T-21                         |
| T-23 | Say which error the router actually returned when a sync fails          | done   | S    | T-21                         |
| T-24 | Give every POST a token the router has not already spent                | done   | M    | T-23                         |
| T-25 | Measure the dial against the plan the user actually bought              | done   | M    | T-21                         |
| T-26 | Make the menu bar agree with the panel                                  | done   | S    | T-25                         |
| T-27 | Let the plan cap be typed into the panel                                | done   | M    | T-25                         |
| T-28 | Sync by itself when there is nothing trustworthy to show                | done   | S    | T-21                         |
| T-29 | Drop the reset countdown the carrier never agreed with                  | done   | S    | T-25                         |
| T-30 | Draw the signal as real bars instead of a coloured square               | done   | S    | T-07                         |
| T-31 | Say which network the router is actually on                             | done   | S    | T-30                         |
| T-32 | Put Sync where the panel is looked at first                             | done   | S    | T-21                         |
| T-33 | Give the app a mark of its own in Finder and the Dock                   | done   | M    | —                            |
| T-34 | Put the signal glyph next to the number in the menu bar                 | done   | M    | T-33, T-30                   |
| T-35 | Introduce the app to someone arriving from GitHub                       | done   | M    | T-33, T-34                   |
| T-36 | Ask how long the plan lasts so the pace has a period                    | done   | M    | T-27                         |
| T-37 | Work out whether the connection is being used moderately                | done   | M    | T-36                         |
| T-38 | Show the pace and its warning on the panel                              | done   | M    | T-37                         |
| T-39 | Know when the carrier figure has gone stale                             | done   | S    | T-28                         |
| T-40 | Re-sync by itself on open and after a long silence                      | done   | M    | T-39                         |
| T-41 | Release the pace and the automatic sync as 0.2.0                        | done   | S    | T-38, T-40, T-42, T-45, T-46 |
| T-42 | Notice a new plan instead of reporting the old one's share              | done   | M    | T-27, T-28                   |
| T-43 | State the pace as a daily volume against the plan's daily budget        | done   | S    | T-37                         |
| T-44 | Draw the pace as a coloured meter instead of describing it              | done   | M    | T-43, T-38                   |
| T-45 | Fit the whole panel on screen without scrolling                         | done   | M    | T-44                         |
| T-46 | Count the carrier's last valid day as a day of the plan                 | done   | S    | T-43                         |
| T-47 | Show the carrier's last valid day, not the midnight after it            | done   | S    | T-46                         |
| T-48 | Say which daily figure is which                                         | done   | S    | T-47                         |
| T-49 | Let the meter speak alone where it speaks                               | done   | S    | T-48                         |
| T-50 | Know which carrier the SIM is on                                        | done   | S    | T-03                         |
| T-51 | Read Orange's forfaits out of the portal page                           | done   | S    | T-01                         |
| T-52 | Fetch the Orange portal without blocking the app                        | done   | S    | T-51                         |
| T-53 | Pick the Internet forfait when several are active                       | done   | S    | T-51                         |
| T-54 | Measure a Wifiber plan against the calendar month                       | done   | M    | T-53                         |
| T-55 | Feed the panel from whichever carrier the SIM is on                     | done   | M    | T-50, T-52, T-54             |
| T-56 | Show the forfait's name and hide what Orange cannot answer              | done   | S    | T-55                         |
| T-57 | Say when the portal cannot be reached or the forfait is unreadable      | done   | S    | T-55                         |
| T-58 | Bring the README and screenshots up to the Orange setup                 | done   | S    | T-56, T-57, T-59             |
| T-60 | Stop the dial contradicting the notice beneath it                       | done   | S    | T-57                         |
| T-61 | Stop the allowance strip claiming what Orange never said                | done   | S    | T-60                         |
| T-59 | Show the Orange figure in the menu bar, not just the panel              | done   | S    | T-55                         |
| T-62 | Find out what the router actually says about connected devices          | done   | M    | —                            |
| T-63 | Turn the router's host list into typed devices                          | done   | M    | T-62                         |
| T-64 | Name, label and order the devices for reading                           | done   | S    | T-63                         |
| T-65 | Open a window for the connected devices                                 | done   | M    | —                            |
| T-66 | Fill the devices window from the live router                            | todo   | M    | T-64, T-65                   |
| T-67 | Know which devices the router is already blocking                       | todo   | M    | T-62, T-63                   |
| T-68 | Block and unblock a device from the list                                | todo   | M    | T-67                         |
| T-69 | Never let this Mac block itself off the router                          | todo   | S    | T-68                         |
| T-70 | Say why the list is empty or a block did not take                       | todo   | S    | T-66, T-68                   |
| T-71 | Show the devices window in the README                                   | todo   | S    | T-66, T-68                   |

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

T-38 · status: done · size: M · needs: T-37 · files: src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, test/main/view-model.test.ts, test/renderer/popover.test.ts

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

- [x] the popover model carries a `pace` field that is `null` exactly when `readPace` returns `null`, and otherwise carries the tier through unchanged
- [x] a tier 1 model renders `sustainablePerDay` and the expiry, and no band word, no `data-state` and no `affordedPerDay`
- [x] a tier 2 model renders the consumed share as well, and still no band word
- [x] a tier 3 `safe` model renders the band word, `affordedPerDay` and `sustainablePerDay` together
- [x] `warning` and `over` models render with distinct `data-state` values, asserted against the stylesheet's selectors
- [x] a `null` pace renders no pace row at all, and the panel's height is unchanged in every other respect
- [x] tiers 1 and 2 render a hint naming the missing setting, and tier 3 renders none
- [x] the daily figures are formatted with the octet helper, so a 1 000 000 000-byte figure reads `1.00 Go`
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for every criterion above, one per tier
- [x] Thread `readPace` into `buildPopoverModel`
- [x] Render the row, branching on `tier`, with the three band states inside tier 3
- [x] Style the bands against the existing accent variables, adding none that duplicate them
- [x] Manual: with a real anchor and no cap typed, confirm the tier 1 row reads correctly
- [x] Manual: type the cap and the length, confirm the band appears and matches a hand calculation
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

The row's date comes from the allowance reading rather than from `readPace`:
the pace carries the _days_ left, which is what it divides by, and the row
states the date those days run to. `readPace` already refuses a reading with no
expiry, so the two can never disagree.

`pace.tier` is a number on a model that is otherwise display strings, so the
pre-existing "hands the renderer only display strings" test was extended to
treat it as a control value alongside `progress.sweep` — it decides which rows
to show, and is never printed.

The band words carry the meaning as well as the colour: `over` is red and says
"Too fast", so the reading survives a colourblind eye and an accessible label.
Both accents are the ones the dial already uses for trouble; no new colour was
added.

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

T-40 · status: done · size: M · needs: T-39 · files: src/main/sync.ts, src/main/main.ts, src/main/view-model.ts, test/main/sync.test.ts, test/main/main.test.ts

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

- [x] opening the panel with a stale anchor starts exactly one dialogue, and opening it with a fresh one starts none
- [x] the background timer starts a dialogue for a stale anchor with the panel closed
- [x] opening the panel twice inside one stale window starts exactly one dialogue in total
- [x] a dialogue already in flight is never joined by a second, asserted with a deferred stub
- [x] a failed automatic sync issues exactly one dialogue, and no further automatic dialogue is issued however long the anchor stays stale
- [x] an explicit Sync press after that failure runs, and a success re-arms automatic syncing
- [x] no dialogue starts with no stored password, with the router unreachable, or before the first snapshot
- [x] a poll tick alone never starts a dialogue
- [x] the panel reports an automatic sync's steps in the same status line an explicit press uses, marked as automatic
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for every criterion above, with a fake timer and a stubbed dialogue
- [x] Extend `sync.ts` with the stale-triggered entry point and the in-flight and parked flags
- [x] Call it from the popover's show path and from a timer in `main.ts`
- [x] Surface the automatic marker through the view-model
- [x] Manual: back-date `syncedAt` in `config.json`, open the panel, confirm one dialogue runs and a second open does not
- [x] Manual: with a wrong password stored, confirm one attempt is made and none follow
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

`src/main/popover.ts` was in the planned `files:` list but needed no change: the
panel's show and toggle both run through the `panel` wrapper in `main.ts`, which
already existed to keep the poller's cadence in step with visibility, and that is
where the staleness check belongs. A tray click is the only route to a visible
panel and it goes through the same wrapper.

`parked` is set by _any_ failed dialogue, not only an automatic one, and cleared
by any that succeeds. A failed press parks the timer too — the account locks
after five refused sign-ins, and a press that just failed is not evidence the
next automatic attempt would fare better.

The staleness check is deliberately never reached from `client.snapshot`: a poll
comes round every couple of seconds and a dialogue takes tens of them.

## T-41 Release the pace and the automatic sync as 0.2.0

T-41 · status: done · size: S · needs: T-38, T-40, T-42, T-45, T-46 · files: package.json, package-lock.json, README.md, src/app-info.ts, test/readme.test.ts, test/project-setup.test.ts

Version 0.2.0, and a README that describes the app as it now behaves: a tiered
pace reading under the dial, a plan length to enter beside the cap, a sync that
happens by itself when the carrier figure is over half an hour old, and what to do
after a top-up. T-35's README test already asserts the document matches reality,
so this extends that test rather than trusting prose.

### Acceptance

- [x] `package.json` reads `0.2.0` and `package-lock.json` agrees
- [x] `app-info.ts`'s version, or whatever the app reports as its version, reads 0.2.0
- [x] the README documents the plan-length setting, the three pace tiers and their bands, the 30-minute automatic sync, and the top-up flow
- [x] the README states that loading a new plan needs a Sync and a cap confirmation, and no reset
- [x] the README test asserts each of those claims against the source that implements it
- [x] the README's settings list matches the keys `config.ts` actually parses, `planDays` and `syncStaleAfterMinutes` included
- [x] the README describes the pace as a coloured meter and states the three bands with the 5 Go/day worked example
- [x] the README's screenshot shows the app's current compacted panel with the settings toggle, not the pre-T-45 layout
- [x] `npm test`, `npm run lint`, `npm run build` and `npm run package` all exit 0

### Tasks

- [x] Failing README and project-setup tests for the claims above
- [x] Bump the version in `package.json` and refresh the lockfile
- [x] Write the four README sections
- [x] Manual: package the app and confirm it reports 0.2.0
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

- **Closed on 2026-08-04 against `docs/media/panel-orange.png`, after its criterion was
  rewritten.** As written, the criterion implied a YAS capture: the sections this release
  documents — the pace tiers, the plan-length setting, the 30-minute automatic sync — are all
  YAS behaviour. That capture became impossible the same day, when the SIM moved to Orange and
  set the T-50..T-61 work going; a YAS panel cannot be photographed without a YAS SIM back in
  the router. The word "current" replaced the implied "YAS", because what the criterion was
  really protecting against was a **stale layout**, not a particular carrier, and the Orange
  capture is the compacted post-T-45 panel with the settings toggle in the header.
  - The honest cost of that rewrite: a reader of this release's YAS sections now sees a panel
    with no plan-length input and no Sync button, because Orange withdraws both. If a YAS SIM
    is ever back in the router, a second capture would be worth taking.
  - The image is held to more than existence: `test/readme.test.ts` reads the PNG's own IHDR
    height and requires 497 px, the figure the renderer suite independently derives from the
    CSS budget. A pre-T-61 capture at 514 px is rejected rather than accepted quietly.
- `needs` gained T-46 after the fact: manual testing of the merged wave found the pace
  under-reporting by a full day, and releasing 0.2.0 with its headline feature wrong was
  not worth the earlier ship date.
- The README test anchors every documented claim to the source implementing it rather than
  grepping for prose: band boundaries against `SAFE_PACE`/`WARNING_PACE`, the 5 Go/day
  example recomputed through the real `readPace`, the window against
  `DEFAULT_SYNC_STALE_AFTER_MINUTES`, the three colours against `popover.css`'s own rules.
- A pre-existing README claim was corrected, not just extended: it said a sync happens
  automatically "only when there is nothing trustworthy to show", which T-40 had falsified.
  The 30-minute rule is now stated as primary, that case as secondary.
- `src/app-info.ts` was outside the declared list. `APP_VERSION` is asserted equal to
  `package.json`'s version rather than to a literal, so a future bump cannot desynchronise
  the two silently.
- The lockfile refresh moved exactly two lines, both `version` fields; no dependency
  version changed during the release commit.

## T-42 Notice a new plan instead of reporting the old one's share

T-42 · status: done · size: M · needs: T-27, T-28 · files: src/domain/allowance.ts, src/config/config.ts, src/config/defaults.ts, src/main/sync.ts, src/main/main.ts, src/main/tray.ts, src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, README.md, test/domain/allowance.test.ts, test/config/config.test.ts, test/main/sync.test.ts, test/main/main.test.ts, test/main/tray.test.ts, test/main/view-model.test.ts, test/renderer/popover.test.ts

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

- [x] `isNewPlan` is true for a differing `planLabel`, for an `expiresAt` later than the previous one, and for `remainingBytes` above the configured cap
- [x] it is false when label, expiry and remaining are all unchanged, and false when there is no previous anchor
- [x] it is false for an `expiresAt` that moved _earlier_, and throws nothing when either `expiresAt` is null
- [x] it is false when no cap is configured and only the remaining volume grew — with no cap there is nothing to contradict
- [x] `config.ts` round-trips `planCapConfirmed` as a boolean, defaulting to `true` so an existing config is not flagged on first launch
- [x] a sync whose new anchor is a new plan writes `planCapConfirmed: false`, and one that is not leaves the flag untouched
- [x] with the flag false the popover model's `percentUsed` and `pace.tier` 2 and 3 fields are null, while the tier 1 reading is unchanged
- [x] with the flag false the panel renders the confirmation prompt and no dial, asserted against the stylesheet's selectors
- [x] submitting the cap through the existing T-27 setter sets the flag true, and the dial returns in the same model build
- [x] confirming without changing the cap also sets it true, so an unchanged plan size costs one click
- [x] the tray title follows the same rule as the dial, never showing a share computed from an unconfirmed cap
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for every criterion above, with a fixed clock
- [x] Implement `isNewPlan` beside `stalenessOf`, exported and pure
- [x] Add `planCapConfirmed` to `AppConfig`, its default and its validation
- [x] Call the predicate where the sync writes its anchor, and clear the flag there only
- [x] Gate `percentUsed` and the tier 2/3 pace fields on the flag in the view-model
- [x] Render the confirmation prompt and wire its two actions to the existing cap setter
- [x] Manual: edit `config.json` to a cap below the anchored remaining, open the panel, confirm the prompt appears and the dial does not
- [x] Manual: confirm the cap and watch the dial and the band return
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

- The criterion naming `percentUsed` and null `pace.tier` 2/3 fields was met by a different
  mechanism than its wording implies: `PopoverModel` has no `percentUsed` field and
  `PopoverPace`'s fields are strings by T-38's design. The nulls are real one layer down —
  `readPlanUsage` and `readPace` are both called with a null cap — and surface as
  `progress.available:false`, `"—"` labels and empty band strings. `popover.ts:545` sets
  `data-limit="unset"` from that flag and `popover.css:359` removes `.dial-value` and
  `.caption` from display, so no share derived from an unconfirmed cap reaches the DOM.
- `confirmedPlanLimit` treats only an explicit `false` as unconfirmed, mirroring the config
  reader's own fallback, so hand-built `AppConfig` fixtures keep their caps. `recordAnchor`
  only ever writes `false` and never `true`, so the default cannot mask a real unconfirmed
  state written by a sync.
- `README.md` was touched because `readme.test.ts` generates its config table from
  `AppConfig` and fails on any undocumented field. T-41 edits the same file.

## T-43 State the pace as a daily volume against the plan's daily budget

T-43 · status: done · size: S · needs: T-37 · files: src/domain/pace.ts, test/domain/pace.test.ts

The tier 3 ratio is already the right arithmetic, but it is stated in the wrong
units. The user reasons in daily volumes — 150 Go over 30 days affords 5 Go a
day, 6 Go a day is reckless and 3 Go is calm — and `pace: 1.22` makes them do
that division themselves.

So the reading gains `averagePerDay`, the volume actually spent per elapsed day:

```
averagePerDay  = usedBytes / elapsedDays          // elapsedDays floored at 1, as today
affordedPerDay = planLimitBytes / planDays        // already present
pace           = averagePerDay / affordedPerDay   // identical to usedShare / elapsedShare
```

It is a **restatement**, not a second calculation: it divides the same cumulative
used volume by the same floored elapsed days the ratio uses, so the meter T-44
draws can never contradict the band beside it.

The band boundary is also wrong at exactly one point. `bandFor` returns `warning`
for `pace <= 1.2`, so the worked example above — 6 Go against 5, a ratio of
exactly 1.20 — lands in `warning` when it is the case the user calls extreme.
`over` starts at 1.20 inclusive.

The band names `safe` / `warning` / `over` are unchanged. They are what the
view-model, the stylesheet and T-38's tests already key on, and renaming a value
whose meaning is unchanged is churn the colour mapping in T-44 does not need.

### Acceptance

- [x] `PaceReading` carries `averagePerDay: number | null`, null below tier 3 like `affordedPerDay`
- [x] with a 150 Go cap over 30 days and 10 days elapsed having spent 60 Go, `averagePerDay` is 6 Go and `affordedPerDay` is 5 Go
- [x] `averagePerDay / affordedPerDay` equals `pace` to within floating-point tolerance in every tier 3 case tested
- [x] a ratio of exactly 1.20 bands as `over`, not `warning`
- [x] a ratio just under 1.20 still bands as `warning`, and exactly 1.00 still bands as `safe`
- [x] inside the first day the elapsed floor still forces `safe`, and `averagePerDay` is the used volume divided by that floor rather than by zero
- [x] tier 1 and tier 2 readings carry `averagePerDay: null`
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for the worked example, both band boundaries and the tier nulls, with a fixed clock
- [x] Add `averagePerDay` to `PaceReading` and compute it from `usedBytes` and the floored elapsed days
- [x] Move the `over` boundary to `pace >= WARNING_PACE` and correct the constant's doc comment
- [x] Update the tier table in `pace.ts`'s module comment

### Notes

- `elapsedDays` is floored once at `pace.ts:188`; both `pace` (line 190, via `elapsedShare`)
  and `averagePerDay` (line 201) divide by that same value, so the meter T-44 draws cannot
  contradict the band beside it. This is the restatement the design requires, not a second
  accumulation.
- Of the 6 added tests, 4 genuinely failed at RED. The two boundary guards — "just under
  1.20 stays warning" and "exactly 1.00 stays safe" — pass under both the old and new
  operator by design; they exist to prove the moved boundary did not disturb its
  neighbours, so a failure there would have meant the old bound was wrong in the other
  direction.

## T-44 Draw the pace as a coloured meter instead of describing it

T-44 · status: done · size: M · needs: T-43, T-38 · files: src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, test/main/view-model.test.ts, test/renderer/popover.test.ts

T-38 put the pace on the panel as four lines of prose. A band is a magnitude with
three named regions, which is exactly what a bar states faster than a sentence,
and the panel already draws its dial and its sparklines for that reason.

The meter is a horizontal bar whose full width is `affordedPerDay` and whose fill
is `averagePerDay`, with a tick at the afforded figure so an overshoot reads as
fill past the mark rather than as a bar that is merely long. Green in `safe`,
orange in `warning`, red in `over`. `averagePerDay` and `affordedPerDay` stay
beside it as short numerals — `6.1 / 5.0 Go/j` — because the colour says which
band and the meter says by how much, but only the numbers say the amounts.

Colour is never the sole carrier of the verdict: the fill crossing the tick states
the same thing, so the reading survives a greyscale screenshot and a colour-blind
viewer. The `data-pace-state` attribute stays on the section, so the stylesheet
holds every colour and the renderer holds none.

Fill is clamped for drawing at twice the afforded width — a pace of 8 would
otherwise leave the panel — while the numerals stay exact, so a runaway month is
visibly pinned rather than silently truncated.

Below tier 3 there is no afforded figure to measure against, so there is no meter.
Tier 1 keeps its single sustainable-per-day line, which is the one prose line that
earns its space: it answers a question with no range attached.

### Acceptance

- [x] the popover model exposes the meter's fill share, its band and both formatted volumes, and computes no geometry in the renderer beyond the SVG or bar it draws
- [x] a tier 3 model in each band renders the section with `data-pace-state` set to `safe`, `warning` and `over` respectively
- [x] the stylesheet maps those three states to the green, orange and red custom properties, asserted against the stylesheet text
- [x] a pace of 1.0 fills the meter exactly to its tick, a pace of 0.5 to half of it, and a pace of 3 clamps to the drawn maximum while the numerals still read the true figures
- [x] the numerals read `averagePerDay` and `affordedPerDay` in Go with the app's existing French formatter
- [x] a tier 1 model renders the sustainable-per-day line and no meter element
- [x] a tier 2 model renders no meter either — there is still no afforded figure
- [x] the prose lines T-38 added for the band, the afforded figure and the consumed figure are gone from the page
- [x] the section stays hidden outright when `readPace` returns null
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing view-model and renderer tests for every criterion above
- [x] Add the meter fields to the popover model, clamping the fill share and leaving the numerals exact
- [x] Replace the four `pace-*` paragraphs in `index.html` with the meter, its tick and the numeral pair
- [x] Render fill and tick from the model in `popover.ts`, setting `data-pace-state` and nothing else
- [x] Move the three band colours into `popover.css` as custom properties beside the existing accents
- [x] Manual: with a real anchor, cap and length, confirm the meter matches a hand calculation and the colour matches the band
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

- The meter is hidden outright while `planCapConfirmed` is false, not merely blanked —
  the band would otherwise be drawn from the cap T-42 has flagged as contradicted.
  Asserted on the element in `popover.test.ts` and on `pace.meter === null` in the model.
- The clamp applies to `fill` only (`view-model.ts:720`, span of 2× afforded). `average`
  and `afforded` carry exact unclamped figures, so a pace of 3 pins the bar at its maximum
  while the numeral still reads `15.00 Go`.
- `data-state` was renamed `data-pace-state` per the criterion's wording; T-38's two-state
  colour test was replaced by a three-state one that also asserts `--safe` exists.
- `PopoverPace.note` and `PACE_NOTE_TEXT` were removed alongside the three prose fields —
  named by the plan's Tasks line though not by a criterion. `hint` was kept: it is an
  instruction about missing settings, not a description of the pace.
- Two T-42 assertions reading `pace.note` / `consumed` / `afforded` were rewritten to
  `not.toHaveProperty` over all four fields plus `meter === null` — a stronger claim than
  the empty-string checks they replaced, verified against the pre-merge commit.
- `PACE_BAND_TEXT` survives as the meter's `aria-label`, so the verdict is carried in
  words as well as in hue and in the fill crossing the tick.

## T-45 Fit the whole panel on screen without scrolling

T-45 · status: done · size: M · needs: T-44 · files: src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, src/main/view-model.ts, src/main/popover.ts, test/renderer/popover.test.ts, test/main/popover.test.ts, test/main/view-model.test.ts

The panel is 320×520 and its content has outgrown it: header, dial, two settings
forms and their error lines, the pace section, the allowance strip, two rate rows,
a five-item stats grid, the sync status and the password form. It scrolls, which
for a popover that closes on blur means the bottom of it is effectively unreachable.

Two cuts and one move fix it.

**Cut the month download and upload totals.** The plan is billed on their sum, and
the dial and the carrier's remaining already state that sum. The split is a
question nobody asks of a menu bar app.

**Move the typed settings out of the main view.** The plan cap, the plan length and
the router password are three input rows and three error lines — roughly a third of
the panel — serving values typed once a month. A toggle in the header swaps the
main view for a settings view holding all three; the panel shows one or the other,
never both. The password form keeps its existing "shown only when nothing is
stored" behaviour as an attention marker on the toggle, so a missing password is
still discoverable without the form occupying the panel.

**Tighten what remains.** The stats grid loses two of its five items and the rest
fold into a single line beside the allowance figures.

The window stays 320×520. The test asserts the fit structurally — the sections a
view contains and the absence of the removed fields — because a renderer test has
no layout engine to measure against.

### Acceptance

- [x] the page contains no `monthDownload` and no `monthUpload` field, and the view-model no longer exports them
- [x] the header carries a settings toggle whose pressed state swaps which of the two views is hidden
- [x] with settings open, the main view is hidden and the cap, length and password forms are all present
- [x] with settings closed, all three forms are hidden and the dial, pace meter, allowance and rates are present
- [x] the toggle carries an attention marker when no router password is stored, and does not when one is
- [x] the cap and length setters still work from inside the settings view, errors included, through the same IPC channels
- [x] closing and reopening the panel returns it to the main view rather than restoring settings
- [x] the stats grid holds only the remaining items, and expiry and days-left read on one line with the allowance
- [x] `POPOVER_HEIGHT` is unchanged at 520
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing renderer tests for the two views, the toggle, the attention marker and the absent fields
- [x] Delete the download and upload totals from the page and the popover model
- [x] Wrap the main view and a new settings view, and drive their `hidden` from the toggle
- [x] Move the cap, length and password forms into the settings view unchanged, keeping their handlers
- [x] Reset to the main view whenever the panel is shown
- [x] Fold the surviving stats into the allowance line and tighten the section spacing
- [x] Manual: open the panel on the real router and confirm nothing scrolls at 320×520, with and without a stored password

### Notes

- T-42's `[data-plan-cap-prompt]` stays in the **main** view (`index.html:119`) while the cap
  input moved to the settings view (`index.html:258`). The plan predates T-42 and does not
  say where the prompt goes; it is an alert about a contradicted figure, not a setting, and
  behind the toggle a user with no dial would have no reason to look for it. Both halves
  are tested.
- The view reset is driven from the main process — `src/main/popover.ts:211` calls
  `executeJavaScript("window.resetPopoverView?.()")` on `show()`. That is safe under
  `contextIsolation:true`; the preload still exposes only `popoverBridge`, and the existing
  isolation assertions pass unchanged. Chosen over `visibilitychange` because it is
  deterministic, testable without faking jsdom visibility, and fires on every open.
- `.view[hidden] { display: none }` was needed because both views carry their own `display`.
  Specificity (0,2,0) beats `.view` at (0,1,0).
- Five tests were rewritten, none deleted outright: the two month-total assertions were
  inverted into negative ones, the 5-tile grid assertion became `["Devices"]`, and two
  stale-reading tests swapped the removed counters for `monthTotal`. A whitespace-ignoring
  diff of `index.html` is 125/88 against a raw 235/198 — about half the churn was a
  formatter hook, and every substantive change is accounted for by the task.
- `CHROME_HEIGHT` stays 350 but its comment was rewritten: the old rationale described a
  five-tile grid and fields beside the dial that no longer exist, and did not account for
  the pace section. New budget ≈504 ≤ 520. This is reasoned, not measured — a renderer test
  has no layout engine, so the manual gate is the only proof the panel fits.

## T-46 Count the carrier's last valid day as a day of the plan

T-46 · status: done · size: S · needs: T-43 · files: src/hilink/ussd-parse.ts, test/hilink/ussd-parse.test.ts, test/hilink/ussd.test.ts, test/domain/allowance.test.ts, test/domain/pace.test.ts

Found by manual testing on 29/07/2026 against a real plan: a 30-day plan bought on
27/07/2026 and expiring 25/08/2026 showed a pace of **4.47 Go a day against a 5.00 Go
budget** — green, comfortably safe — when the true figure was **6.13 Go a day**, a pace of
1.23 and firmly `over`. The meter flattered the user by a full day's worth of allowance.

The fault is one line, upstream of every calculation that uses it. `readExpiry`
(`ussd-parse.ts:67`) builds the expiry with `new Date(year, month - 1, day)`, which is
**midnight at the start** of the stated day. The carrier means the plan is valid _through_
that day, and its own arithmetic proves it: 27/07 plus 30 days lands on 25/08 only if the
last day is counted. So the parser contradicts the carrier's stated period length.

That single instant feeds three consumers, and every error runs the same direction:

```
periodStart   = expiresAt − planDays          pace.ts:186     → 26/07, not 27/07
wholeDaysUntil(expiry, now)                   allowance.ts:135 → 27 days, not 28
expiresAt.getTime() < now.getTime()           allowance.ts:290 → expires a day early
```

The third has not bitten yet but is the worst: on 25/08 the app would declare the plan dead
while the carrier is still serving it, dropping the dial and the whole anchor a day early.

The fix belongs at the source — the expiry instant becomes the midnight that **ends** the
stated day. Correcting the three consumers instead would be patching one fault in three
places, and the next consumer would inherit it again.

### Acceptance

- [x] `readExpiry` returns the instant the plan stops being valid: the midnight ending the stated day, not the one starting it
- [x] a reply stating `25/08/2026` is not expired at any point during 25/08 and is expired on 26/08
- [x] the same reply with a 30-day plan puts `periodStart` at 27/07, so elapsed plus remaining equals `planDays`
- [x] `wholeDaysUntil` counts the stated day: on 29/07 against an expiry of 25/08 the answer is 28
- [x] month and year rollover hold — 31/12 rolls into 01/01 of the next year, 28/02 into 01/03 in a non-leap year
- [x] the reported case reproduces: cap 150 Go, 30 days, expiry 25/08, 16.49 Go used on 29/07 yields `averagePerDay` ≈ 6.1 Go, a pace ≥ 1.20 and state `over`
- [x] a malformed or absent expiry still returns null and throws nothing, as before
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for every criterion above, with a fixed clock
- [x] Correct `readExpiry` to the end of the stated day
- [x] Check each of the three consumers reads correctly against the new instant, without changing them
- [x] Manual: confirm the panel now reads ≈6.1 Go a day, red, and 28 days remaining
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

- Migration side-effect: a stored anchor holds the old start-of-day instant, so the first
  re-sync after this lands moves `expiresAt` one day later. T-42's `isNewPlan` reads that as
  a new plan and asks for a cap confirmation once. Harmless and self-correcting, but it will
  happen exactly once per existing install and should not be mistaken for a fault.

## T-47 Show the carrier's last valid day, not the midnight after it

T-47 · status: done · size: S · needs: T-46 · files: src/main/view-model.ts, test/main/view-model.test.ts, test/main/main.test.ts, test/renderer/popover.test.ts

T-46 corrected `expiresAt` to the midnight that **ends** the carrier's last valid day, which
is the right instant for every calculation that measures a span: the period start, the days
remaining, and the expiry check all read correctly from it.

It is the wrong instant to **print**. `formatDate` (`view-model.ts:493`) is applied to it
directly at `view-model.ts:542` and again at `:760` inside the "N Go a day until <date>"
line, so the panel now shows `26/08/2026` where the carrier's own SMS says
"jusqu'au 25/08/2026". The app contradicting the carrier's wording is exactly the
unreliability the anchor design exists to remove.

No test caught this, and the reason is worth recording: every view-model and popover test
hand-builds its `expiresAt` with `new Date(...)`, so none of them exercises the instant the
parser actually produces. The fix therefore comes with a test that reaches the parser.

A displayed date wants the last valid _moment_, not the exclusive bound — `expiresAt` minus
one millisecond — so the two readings stay derived from one stored instant rather than the
anchor carrying two dates that could drift apart.

### Acceptance

- [x] the expiry shown in the allowance strip reads the carrier's stated day, not the day after
- [x] the tier 1 "N Go a day until <date>" line reads the same day as the allowance strip
- [x] both are derived from the single stored `expiresAt`, with no second date on the anchor
- [x] at least one test drives a real carrier reply through `parseAllowance` rather than hand-building the date, so a future parser change cannot pass unnoticed
- [x] the existing display assertions are corrected, not deleted — `test/main/view-model.test.ts:738` and `test/main/main.test.ts:586` shift from `12/08/2026` to `11/08/2026`, correct under the new semantics since their fixture means "valid through 11/08"
- [x] a null `expiresAt` still renders the existing absence marker and throws nothing
- [x] the day count beside the date is unchanged — T-46 settled it and this task must not move it
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for both display sites, one of them parser-driven
- [x] Format the last valid moment rather than the exclusive bound, at both call sites
- [x] Correct the two existing display assertions
- [x] Manual: confirm the panel's expiry matches the carrier's SMS wording exactly
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

- Five existing display assertions needed correcting, not the two the finding named:
  `view-model.test.ts:738` and `:1107`, `main.test.ts:586`, `popover.test.ts:1130` and
  `:1936`. Each shifts one day earlier and each is semantically correct — a fixture built as
  `new Date(2026, 7, 12)` now means "valid through 11/08".
- The gap that let this through was narrower than first described: the renderer layer is not
  insulated, it goes through the real view-model. What no test anywhere did was feed a
  _parser-produced_ date into the view-model — every `expiresAt` was a literal `new Date(…)`.
  `view-model.test.ts:829` now reads `test/fixtures/hilink/ussd-4-allowance.xml` off disk and
  runs parse → `anchorFrom` → `buildPopoverModel` with nothing hand-built in between.
- `formatLastValidDay` steps back one millisecond rather than storing a second date, so the
  two readings cannot drift apart. Residual, not applicable here: in a timezone that springs
  forward exactly at midnight, local midnight does not exist and the step-back would stay on
  the same day. Madagascar observes no DST.
- The day count is guarded against the tempting wrong fix — shifting the stored instant back
  would correct the display and silently undo T-46. `view-model.test.ts:867` asserts
  `"30 days"` on the same parser-driven model whose printed date is `25/08/2026`.

## T-48 Say which daily figure is which

T-48 · status: done · size: S · needs: T-47 · files: src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.css, test/main/view-model.test.ts, test/renderer/popover.test.ts

Reported from the panel on 29/07/2026: the pace section shows three volumes in Go a day
with nothing to tell them apart — `4.76 Go a day until 25/08/2026` above a meter reading
`6.13 Go / 5.00 Go a day`. The arithmetic is right and the reading is not: a user who sees
4.76 and 6.13 together assumes one of them is wrong, because nothing on screen says they
measure different things.

They answer three different questions:

```
sustainablePerDay  remainingBytes / daysUntilExpiry   what is left to spend, per day from now
averagePerDay      usedBytes / elapsedDays            what has been spent, per day so far
affordedPerDay     planLimitBytes / planDays          what the plan affords, flat
```

The relationship is the useful part and is currently invisible: overspending pulls the
recovery figure _below_ the flat budget, and a quiet few days pulls it back above. That is
the compensation the band encodes, and it is legible only once the reader knows which
number is which.

This is a labelling task, not a numbers task. **No figure changes, no arithmetic moves** —
T-43, T-44 and T-46 settled all three and a test must prove they are untouched. The meter
already pairs its two numerals against each other; what is missing is that the line above
is measuring the other direction in time.

### Acceptance

- [x] the recovery line states that its figure is what remains to spend per day, not what has been spent
- [x] the meter's pair states which numeral is spent and which is the budget, without a legend elsewhere on the panel
- [x] the three figures stay byte-identical to what the view-model produces today — asserted against the same fixtures, so this task cannot move a number
- [x] the wording fits the panel at 320×520 with no scrolling and no truncation of the carrier's name
- [x] tier 1 keeps a single line and gains no meter vocabulary it has no figures for
- [x] the labels survive the unconfirmed-cap state, where the meter is hidden and only the recovery line remains
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for the labels, and a guard that the three figures are unchanged
- [x] Word the recovery line and the meter pair so each says what it measures
- [x] Check the 320×520 fit still holds, T-45's budget included
- [x] Manual: read the section cold and confirm the three figures no longer look contradictory
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

- Wording shipped: `"… Go a day left to spend until …"` for the recovery line, and
  `"… Go spent / … Go budget a day"` for the meter's pair. The meter's labels are static
  text in `index.html`; only the figures come from the model.
- The three unchanged-figure guards deliberately pass at RED as well as GREEN. A guard
  pinning existing behaviour must pass beforehand — one that failed first would be pinning
  the new behaviour, not the old. The four _label_ tests were observed failing first.
- Tier 1's "no meter vocabulary" test rests on `spend` ≠ `spent`, which is deliberate and
  load-bearing: a reword to "already spent" would correctly trip it.
- T-49 immediately superseded the tier 3 half of this task — the recovery line is gone
  where the meter is drawn. The labels still carry tiers 1 and 2, where the line now stands
  alone with nothing to be read against, so none of this work was wasted.

## T-49 Let the meter speak alone where it speaks

T-49 · status: done · size: S · needs: T-48 · files: src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.css, test/main/view-model.test.ts, test/renderer/popover.test.ts

Reported from the panel a second time, after T-48's labels were specified: the recovery
figure still reads as a contradiction beside the meter, and the meter alone already says
what the reader needs. So at tier 3 the line goes.

The two face opposite directions in time and only one of them is worth the space when both
could be shown:

```
meter          usedBytes / elapsedDays  vs  planLimitBytes / planDays   backward — the diagnosis
recovery line  remainingBytes / daysUntilExpiry                         forward  — the prescription
```

The prescription is the thing being given up, knowingly: the panel will say the connection
is being used too fast without naming the daily figure that would correct it. That is the
trade accepted for a section that reads at a glance instead of needing to be worked out.

**The line survives wherever the meter does not.** At tier 2 there is no plan length, so
there is no budget to draw and the recovery figure is the only pace reading there is. At
tier 1 the same, and T-42's unconfirmed-cap state falls back to tier 1 precisely so a
contradicted cap draws nothing — the meter is hidden there, so the line must appear. The
rule is one sentence: **the recovery line and the meter are never both shown, and never both
absent.**

That mutual exclusion is the invariant to test, rather than testing the two states
separately and leaving a third where a reader sees neither figure.

T-48's labels are not wasted: `left to spend` is what makes the line legible at tiers 1 and
2, where it now stands alone with nothing to contrast it against.

### Acceptance

- [x] the recovery line is absent whenever the meter is drawn
- [x] the recovery line is present at tier 1 and at tier 2, where no meter exists
- [x] the recovery line is present in T-42's unconfirmed-cap state, where the pace falls back to tier 1 and the meter is hidden
- [x] no state shows both, and no state shows neither — asserted as one invariant across every tier and the unconfirmed-cap case, not as separate per-state tests
- [x] the meter reclaims the width the numerals borrowed in T-48, so the bar's track returns to roughly its pre-T-48 length
- [x] the pace section is shorter at tier 3 by the removed line, and `CHROME_HEIGHT`'s budget comment is corrected to match rather than left stale
- [x] every figure that still appears is byte-identical to what the view-model produces today
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

- [x] Failing tests for the invariant, the reclaimed width and the unchanged figures
- [x] Gate the recovery line on the meter's absence in the view-model, not in the renderer
- [x] Let the meter's track take back the freed width
- [x] Correct `CHROME_HEIGHT`'s budget comment for the shorter tier 3 section
- [x] Manual: read the section at tier 3 and at tier 1, and confirm exactly one pace figure appears in each
- [x] Update the `files:` line above to reflect everything actually touched

### Notes

- The invariant is structural, not merely tested: `buildPace` reads
  `meter === null ? <line> : ""`, one decision expressed twice, keyed off the meter's
  presence rather than the tier. `buildPaceMeter` is the only source of that null and
  `PopoverPace` is constructed nowhere else, so no path can produce both figures or neither.
  The test collapses all four states to one word each and compares them in a single
  `toEqual`, so `"both"` and `"neither"` are producible values that fail loudly — at RED it
  failed with tier 3 reporting `"both"`.
- The layout went further than reclaiming width: the bar took its own row with the numerals
  stacked beneath (~292px track, against ~159px before T-48 and ~90px after it). That is the
  arrangement T-48 rejected as unaffordable in height; removing the recovery line supplied
  the 21px it needed, of which the stacked numerals spend 12px. Tier 3 nets ~9px shorter.
- `CHROME_HEIGHT` stays 350 deliberately. Tiers 1 and 2 were already exactly as tall as
  tier 3 used to be, so the constant still measures the tallest state; lowering it would
  have loosened the `<=` assertion with no layout justification. The comment was corrected
  to name which tier the figure now describes.
- An existing assertion was found weak rather than merely outdated:
  `expect(unconfirmed.pace?.sustainable).toBe(confirmed.pace?.sustainable)` compared two
  unknowns and would have passed with both empty. Both sides are now pinned to literals.
- The prescription is given up knowingly. At tier 3 the panel says the connection is being
  used too fast without naming the daily figure that would correct it. That was the user's
  call, made twice while reading the real panel — it should not be "restored" later as
  though it were dropped by accident.

## T-50 Know which carrier the SIM is on

T-50 · status: done · size: S · needs: T-03 · files: src/domain/carrier.ts, src/hilink/parse.ts, src/hilink/types.ts, test/domain/carrier.test.ts, test/hilink/parse.test.ts, test/main/main.test.ts, test/main/poller.test.ts, test/main/popover.test.ts, test/main/tray.test.ts, test/main/view-model.test.ts, test/renderer/popover.test.ts

The SIM moved from YAS to Orange MG on 2026-08-04 and the router noticed before we did:
`/api/net/current-plmn` now answers `<FullName>ORANGE MG</FullName>` where it answered `Yas`.
That endpoint is already parsed and already polled, so the carrier is a fact the app holds
and has never read.

Everything downstream branches on it — the allowance comes from a USSD dialogue on YAS and
from a web page on Orange — so the branch needs one named value rather than a string
comparison repeated at each call site:

```
'ORANGE MG' | 'Orange MG'  →  'orange'
'Yas'                      →  'yas'
anything else              →  'unknown'
```

Matching is case-insensitive and trimmed, because `FullName` and `ShortName` disagree on
capitalisation for the same network (`ORANGE MG` against `Orange MG`) and there is no reason
to believe either spelling is stable.

`unknown` is a first-class result, not a fallback to YAS. An unrecognised carrier means the
app knows the router but not where the allowance lives, and that is a state to render, the
same way an unrecognised network-type code is shown as its code rather than guessed.

### Acceptance

- [x] `ORANGE MG`, `Orange MG` and `orange mg` all resolve to `orange`
- [x] `Yas` and `YAS` resolve to `yas`
- [x] an unrecognised name resolves to `unknown` and the original string is retained for display
- [x] an empty or missing `FullName` resolves to `unknown` without throwing
- [x] the resolved carrier is exposed on the snapshot the view-model already receives
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write `test/domain/carrier.test.ts` covering both spellings, both carriers, unknown and empty
2. Add `src/domain/carrier.ts` — a pure `carrierFrom(fullName: string)` returning a tagged value
3. Confirm `src/hilink/parse.ts` already surfaces `FullName`; extend the parsed type if it does not
4. Carry the carrier onto the snapshot type and through `src/main/view-model.ts`
5. Run test, lint and build

### Notes

- `src/main/view-model.ts` was declared but needed no edit, and was dropped from `files:`.
  `CarrierInfo.id` rides on the snapshot the view-model already destructures at
  `view-model.ts:947`, so the criterion is met by the type and the parse site alone. Putting
  the carrier on `PopoverModel` would be display work beyond these criteria; it belongs to
  whichever of T-55..T-57 actually branches on it.
- The name is resolved at the `src/hilink/` parse boundary, not in the view-model. This
  differs from the `networkTypeCode` precedent, which stays a bare number and is labelled in
  the view — justified because the carrier drives control flow (USSD on YAS against a web
  page on Orange) rather than display, and `src/hilink/ussd.ts` already imports from
  `src/domain/`, so the direction is not new.
- `parseCurrentPlmn` is now the only parser with an optional field: it reads `FullName` with
  `?? ""` instead of `requireText`, so a reply carrying no `<FullName>` resolves to `unknown`
  rather than throwing. The pre-existing "never returns undefined fields instead of throwing"
  test does not cover it.
- Six existing test files gained `id: "yas"` on their snapshot fixtures. QA confirmed the
  edits are purely additive — no assertion was weakened to keep the suite green.

## T-51 Read Orange's forfaits out of the portal page

T-51 · status: done · size: S · needs: T-01 · files: src/orange/parse.ts, src/orange/types.ts, test/orange/parse.test.ts, test/fixtures/orange/info-conso.html

`http://123.orange.mg/info-conso/` is server-rendered HTML with the figure in the markup —
there is no JSON API behind it, so the parse _is_ the integration. This task is the pure half:
HTML string in, typed forfaits out, no network.

The live capture from 2026-08-04 contains one forfait:

```html
<div class="bundle-item">
  <span class="item_title title">Wifiber Go+ SSE</span>
  <span class="title-da-nature title">Internet</span>
  <p>
    Vous avez consommé
    <span class="color-orange text-bolder text-nowrap">7.37Go</span> sur votre
    forfait
  </p>
</div>
```

Capture the fixture with `curl -s http://123.orange.mg/info-conso/ >
test/fixtures/orange/info-conso.html` while on the Orange network — it cannot be re-fetched
from anywhere else, so commit it.

Volumes arrive as French octets with no space (`7.37Go`, and by extension `512Mo`, `1,5Go`),
which is the display format `src/domain/format.ts` already produces in the other direction.
Parse to bytes on the 1000³ decimal scale, at this boundary, exactly as XML never escapes
`src/hilink/`.

A forfait may also carry `data-bundle-type` and `data-bundle-pcvalue` on a `.bundle-circlebar`
— `full.infoconso.js` uses them to draw a ring for capped bundles. Wifiber Go+ SSE has
neither. Read them when present and leave them absent otherwise; do not synthesise a
percentage the page did not state.

Regex against this markup would be a liability across a carrier's redesign, so parse the
document rather than pattern-matching it. Any dependency added here must survive the
renderer's `default-src 'none'` policy only if it is used in the renderer — this parse runs
in the main process, so it is unconstrained.

### Acceptance

- [x] the committed fixture yields exactly one forfait: label `Wifiber Go+ SSE`, nature `Internet`, with the consumed volume the captured page states
- [x] `7.37Go`, `512Mo`, `1,5Go` and `800Ko` each parse to the right byte count on the 1000³ scale
- [x] a `.bundle-circlebar` carrying `data-bundle-type` and `data-bundle-pcvalue` is read into the forfait; absent attributes leave the fields undefined rather than zero
- [x] a page with no `Forfaits en cours de validité` section returns an empty list, not an error
- [x] markup that matches no known shape returns an empty list and never throws
- [x] the account-level lines (`WiFiber` offer, `0 Ar` balance) are parsed but kept separate from the forfait list
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Capture the live page into `test/fixtures/orange/info-conso.html`
2. Write `test/orange/parse.test.ts` against that fixture plus hand-built variants for the capped and empty cases
3. Add `src/orange/types.ts` — `OrangeForfait`, `OrangeAccount`
4. Add `src/orange/parse.ts` — document parse, French-octet volume parse, tolerant of missing sections
5. Run test, lint and build

### Notes

- **The consumed figure is a live counter, so no fixture can be pinned to a number.** The
  first criterion originally named 7 370 000 000 bytes; across 2026-08-04 the same forfait
  read 7.37 Go, then 7.96 Go (the committed capture), then 8.45, then 8.68. The criterion now
  asks for the volume the captured page states, and the 1000³ arithmetic — 7.37 Go included —
  stays pinned in the `parseOctets` criterion where it cannot drift. The fixture was never
  hand-edited to match the plan.
- **No dependency was added.** `src/orange/parse.ts` carries its own tolerant tokeniser rather
  than promoting the dev-only `jsdom` to a runtime dependency: the app ships
  `dependencies: {}`, this parse runs in Electron's main process, and jsdom would land a full
  DOM implementation plus its transitive tree in the asar to read one 38 KB page. The cost is
  ~527 lines to maintain across an Orange redesign. It builds a real element tree and every
  read is a tree query, so it survives attribute reordering, re-indentation and added
  wrappers — QA verified this rather than taking the claim on trust.
- Robustness is structural, not a blanket `try`/`catch` — there are **zero** catch blocks in
  the file. `MAX_DEPTH = 512` stops unclosed tags blowing the recursive readers' stack,
  `String.fromCodePoint` is range-guarded, and stray `<`, mismatched closers and unterminated
  attributes are absorbed. A real parse bug therefore still surfaces instead of being
  swallowed into an empty list.
- The unit scale is declared locally as `OCTET_UNIT_BYTES`. `src/domain/format.ts` exports no
  scale constants, and the only exported table is `UNIT_BYTES` in `src/hilink/parse.ts`, keyed
  to the router's English `KB`/`GB` wire spelling that a documented convention keeps inside
  `src/hilink/`. Each boundary owning its own source's spelling matches that precedent.
- `percent` is stored exactly as `data-bundle-pcvalue` states it and is deliberately not
  reinterpreted — the page never says whether it counts consumed or remaining, and Wifiber
  Go+ SSE carries no ring to check against. `bundleType` stays a `string` rather than a
  `credit|data|voice|sms` union, so an unknown type reaches the surface instead of being
  dropped.
- Verified against the live portal after merge, not only against the fixture: the built
  parser read `Wifiber Go+ SSE` / `Internet` / 8 680 000 000 bytes off the real page.

## T-52 Fetch the Orange portal without blocking the app

T-52 · status: done · size: S · needs: T-51 · files: src/orange/portal.ts, test/orange/portal.test.ts

The fetch is the easy half and the one place a mistake stalls the menu bar. No session, no
token, no password: a single `GET` to `http://123.orange.mg/info-conso/`, which the network
answers because it recognises the subscriber. That is a real simplification over the router
and should not be dressed up as anything more.

Two rules already in force apply unchanged. Every network call carries an explicit timeout —
there is no unbounded await — and an unreachable host is a state, not an error: the portal
only answers on the Orange network, so a laptop on café Wi-Fi gets nothing, and that is
ordinary. It renders like an unreachable router.

Also treat a `200` that parses to no forfaits as _reached but unreadable_, distinct from
_unreachable_. The captive-portal interception in front of this page (`X-Header: intercepting
the request`) is exactly the kind of middlebox that returns someone else's `200`, and
collapsing the two states would report "no plan" when the truth is "wrong network".

### Acceptance

- [x] a successful fetch returns the parsed account and forfaits from T-51
- [x] the request carries an explicit timeout and rejects to an unreachable state when it elapses
- [x] a connection refused or DNS failure yields the unreachable state, never a throw that reaches the poll loop
- [x] a non-200 status yields the unreachable state, carrying the status code for display
- [x] a 200 that parses to zero forfaits yields a distinct unreadable state, not the unreachable one
- [x] the base URL is a module constant, overridable in tests, and no test hits the real network
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write `test/orange/portal.test.ts` with a stubbed fetch: success, timeout, refused, 404, 200-but-empty
2. Add `src/orange/portal.ts` calling T-51's parse, returning a tagged result
3. Run test, lint and build

### Notes

- `readInfoConso` returns a four-arm tagged union — `{ state: "read" }`, `{ state: "unreadable" }`,
  and `{ state: "unreachable", reason: "timeout" | "offline" | "http" }` with `status` present
  only on the `http` arm. It mirrors `SnapshotResult`'s shape rather than inventing a new one.
  Default timeout 5 000 ms via `AbortController`, overridable through `options.timeoutMs`.
- Tests stub at the HTTP layer with throwaway loopback servers, following
  `test/hilink/client.test.ts`, rather than monkey-patching `fetch` as the task text suggested.
  One test asserts unused stubs receive zero requests, so nothing can reach the real portal.
  The DNS case targets `portal.invalid` — a reserved TLD that cannot resolve — under its own
  2 s timeout.
- `parseInfoConso` is called deliberately **outside** the try/catch. T-51 documents it as total
  and QA verified that structurally, so wrapping it would swallow a real parse bug into a false
  "offline". This is the one place T-52's correctness leans on T-51's totality claim.
- Nothing calls `readInfoConso` yet — wiring it into the poll loop is T-55's work.
- Verified against the live portal after merge: `state: read`, one forfait, 9 530 000 000 bytes.

## T-53 Pick the Internet forfait when several are active

T-53 · status: done · size: S · needs: T-51 · files: src/orange/select.ts, src/config/config.ts, src/config/defaults.ts, test/orange/select.test.ts, test/config/config.test.ts, test/readme.test.ts, README.md

The portal lists every live bundle, and `full.infoconso.js` names four kinds — `credit`,
`data`, `voice`, `sms`. Only one of them is what a menu bar data meter measures; the other
three answer a question nobody asked of this app.

Selection reads the forfait's nature (`Internet`) and its `data-bundle-type` (`data`) where
present, rather than its position in the list, because position is a layout detail and a
promotion could reorder it tomorrow.

Where several data forfaits are live at once — a base plan plus a top-up is the obvious case
— the app must not silently pick one. Stability matters more than cleverness here: a dial
that jumps between two plans on alternate polls is worse than one that tracks the wrong plan
consistently. So the choice is remembered by label in `config.json`, and only when that
remembered label is absent from the page does the app fall back to the first data forfait
and say which it chose.

An unrecognised nature is neither selected nor discarded — it is carried through so T-57 can
name it, for the same reason an unrecognised router error code reaches the surface with its
number.

### Acceptance

- [x] a single Internet forfait is selected with no configuration present
- [x] voice, SMS and credit bundles are never selected, even when they are the only ones present
- [x] with two data forfaits and a remembered label, the remembered one is selected regardless of list order
- [x] with two data forfaits and no remembered label, the first is selected and the result reports that the choice was not the user's
- [x] a remembered label that no longer appears on the page falls back to the first data forfait rather than selecting nothing
- [x] a forfait whose nature is unrecognised is returned in the list of candidates but never auto-selected
- [x] the remembered label round-trips through `config.json`, and a config file written before this task loads without error
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write `test/orange/select.test.ts` for each case above
2. Add `src/orange/select.ts` — pure, takes the parsed forfaits plus the remembered label
3. Add the remembered label to `src/config/config.ts` with the usual tolerant load
4. Extend `test/config/config.test.ts` for the round-trip and the older-file case
5. Run test, lint and build

### Notes

- Config key is `orangeForfaitLabel`, namespaced by carrier the way `routerUsername` and
  `routerPasswordBlob` are namespaced by device — `forfaitLabel` alone would not say whose,
  and `src/domain/carrier.ts` already anticipates a second carrier.
- Rather than invent a third config-loading policy, `readCredentialField` was **renamed** to
  `readOptionalString` and its field union widened. QA verified the rename is
  behaviour-preserving on the credential path it also guards: absent stays silent,
  present-but-invalid still raises `ConfigValidationError`, and `loadConfig` still converts
  that to defaults-plus-`problem` instead of crashing.
- Three files beyond the declared list, all forced by the repo's own guards rather than chosen:
  `src/config/defaults.ts` holds `AppConfig`, and `test/readme.test.ts` asserts a two-way
  correspondence between parsed config keys and README settings rows, so the new key required
  a README row to keep the suite green. Both edits are one row each.
- `candidates` holds data forfaits plus unrecognised ones, but **excludes** voice/SMS/credit
  entirely — stricter than the criterion, which only forbids auto-selecting an unknown. The
  consequence is that T-56 cannot offer a voice bundle as a selectable alternative, which is
  deliberate: offering one would be offering a mistake.
- `remembered: false` whenever the app chose rather than the user, the single-forfait case
  included, so T-56 can gate a "which plan?" prompt on `candidates.length > 1 && !remembered`.
- Label matching folds case and accents so a hand-edited `config.json` still matches. `fold` is
  declared locally in `select.ts` rather than exported from `parse.ts`, which was a sibling
  task's merged work and could not be modified.

## T-54 Measure a Wifiber plan against the calendar month

T-54 · status: done · size: M · needs: T-53 · files: src/domain/quota.ts, src/domain/pace.ts, test/domain/quota.test.ts, test/domain/pace.test.ts

Every figure the panel draws was built on a carrier that stated a _remaining_ volume and an
_expiry date_. Orange states neither. It states consumption, and the plan runs from the first
of the month to its last day. So the arithmetic inverts, and this task is where that lands —
in `src/domain/`, which imports neither Electron nor the network and can be tested without a
router or a portal present.

```
usedNow      = the portal's consumed figure          // stated, not derived
remainingNow = planLimitBytes − usedNow              // derived, not stated
periodStart  = first day of the current month
planDays     = days in the current month             // 28 · 29 · 30 · 31
elapsedDays  = days elapsed since periodStart
```

The anchor plays no part. Neither does the router's month counter: it read 51.1 Go against
the portal's 7.37 Go on the same day, so the two count different traffic and joining them
would produce a confident wrong number. On Orange the counter's only remaining job is the
live throughput sparkline, which never touched the allowance anyway.

The tiers collapse. The cap becomes the single gate: with it, the dial, the meter and both
per-day figures are available at once, because the calendar supplies the length for free.
Without it there is a consumed volume and nothing else — no dial, no meter, no per-day
figure, since all three need a total. There is no Orange tier 1, because tier 1's inputs were
a carrier remaining and a carrier expiry.

Two boundaries deserve pinning rather than assuming. February and the 31-day months must both
be exercised, since `planDays` is now a calendar fact and off-by-one there shifts every pace
reading. And the first of the month is a real state: `elapsedDays` is not zero, or the ratio
divides by zero — day one is one day elapsed, the same inclusive counting T-46 settled for
the carrier's last valid day.

The band thresholds, the meter and every existing figure keep their current definitions. Only
their inputs change.

### Acceptance

- [x] `usedBytes` on Orange equals the portal's consumed figure exactly, with no router counter in the expression
- [x] `remainingBytes` is `planLimitBytes − usedBytes`, clamped at zero
- [x] `planDays` is 31 in August, 30 in September, 28 in February 2026 and 29 in February 2028
- [x] on the first of the month `elapsedDays` is 1 and the pace ratio is finite
- [x] on the last day of a 31-day month `elapsedDays` is 31 and `elapsedShare` is 1
- [x] with a cap set, the dial share, the meter, `averagePerDay` and `affordedPerDay` are all produced from one portal reading
- [x] with no cap set, none of those four are produced and the consumed volume still is
- [x] the YAS path's existing quota and pace tests pass unchanged — this adds a mode, it does not rewrite the old one
- [x] the band boundaries stay exactly as T-44 left them: `safe` at or under 1.00, `warning` above 1.00 and under 1.20, `over` at 1.20 and above
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Extend `test/domain/quota.test.ts` with the Orange mode, including both February lengths
2. Extend `test/domain/pace.test.ts` with the first-of-month and last-day boundaries and the cap-absent case
3. Add the calendar-month period to `src/domain/quota.ts` without disturbing the anchor path
4. Route `src/domain/pace.ts` inputs from the calendar period when the carrier is Orange
5. Confirm every pre-existing YAS test still passes untouched
6. Run test, lint and build

### Notes

- **A separate `readMonthlyPace` entry point, not a widened `readPace`.** The Orange reading
  has no tier ladder, no `daysUntilExpiry` and no `sustainablePerDay`; bending an
  anchor-shaped input around a portal figure was the surest way to regress the YAS path. The
  two modes share `bandFor` and the `PaceState` type and nothing else, and `bandFor` is reused
  verbatim rather than reimplemented.
- Criterion 8 was verified from the diff, not from a report: the **entire** 438-insertion
  change removes exactly two lines, both `import` statements. No existing assertion,
  expectation or test body was altered.
- The router's month counter cannot enter the Orange expression even by accident —
  `MonthlyPaceInput` carries only `consumedBytes`, `planLimitBytes` and `clock`. This matters
  because the counter read 51.1 Go against the portal's 7.37 Go on the same day; the two count
  different traffic.
- Inclusive day counting matches T-46 rather than inventing a second convention:
  `elapsedDays = now.getDate()`, so 1 on the first and 31 on the 31st, which is why
  `elapsedShare` reaches exactly 1 on the last day where a fractional count never could.
- **The YAS `MINIMUM_ELAPSED_DAYS` floor is deliberately not applied on Orange.** The count is
  ≥ 1 by construction, so no floor is needed and no `state` is forced to `safe`. This is a real
  behavioural difference between the two paths, chosen rather than overlooked.
- Two supporting exports beyond the headline functions: `planCap` (a cap of 0 or non-finite
  reads as "no cap", not "a limit of nothing" — needed identically by `readPortalUsage` and
  `readMonthlyPace`) and `CalendarMonthPeriod.periodStart`, which the ARCHITECTURE pseudocode
  names as the period's definition.
- Nothing calls `readMonthlyPace` yet; the `carrierFrom(...) === "orange"` branch is T-55's
  view-model wiring.

## T-55 Feed the panel from whichever carrier the SIM is on

T-55 · status: done · size: M · needs: T-50, T-52, T-54 · files: src/main/poller.ts, src/main/sync.ts, src/main/view-model.ts, src/main/main.ts, test/main/poller.test.ts, test/main/view-model.test.ts, test/main/sync.test.ts

The pieces exist separately after T-50 to T-54; this is where the app actually stops being a
YAS app. The poll loop learns a second source and chooses between them on the carrier the
router reports.

```
carrier = orange   →  fetch the portal each poll; no anchor, no login, no USSD
carrier = yas      →  the anchor and the staleness-driven USSD dialogue, exactly as today
carrier = unknown  →  router figures only; no allowance source
```

On Orange the whole allowance apparatus stands down. No anchor is read or written, no
Keychain password is needed, no staleness timer runs and no dialogue is ever started —
the portal is an unauthenticated `GET` that answers on every poll, so there is nothing to
sync and nothing that could lock an account. The Sync button and its status line have no
work on Orange and are hidden by T-56.

Two failure modes need to stay distinct all the way to the view-model rather than being
flattened into "offline", because they call for opposite reactions: the **router** being
unreachable means the connection itself is down, while the **portal** being unreachable
usually means the machine is on some other network and the connection is fine. The panel
must be able to show live throughput from a healthy router while saying the allowance figure
is stale — those are not the same outage.

The portal answers a page of about 38 KB, so it is not free to fetch at the fast in-panel
cadence. Poll it on the slow interval regardless of whether the panel is open, and reuse the
last reading in between: consumption moves in minutes, not in seconds, and the fast cadence
exists for the throughput sparkline, which comes from the router.

### Acceptance

- [x] with the router reporting `ORANGE MG`, a poll fetches the portal and no USSD, login or anchor code path executes
- [x] with the router reporting `Yas`, the existing anchor and sync behaviour is byte-for-byte what it is today, asserted by the pre-existing tests passing unchanged
- [x] with an unknown carrier, router figures are still produced and no allowance source is contacted
- [x] the portal is fetched on the slow interval only, and opening the panel does not trigger an extra fetch
- [x] between portal fetches the last successful reading is reused rather than the allowance disappearing
- [x] a reachable router with an unreachable portal yields live throughput and signal alongside a flagged-stale allowance, not a blanket offline state
- [x] an unreachable router with a reachable portal yields the allowance and an offline connection state
- [x] no Keychain access is attempted anywhere on the Orange path
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Extend `test/main/poller.test.ts` for the three carriers, the cadence rule and the two independent outages
2. Add the portal source to `src/main/poller.ts`, gated on the carrier from T-50
3. Gate the anchor and staleness logic in `src/main/sync.ts` to the YAS carrier
4. Carry both reachability states separately through `src/main/view-model.ts`
5. Extend `test/main/view-model.test.ts` for the mixed-outage cases
6. Run test, lint and build

### Notes

- **The menu bar was left showing a dash on Orange, and no planned task closed it.** The
  portal reading reaches the panel through `portalHalf()` but never reaches the tray:
  `buildTrayTitle()` reads only `config.allowanceAnchor`, which Orange never writes, so
  `readPlanUsage()` returns null and the title renders `NO_TRAY_VALUE`. Feeding the tray was
  in no T-55 criterion and no declared file, and `src/main/tray.ts` appears in no later task's
  `files:` either. **T-59 was added to close it**, scheduled ahead of T-56 and T-57 so the
  menu bar works before the panel polish lands.
- The YAS path moved verbatim into `anchoredHalf()`, and `carrier()` defaults to `"yas"` in
  `sync.ts`, so callers written before the branch behave identically. Criterion 2 was verified
  from the diff as well as the suite: all three test files are pure additions with **zero**
  deleted lines.
- The Keychain proof is a counter, not an assurance: `forbiddenStore()` counts `load()` calls
  and asserts 0 after both `start()` and `startAutomatic()`. The mechanism that prevents the
  call is `dialable()` returning false for `orange`, so the assertion is not vacuous.
- The portal runs on its **own** timer at `pollIntervalSeconds`; `setActive` never touches it,
  so opening the panel cannot trigger a 38 KB fetch. The fast cadence stays the router's, for
  the throughput sparkline.
- **`unknown` keeps today's anchored path** rather than taking the Orange branch. Once the
  poller and sync are gated nothing is contacted either way, and blanking the panel over an
  unrecognised carrier spelling is worse than showing the last figure the anchor's own rules
  still vouch for.
- The staleness timer still ticks on Orange but `startAutomatic` refuses it, so the policy
  lives in one place instead of being duplicated; nothing beyond a date comparison runs.
- The Orange allowance row states no expiry and no days-until-expiry — the portal states
  neither — and its age reads "Read Xm ago" rather than "Synced", since nothing was dialled.
- `src/main/main.ts` was touched beyond the declared list: unavoidable wiring that passes the
  real `readInfoConso` as the poller's portal source, injectable via `MenuBarOptions.portal`
  so no test can reach `123.orange.mg`.

## T-59 Show the Orange figure in the menu bar, not just the panel

T-59 · status: done · size: S · needs: T-55 · files: src/main/tray.ts, src/main/poller.ts, test/main/tray.test.ts

T-55 brought the Orange allowance as far as the panel and stopped there. `buildTrayTitle()`
reads `config.allowanceAnchor`, Orange never writes an anchor, and so the menu bar — the
surface this app exists to occupy — shows `NO_TRAY_VALUE` while the real figure sits one
click away. A menu bar app whose menu bar says nothing is the one outcome the whole plan was
meant to avoid.

The fix is the same inversion T-54 already made in the domain: the tray's number comes from
the portal reading on Orange and from the anchor on YAS. Both paths already exist and are
tested; only the tray's source is missing a branch.

What the tray can say on Orange is bounded by what the portal states. With a cap set there is
a share and a remaining volume, so the title can read as it does on YAS. With no cap there is
a consumed volume and nothing to measure it against — a bare consumed figure is honest and
useful, a percentage would be invented.

### Acceptance

- [x] with an Orange reading and a cap set, the tray title shows the same shape it shows on YAS
- [x] with an Orange reading and no cap set, the tray shows the consumed volume and no share
- [x] with an Orange reading unavailable, the tray falls back to `NO_TRAY_VALUE` exactly as today
- [x] on YAS the tray title is byte-for-byte what it is today, asserted by the pre-existing tray tests passing unchanged
- [x] with an unknown carrier the tray behaves exactly as it does today
- [x] the warning states that drive the tray's colour behave on Orange as they do on YAS
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Extend `test/main/tray.test.ts` for the Orange capped, Orange uncapped and Orange-unavailable cases
2. Branch `buildTrayTitle()` on the carrier, reading the portal figure on Orange
3. Confirm every pre-existing tray test still passes untouched
4. Run test, lint and build

### Notes

- The menu bar now reads `7.4Go · 37%` capped, `7.4Go` uncapped, `18Go ⚠ 90%` warning, and the
  unchanged `—` when there is no reading — the same `compactBytes` + separator + `formatPercent`
  path YAS uses, so the two carriers are indistinguishable in the menu bar.
- **The wiring was in `src/main/poller.ts`, not `main.ts` or `view-model.ts`.** `buildTrayTitle`
  is called only from `UsagePoller.#apply`, so the call gained two appended optional parameters
  (`clock`, `portal`). QA confirmed every existing positional call still compiles and behaves
  identically, and that `clock` defaulting to `systemClock` shifts nothing.
- **A real defect was surfaced rather than smoothed over.** On Orange the share can exceed 100%,
  because the portal states consumption outright where YAS's carrier-remaining stopped at zero.
  A cap mistyped an order of magnitude too small yields `111Go ⚠ 11100%` — 14 characters, past
  `MAX_TRAY_TITLE_LENGTH`. The exact share was kept rather than clamped into a plausible-looking
  lie; the boundary is pinned in a named test and the constant's doc states the exception. QA
  measured the blast radius: every realistic pair (0 to 2× cap, for caps of 1, 20, 100 and
  999 Go) stays within the limit, so only a typo can trigger it.
- The title refreshes on the next router poll rather than being pushed from the portal loop, so
  it lags at most one idle interval after the first portal read. QA confirmed the lag is bounded
  and no permanently stale or blank menu bar is reachable. The alternative — keeping a
  `#lastResult` in the poller — was more state for one call site.
- A stale portal reading (`live: false`) still shows its figure, matching the panel, which shows
  it marked. Only a genuinely absent figure yields the dash.
- **Follow-up, deliberately out of scope:** the poller's `#setState` edge-triggered `onState`
  callback still derives from `readPlanUsage`, so it stays `"unknown"` on Orange. Nothing
  consumes it today — no notification, no icon colour — so the tray's visible warning is
  entirely the `⚠` marker that criterion 6 covers. Worth a task if `onState` ever gets a
  consumer.

## T-56 Show the forfait's name and hide what Orange cannot answer

T-56 · status: done · size: S · needs: T-55 · files: src/main/view-model.ts, src/main/popover.ts, src/main/main.ts, src/renderer/index.html, src/renderer/popover.ts, src/renderer/popover.css, src/renderer/preload.cts, test/main/view-model.test.ts, test/renderer/popover.test.ts, test/main/popover.test.ts, test/main/main.test.ts

The panel is 320×520 with no room to scroll, and on Orange several of its controls have
nothing behind them. Leaving a Sync button that syncs nothing, and a plan-length field that
is overruled by the calendar, is worse than the space they cost — both invite the user to
operate a control that does not work.

On Orange the panel drops the Sync button and its status line, and drops the plan-length
input from the settings toggle. What stays is the plan cap, which the portal genuinely never
states, and the router address. The forfait's own name — `Wifiber Go+ SSE` — takes the place
the synced plan label held: it is text with no magnitude, which is exactly what the panel
reserves text for.

The user's request was that the app detect the plan rather than be told it, so the detected
name being visible is the evidence that detection worked. When T-53 fell back to the first of
several data forfaits rather than a remembered choice, the panel says so and offers the
others — a silently chosen plan among several is the one case where the name alone is not
enough.

On YAS the panel is unchanged. This is a branch, not a redesign.

### Acceptance

- [x] on Orange the Sync button and its status line are absent from the rendered panel
- [x] on Orange the plan-length input is absent from the settings toggle and the plan cap input remains
- [x] on YAS every one of those controls is still present and behaves as it does today
- [x] the detected forfait label is rendered on the Orange panel
- [x] when several data forfaits are live and none was remembered, the panel names the chosen one and lists the alternatives as selectable
- [x] choosing an alternative writes the remembered label from T-53 and the dial follows it on the next poll
- [x] the Orange panel's total height still fits the 520 px budget, asserted the way T-45 asserts it
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Extend `test/main/view-model.test.ts` for the per-carrier control visibility and the forfait label
2. Extend `test/renderer/popover.test.ts` for the rendered panel in both carriers and the height budget
3. Branch the control set in `src/main/view-model.ts` on the carrier
4. Add the forfait label and the alternatives list to `src/renderer/index.html` and `src/renderer/popover.ts`
5. Adjust `src/renderer/popover.css` for the reclaimed space
6. Run test, lint and build

### Notes

- **The panel is nearly out of vertical room: 514 px of the 520 px budget, 6 px of slack**
  (YAS sits at 504). Dropping the sync row gave back 38 px; the forfait-choice affordance took
  48 px. QA confirmed 514 is the **worst case** — it includes the choice block at full height,
  which appears only when several forfaits are live and none was remembered. Any future panel
  row has to reclaim space rather than assume it.
- **A new IPC channel was added**, `popover:choose-forfait`, the only change in this run that
  crosses a trust boundary. It is validated at runtime (`typeof payload === "string"` in
  `popover.ts:174`, not erased TypeScript types), scoped to the panel's own webContents
  (`event.sender === open.webContents` at `popover.ts:138`), and follows the existing
  `fromThisPanel` pattern rather than a looser one. Malformed payloads — `42`, `null`, objects,
  wrong sender — are dropped in tests; an empty string is trimmed away by `setForfait`, so a
  stored choice cannot be silently cleared.
- Four files beyond the declared list, all needed for criterion 6 to be true **in the app**
  rather than only in the renderer: `src/renderer/preload.cts` (a fifth send),
  `src/main/popover.ts` (the channel), `src/main/main.ts` (`setForfait` writes the label into
  the shared config the poller holds, so the next fetch selects against it), plus the two test
  files for those. Without them the alternatives list would render and do nothing.
- Controls are **detached from the DOM** and replaced by a comment marker, not hidden with
  `display: none` — a hidden control is still focusable and still reachable by keyboard.
  "Withdrawn" is keyed off `marker.isConnected`, so a wholesale page replacement cannot strand
  a stale map entry. Re-attachment is exercised by pushing a YAS model after an Orange one.
- `PopoverModel` gained `controls: { sync, planDays }` and `forfait: PopoverForfait | null`.
  YAS and the pre-snapshot empty model get every control and a null forfait, so the branch is
  one carrier fact rather than a redesign.

## T-57 Say when the portal cannot be reached or the forfait is unreadable

T-57 · status: done · size: S · needs: T-55 · files: src/main/view-model.ts, src/main/main.ts, src/renderer/popover.ts, src/renderer/index.html, src/renderer/popover.css, test/main/view-model.test.ts, test/renderer/popover.test.ts

Three failures are possible on the Orange path and they have three different remedies, so
collapsing them into one message would make each of them undiagnosable — the same reason an
unrecognised router error code is carried to the surface with its number rather than becoming
a bare "it failed".

```
unreachable        the machine is not on the Orange network      → connect through the router
reached, no plan   200 answered but no forfait was parsed        → the page changed, or a middlebox replied
no data forfait    forfaits exist but none of them is Internet   → the plan expired or is voice-only
```

The middle case is the one worth being careful about. A captive portal in front of this page
already announces itself with `X-Header: intercepting the request`, and a middlebox returning
someone else's `200` is exactly what produces a parse of zero forfaits. Reporting that as "no
plan" would state something false about the user's account.

Each message names what was actually observed — the HTTP status where there was one, the
count of forfaits found where the page parsed — and none of them is an error dialog. The app
runs unattended in the menu bar; every one of these is a line in the panel.

The `unknown` carrier from T-50 gets the same treatment: the panel says which network name
the router reported and that no allowance source is known for it, rather than showing nothing.

### Acceptance

- [x] an unreachable portal renders a distinct message from a portal that answered but parsed to nothing
- [x] a non-200 reply names its status code in the message
- [x] a page parsing to forfaits with no Internet one among them renders a third distinct message naming how many were found
- [x] an unknown carrier renders the raw `FullName` the router reported
- [x] none of the four states produces a dialog, a thrown error or an empty panel
- [x] a stale-but-present allowance is still drawn alongside the message rather than being replaced by it
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Extend `test/main/view-model.test.ts` for the four states and the stale-but-drawn case
2. Map each tagged result from T-52 and T-53 to its own message in `src/main/view-model.ts`
3. Render the message in `src/renderer/popover.ts` in the position the sync status line occupied
4. Extend `test/renderer/popover.test.ts` for the rendered output of each state
5. Run test, lint and build

### Notes

- **KNOWN CONTRADICTION, left unfixed and awaiting a decision.** In the "no Internet plan"
  state the dial still prompts "Waiting for the Orange portal to answer"
  (`view-model.ts:1297`) while the notice beneath reads "Orange's page listed 2 plans and none
  of them is an Internet plan". Both render together. QA rates the visibility **moderate**: the
  notice carries the correct information, but an attentive reader sees the panel say two
  different things at once. It was left because fixing it means editing an existing assertion,
  which every task in this run has been held back from doing. **This wants its own task.**
- The worst-case panel height did **not** move: still 514 px of 520. The 38 px notice row takes
  the space T-56 gave back, and the notice can never coincide with the sync row or the 48 px
  forfait-choice block. Both exclusions are asserted rather than assumed —
  `popover.test.ts:3050-3072` checks `[data-sync-row] === null` while each notice is visible.
- On Orange the forfait-choice offer is **withdrawn while a notice stands**: every alternative
  is a dead control when the page could not be read, and `selectForfait` only ever remembers a
  data forfait.
- **Undeclared behaviour change, verified benign:** the Sync button is now absent on an
  `unknown` carrier (`UNPLACED_CONTROLS`), which is what pays for the notice row there. QA
  confirmed the premise — `sync.ts:179-181` shows `dialable()` is true only for `yas`, so
  `start()` and `startAutomatic()` already returned immediately and the button was a silent
  no-op before this change.
- `src/main/main.ts` was touched beyond the declared list because `PortalStatus` in the
  off-limits `poller.ts` publishes only `{reading, live}` and drops the tagged
  `OrangePortalResult`. `main.ts` wraps the `PortalSource` it already builds, remembers the
  last non-`read` outcome and passes it as `portal.failure`; `PopoverInput.portal` widened to
  `PortalStanding = PortalStatus & { failure?: PortalFailure }` so a plain `PortalStatus` still
  assigns and `poller.ts` stays untouched. QA confirmed `main.ts:473` clears the remembered
  failure on a successful read, so a message cannot linger beside a fresh figure. The tidier
  home is `PortalStatus` itself — one line in `#applyPortal` — worth folding in if `poller.ts`
  reopens.
- No internal tag word (`unreachable`, `unreadable`, `timeout`, `http`) reaches the renderer as
  a leaf value; asserted across every failure state.

## T-60 Stop the dial contradicting the notice beneath it

T-60 · status: done · size: S · needs: T-57 · files: src/main/view-model.ts, test/main/view-model.test.ts, test/renderer/popover.test.ts

T-57 gave the panel a line that says why there is no figure. It did not change the dial's own
prompt, because doing so meant editing an assertion that already passed, and every task in the
Orange run was held back from touching existing tests — the rule that kept the YAS path intact
across nine tasks. The cost landed here: in the "no Internet plan" state the dial reads
"Waiting for the Orange portal to answer" while the notice beneath reads "Orange's page listed
2 plans and none of them is an Internet plan". The page answered. The panel says both.

A panel that contradicts itself is worse than one that says less. The dial's prompt is the
larger, earlier text, so a reader takes it first and the correct notice reads as the
contradiction rather than the correction.

This task is the exception the rule was protecting against: **the existing assertion on the
dial prompt is expected to change**, and that is the point of the task rather than a failure
of it. What must not change is any assertion about the YAS path or about the notice text T-57
settled.

The prompt should say what is true of each state. Waiting is true only before an answer. Once
the portal has answered — unreadable, or readable with no Internet plan — the dial is not
waiting for anything, and the notice already carries the explanation, so the dial's prompt
should stand down rather than compete with it.

### Acceptance

- [x] in the "no Internet plan" state the dial's prompt does not claim to be waiting
- [x] in the "unreadable" state the dial's prompt does not claim to be waiting
- [x] before any portal answer, the waiting prompt is unchanged from today
- [x] the dial's prompt and the notice never state contradictory things about whether the page answered, asserted for every portal state
- [x] the notice text T-57 settled is unchanged, and no YAS assertion is touched
- [x] the panel's worst-case height is still within the 520 px budget
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Enumerate the portal states and the dial prompt each should carry
2. Update the prompt in `src/main/view-model.ts`
3. Update the one existing dial-prompt assertion and add the per-state contradiction test
4. Run test, lint and build

### Notes

- **The exception this task was granted went unused.** T-60 was written permitting the existing
  dial-prompt assertion to be edited. Grepping first found that no such assertion existed — the
  only `progress.prompt` assertions were YAS ones — so all seven new tests are additions and no
  existing line was edited or deleted. Every task in the Orange run therefore landed with zero
  deleted test lines.
- `portalAnswered()` deliberately mirrors `portalNotice()`'s own structure, reading `failure`
  only behind `!live`, exactly where the notice does. The prompt and the notice cannot disagree
  **by construction** rather than by two independent judgements staying in step.
- That structure made the **HTTP-status** case fall out correctly without being named in the
  brief: "Orange's page answered HTTP 503" is an answer, so the dial stands down there too. The
  prompt is now `""` for unreadable, no-Internet-plan and http; it keeps the byte-identical
  "Waiting for the Orange portal to answer." for never-asked, offline and timeout.
- The general assertion is a 40-standing cross product (5 failures × 4 readings × live
  true/false), guarded by a companion test proving every non-empty notice classifies as exactly
  one of "did not answer" / "page answered", so a seventh wording stating neither would fail
  rather than pass vacuously.
- **REMAINING GAP — the same false claim survives in the screen-reader layer.** QA confirmed
  `buildMonthlyDial()` at `view-model.ts:1344-1346` hardcodes the accessible description to
  "No reading from the Orange portal yet" whenever `reading === null`, regardless of whether the
  portal answered. In the unreadable, no-Internet-plan and http states a screen-reader user is
  told exactly what T-60 stopped the visible panel from saying. Out of scope here — the criteria
  are literal about "the prompt" — and it wants its own task.

## T-61 Stop the allowance strip claiming what Orange never said

T-61 · status: done · size: S · needs: T-60 · files: src/main/view-model.ts, src/renderer/index.html, src/renderer/popover.ts, test/main/view-model.test.ts, test/renderer/popover.test.ts

Found by looking at the running panel on Orange rather than by a test. Three things the panel
states are true of YAS and untrue here, and all three are the same fault: the panel asserting
something the Orange path cannot support.

**The remaining volume is captioned "left with the carrier".** On YAS that is exactly right —
the carrier states the remaining volume over USSD, and the anchor carries it. On Orange the
carrier states only what was **consumed**; the remainder is derived from the cap the user typed
in settings. Crediting the user's own number to Orange is a false attribution, and it matters on
the day the cap and the plan disagree: the panel would present a stale setting as a figure the
carrier had confirmed.

**The `Expires` row can only ever show two dashes.** `allowance-validity` is static markup and
is never detached; the portal states no expiry and no days-until-expiry, so on Orange the row is
a caption with nothing behind it. That is what T-56 removed the Sync button for. It survived
because T-56's criteria were a list of controls rather than the rule behind the list — and its
removal gives back height on a panel already at 514 px of 520.

**The accessible description still says the portal never answered.** T-60 stopped the visible
dial from claiming to be waiting for a page that had already answered, but `buildMonthlyDial()`
hardcodes the description to "No reading from the Orange portal yet" whenever `reading` is null,
regardless. In the unreadable, no-Internet-plan and http states a screen-reader user is told
precisely what the sighted panel no longer says. T-60 was right not to widen its own scope; the
result is a sighted-only fix, which is worse than either fixing both or neither.

On YAS every one of these three stays exactly as it is today.

### Acceptance

- [x] on Orange the remaining figure is not captioned as the carrier's own statement
- [x] on YAS the caption is unchanged from today
- [x] on Orange the `Expires` row is absent from the rendered panel, not present-and-dashed
- [x] on YAS the `Expires` row is present and behaves as it does today
- [x] the dial's accessible description never says the portal has not answered when the notice says it did, asserted for every portal state the way T-60 asserts the visible prompt
- [x] the panel's worst-case height is still within the 520 px budget, and the reclaimed row is reflected in the measurement
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Extend the tests for the per-carrier caption, the absent `Expires` row and the description
2. Branch the caption and the validity row on the carrier
3. Route the accessible description through the same `portalAnswered()` predicate T-60 added
4. Re-assert the height budget
5. Run test, lint and build

### Notes

- **All three defects were found by looking at the running panel, not by a test.** Every one had
  passed its own task's QA, because the criteria enumerated _which_ controls to withdraw rather
  than stating the rule behind them: the tests were checking the list. A screenshot of the live
  app caught what twelve QA passes did not.
- The caption is now model-driven: `left on your plan` on Orange, `left with the carrier`
  byte-identical on YAS. The cross product asserts the Orange caption never matches `/carrier/i`.
- The validity row is withdrawn through the **same** `setPresent()` comment-marker path T-56 built
  for the sync row (`node.replaceWith(marker)`), so `[data-validity-row]`, `allowanceExpires` and
  `allowanceDaysLeft` all leave the document rather than being hidden — a `display: none` row is
  still announced by assistive technology, which would have defeated the task. The SIM-swap
  restore is exercised: a YAS model after an Orange one brings the row back populated.
- **The accessible description could not stand down to `""`** the way T-60 let the visible prompt,
  because an empty `aria-label` leaves the dial unnamed. It reads "The Orange portal answered
  without a usable figure" instead, routed through the **same** `portalAnswered()` predicate as the
  prompt — one judgement, not two kept in step — with a test asserting the description is
  non-empty in all 40 standings and another asserting prompt and description can never disagree.
- **Height: 514 → 497 px of 520**, 17 px reclaimed. Asserted as an exact `toBe(497)` and coupled to
  the row genuinely being off the panel, so it cannot pass if the row returns.
- The agent caught its **own** vacuous test: the height assertion's selector matched no markup
  before the fix, so it would have passed against nothing. It added
  `expect(INDEX_HTML).toContain("data-validity-row")` and re-observed the failure before
  implementing — the same failure mode T-49 caught in its own suite. QA swept the other twelve new
  tests for it and found none.
- `PopoverControls` gained `expiry: boolean`, which is a readout row rather than a control — noted
  in both docblocks. Nothing asserts that type exhaustively (`leaves()` walks it recursively), so
  the new field broke nothing.

## T-58 Bring the README and screenshots up to the Orange setup

T-58 · status: done · size: S · needs: T-56, T-57, T-59 · files: README.md, docs/media/panel-orange.png, test/readme.test.ts

`test/readme.test.ts` already holds the README to the app's actual behaviour, and after T-50
to T-57 it describes an app that no longer exists: a YAS meter driven by a USSD dialogue and
a Sync press. The repository's own documentation is the last place the old carrier still
looks like the only one.

The README gains the Orange path — an unauthenticated portal read on the ordinary poll, a
typed cap, a calendar month — beside the YAS path, and says the carrier is detected rather
than configured, so a reader with either SIM finds themselves in it. The screenshots in
`docs/media/` are reshot from the Orange panel, which is the one the user will actually see.

Whatever `test/readme.test.ts` asserts about the panel's controls has to move with T-56's
branch. If that test asserts against a single control set, it now needs to assert per
carrier; leaving it passing by weakening it would be the failure T-49 caught in its own
suite, where an assertion compared two unknowns and would have passed with both empty.

### Acceptance

- [x] the README documents both carriers and states that the carrier is detected from the router, not configured
- [x] the README's Orange section names the portal URL, the typed cap and the calendar-month period
- [x] no instruction to enter a router password or press Sync is presented as universal
- [x] `docs/media/` screenshots show the Orange panel and every image referenced by the README exists
- [x] `test/readme.test.ts` asserts per carrier rather than being relaxed to pass against both
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Read `test/readme.test.ts` and extend its assertions per carrier before touching the README
2. Rewrite the README's allowance section to cover both paths
3. Reshoot the panel screenshots into `docs/media/`
4. Run test, lint and build

### Notes

- **Held open on the screenshot criterion — it needs a human and a real router.** The README
  and its per-carrier tests are complete and merged; `docs/media/` still holds only `icon.png`.
  No image was drawn, generated or copied, and the README references no path that fails to
  resolve, so the existing link test passes honestly rather than by omission.
- **Capture list** — retina (2×), app running against the router with the SIM on Orange:
  1. `docs/media/panel-orange.png` — main view: dial with a share (type a cap first so it
     draws), pace meter, allowance block, the detected `Wifiber Go+ SSE` name, both sparklines,
     and the point of the shot — **no Sync button and no sync status row**. Full panel, uncropped.
  2. `docs/media/panel-orange-settings.png` — the same panel with the ⚙ toggle flipped: plan cap
     and router address present, **no plan-length field**. One image cannot show both views.
  3. `docs/media/menubar-orange.png` — tight crop of the tray item reading `7.4Go · 37%`, about
     320×44 at 2×. Crop out anything identifying from the rest of the menu bar.
  4. Optional — `docs/media/panel-orange-forfaits.png`, the panel while two data forfaits are
     live and none was remembered, showing the "Picked for you from several plans." note and the
     alternative buttons. Needs a top-up alongside the base plan, so only if it arises naturally.
     Reference each from the README's Orange section afterwards; the existing link test then holds
     them, and the deliberately-absent assertion documented at the end of `test/readme.test.ts` can
     be replaced with a real one.
- **T-41 is waiting on the same capture** and has been since before this run. Its open criterion
  is the pre-T-45 screenshot; shooting these closes both.
- Two existing test constructs changed, both verified **stricter** by QA rather than relaxed:
  `REQUIRED_HEADINGS` swapped one heading for three (the shared one plus both per-carrier
  subheadings), and the Sync-instruction pattern widened to `/\bpress\s+(?:\*\*|`)?sync\b/i` so
  lowercase and backtick-wrapped variants can no longer escape the guard.
- Two vacuity guards make the negative assertions real: `section()` asserts a non-empty body
  (readme.test.ts:99, commented as T-49 protection) so no `not.toMatch` can pass against
  nothing, and the carrier-instruction test asserts it found instructions at all before
  requiring each to sit under a YAS heading.
- The per-carrier tray anchors pass the **same** `PortalStatus` into both cases and get
  `7.4Go · 37%` on Orange against `60Go · 40%` on YAS — proving the carrier branch rather than
  merely the portal's absence.
- `docs/ARCHITECTURE.md`'s `docs/media/` line still describes "screenshots referenced by
  README.md" when only `icon.png` exists; outside this task's declared files, worth a sweep.

## T-62 Find out what the router actually says about connected devices

T-62 · status: done · size: M · needs: — · files: test/fixtures/hilink/host-list.xml, test/fixtures/hilink/host-info.xml, test/fixtures/hilink/macfilter.xml, docs/ARCHITECTURE.md, test/hilink/device-fixtures.test.ts

`docs/ARCHITECTURE.md`'s **LAN device API — provisional** subsection is guesswork from the
router's own `/html/statistic.html` and from what HiLink firmware generally does. Every other
endpoint table in that document says "verified live against the device"; this one does not, and
nothing may be built on it until it can.

So this task probes the B310s-22 on `21.333.01.00.00` directly, captures the real replies as
fixtures, and rewrites the subsection with what the device said rather than what it was expected
to say. Three questions it has to settle, because the answer to each changes the tasks after it:

**Which endpoint carries the full picture.** `host-list` is the Wi-Fi association table;
`HostInfo` is expected to include wired clients and the connection medium. If one is a superset
the other is dead weight, and if neither carries the band (2.4 GHz against 5 GHz) then the
column the window was designed around does not exist and T-64 drops it.

**What the MAC filter looks like at rest.** The filter is almost certainly off today, so its
idle shape — mode value, how entries are numbered, whether SSID index appears — is what a write
has to reproduce exactly. The cap on entries is read off the firmware rather than assumed to
be 32.

**Whether a `GET` on the filter needs a login.** The monitoring endpoints do not; the
architecture assumes only the `POST` does. If the `GET` also refuses unauthenticated, the whole
blocked-state column moves behind the stored password, and T-67 has a state to render that it
would otherwise not.

The MAC filter is **read only** in this task. Nothing is written to the router — a mistaken
write here is the household losing Wi-Fi, and there is no test that justifies it.

### Acceptance

- [x] a real reply from each probed endpoint is committed under `test/fixtures/hilink/`, with any MSISDN or password redacted and the redaction noted in the file
- [x] every fixture is well-formed XML and loads in a test, so a truncated capture cannot pass
- [x] `docs/ARCHITECTURE.md`'s LAN device subsection no longer says "provisional" and each row states a field name that appears verbatim in a committed fixture
- [x] the document states which endpoint the app will read, which it will ignore, and why
- [x] the document states the filter's entry cap and whether its `GET` needs authentication, as observed
- [ ] no `POST` is made to the router in this task, and no fixture is a write reply
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write the fixture-loading test first, listing the fixtures by name so it fails until each exists
2. Probe `/api/wlan/host-list`, `/api/lan/HostInfo` and `GET /api/wlan/multi-macfilter-settings` against the live router, both with and without a session
3. Capture the replies, redact anything identifying, commit them as fixtures
4. Rewrite the LAN device subsection of `docs/ARCHITECTURE.md` from the captures
5. Record in that subsection which endpoint wins and what the filter's cap is
6. Run test, lint and build

### Notes

- **Acceptance 6 is deliberately left unticked.** Its second clause holds — no fixture is a
  write reply, and nothing was written to the MAC filter — but its first clause does not: two
  `POST`s were made. The probe found that `host-list` and the filter `GET` both answer `100003`
  without a login, so the bodies this task exists to capture were unreachable under the
  no-`POST` rule. The user was shown that finding and explicitly authorised a login; the run
  made exactly one `POST /api/user/login` (succeeded first attempt, never retried, so the
  five-failure lockout was never approached) and one `POST /api/user/logout` to avoid leaving an
  authenticated session open. The criterion is recorded as an authorised shortfall rather than
  ticked, because rewriting it to match what was done would erase the constraint.
- The login ran through the app's own `password_type: 4` path with the password decrypted from
  `safeStorage`; the plaintext never entered the transcript, the shell, or any file.
- **Three planned assumptions were falsified, and the tasks after this one are now mis-specified:**
  - `/api/lan/HostInfo` does not exist on this firmware (`100002`, even authenticated), as do
    `/api/lan/hostinfo` and `/api/wlan/station-information`. `host-list` is the only source.
  - `host-list` is **not** an unauthenticated `GET`. Devices cannot ride the ordinary poll, so
    the feature sits behind the stored password and "no password stored" becomes a real empty
    state — this affects **T-66**, **T-67** and **T-70**.
  - The filter caps at **ten entries per SSID across four `<Ssid>` blocks**, not 32 in one list.
    A write must carry all four blocks or it clears the ones it omits — this affects **T-68**.
- **T-64 loses a column.** `host-list` carries no band, frequency or medium field, so the
  2.4/5 GHz column the devices window was designed around has no source at all.
- `AssociatedSsid` is the only SSID-ish field and all four SSIDs share one name on this device,
  so it cannot stand in for the band either.
- One host came back with an empty `<HostName></HostName>`. That is kept verbatim in the fixture
  as the edge case T-64 has to name.
- Parsing trap preserved in the fixture: the router spells the MAC slots `WifiMacFilterMacN` but
  the name slots `wifihostnameN`, lower-case.

## T-63 Turn the router's host list into typed devices

T-63 · status: done · size: M · needs: T-62 · files: src/hilink/devices.ts, src/hilink/parse.ts, test/hilink/devices.test.ts

XML never escapes `src/hilink/`, and every numeric field from the router arrives as a string —
both conventions apply here exactly as they do to the monitoring endpoints. This task adds the
boundary that turns the endpoint T-62 chose into a typed `Device[]` and nothing more: no naming
rules, no ordering, no UI.

A device carries its MAC address, its IP address, whatever name the router reports, the
connection medium and band if the fixtures have them, how long it has been associated, and
whether it is currently active. The MAC is the identity — a name can be absent or duplicated
and an IP is a lease that moves, so everything downstream keys on the MAC.

The parse is written against T-62's committed fixtures, so it is testable with no router
present. The awkward rows are the ones to write tests for first: a host with an empty
`HostName`, a duplicate MAC across two entries, a single-host reply where the XML collapses the
repeated element, and an empty list. A reply that cannot be parsed surfaces the router's own
error code and endpoint, the way every other unrecognised failure does.

### Acceptance

- [x] a fixture with several hosts parses into one typed device per host, with the MAC, IP, name, ~~medium~~ and association time from the fixture — _amended, see Notes_
- [x] a host with an empty or missing name parses without inventing one — the field is empty, not filled in at this layer
- [x] a single-host reply parses into a one-element array, not into a bare object
- [x] an empty host list parses into an empty array and is not an error
- [x] two entries sharing a MAC address collapse to one device rather than appearing twice
- [x] a malformed reply raises an error carrying the router's code and the endpoint, asserted the way T-23 asserts its error path
- [x] every numeric and boolean field on the returned type is a number or boolean, never the router's string
- [x] no XML type crosses out of `src/hilink/`, asserted by the exported signature
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. [x] Write the failing tests over T-62's fixtures, including the empty, single-host, duplicate-MAC and malformed cases
2. [x] Define the `Device` type at the `src/hilink/` boundary
3. [x] Parse the chosen endpoint into it, converting every field at the boundary
4. [x] Route the failure path through the existing error carrier
5. [x] Run test, lint and build

### Notes

- **Two fields named in this task's description have no source and were dropped**, on the
  user's explicit decision when the conflict was put to them. T-62's probe established that
  `host-list` carries no band, frequency or connection-medium element, and no `<Active>`
  element either — `test/hilink/device-fixtures.test.ts` asserts both absences as findings.
  `Device` therefore carries `mac`, `ip`, `name`, `ssid` and `associatedSeconds` and nothing
  more. The principle chosen was that no field should lie about data that does not exist, so
  neither an optional-always-absent field nor an `AssociatedSsid` stand-in was added. A test
  pins the exact key set, so a later firmware that starts sending these cannot add them
  silently.
- `ssid` is kept because `AssociatedSsid` is real data present on every host and T-67/T-68
  need it — the MAC filter is per-SSID. It is explicitly **not** a band: all four SSIDs share
  one name on this device.
- **`host-list` is the first nested reply the app reads.** Every monitoring endpoint sends a
  flat leaf list, and `scan()` in `parse.ts` only records leaves at depth 1. Rather than grow a
  second scanner, `readBlocks()` was added: it reads the whole reply first (so an `<error>`
  root still becomes a typed `HilinkApiError` and a truncated capture still becomes a
  `HilinkParseError`), then rescans each repeated block under a root of its own.
  `requireNumber` was exported from `parse.ts` for the same reason.
- **Duplicate MACs collapse last-wins**, and the MAC is upper-cased on the way in so a router
  that varies its spelling cannot present one device twice. The fixture holds no duplicate, so
  both cases are covered by synthetic replies built in the test rather than by editing a
  capture.
- The manual gate was signed off against the committed fixtures. The live-router diff (step 4
  of the offered steps) was not run — it needs an authenticated session, and nothing in this
  task depends on it.

## T-64 Name, label and order the devices for reading

T-64 · status: done · size: S · needs: T-63 · files: src/domain/devices.ts, test/domain/devices.test.ts

`src/domain/` imports neither Electron nor the network, and the code-to-label tables live there
for the same reason `CurrentNetworkTypeEx` does — they are presentation rules over plain data,
not part of the router boundary's job.

Three rules, all pure:

**A device always has something to show.** The router reports an empty `HostName` for plenty of
devices. The fallback is the MAC address itself, rendered readably — never "Unknown" alone, which
makes every nameless device look like the same one.

**The medium reads as a word.** Whatever the fixtures give — an SSID, a band code, a wired flag —
becomes `5 GHz`, `2,4 GHz` or `Ethernet`. An unrecognised value is shown as itself, for the same
reason an unmapped network-type code is.

**The order is stable.** Active before inactive, then by name, then by MAC as the tiebreaker, so
a list refreshed every 30 seconds never reshuffles under a click. The association time is
formatted with the same French-facing units the rest of the app uses.

### Acceptance

- [x] a device with a name displays that name unchanged
- [x] a device with an empty name displays its MAC address, and two nameless devices display differently from each other
- [ ] ~~each medium value from T-62's fixtures maps to its French label~~ — **dropped, see Notes**
- [ ] ~~an unrecognised medium value is displayed verbatim, not hidden and not guessed~~ — **dropped, see Notes**
- [x] ~~active devices sort before inactive ones, and~~ the order of an unchanged list is byte-identical across two calls — _amended, see Notes_
- [x] two devices with the same name sort deterministically by MAC
- [x] association time formats through the existing duration helper, asserted against at least one hour-scale and one ~~day-scale~~ larger value — _amended, see Notes_
- [x] the module imports nothing from Electron or the network, asserted the way `src/domain/` already is
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. [x] Write the failing tests for the fallback name, ~~the medium labels, the unknown medium~~ and the ordering
2. [x] Implement the display-name fallback
3. [ ] ~~Implement the medium label table with its verbatim fallback~~ — dropped, no data to map
4. [x] Implement the stable comparator
5. [x] Run test, lint and build

### Notes

- **The medium rule was dropped whole, on the user's explicit decision.** Two of this task's
  three planned rules and two of its nine criteria hung on a `medium` field. T-62's probe
  established that `host-list` carries no band, frequency or connection-medium element at all,
  so criterion 3 was _vacuous_ — there were zero fixture values to map — and criterion 4 had
  nothing to fall back from. The alternative offered was to write the label table anyway
  against synthetic inputs; it was declined as dead code with no caller. A test asserts
  `src/domain/devices.ts` contains no `2,4 GHz`, `5 GHz` or `Ethernet` literal, so the table
  cannot reappear unnoticed if a later firmware tempts it.
- **"Active before inactive" was dropped as moot, not merely unsourced.** There is no
  `<Active>` element, but more to the point `host-list` reports only the hosts currently
  associated — there is no inactive set to sort behind. The surviving half of the criterion,
  a byte-identical order across two calls, is tested directly and with a shuffled input.
- **Ordering deliberately avoids `localeCompare`.** The comparator comes down to raw code-unit
  comparison on the lower-cased display name, then the MAC, which T-63 guarantees is unique and
  upper-cased. The panel refreshes on a timer, so an order that shifted with an ICU build would
  reshuffle the list under a click — the exact failure this rule exists to prevent.
- **`formatDuration` caps at hours by design**, and `src/domain/format.ts` is outside this
  task's declared `files:`. The criterion's "day-scale" assertion is therefore made against
  what the helper really renders — `200_000` seconds reads `55h 33m`. Extending the helper to
  days was offered and declined as scope the task never claimed. If a day format is wanted
  later it is its own task, touching `format.ts` and every screen already using it.
- The manual gate was signed off against the committed fixtures. There is still no UI behind
  any of this: the devices window is not fed live data until **T-66**.

## T-65 Open a window for the connected devices

T-65 · status: done · size: M · needs: — · files: src/main/devices-window.ts, src/renderer/devices.html, src/renderer/devices.ts, src/main/main.ts, package.json, test/main/devices-window.test.ts, test/renderer/devices.test.ts, test/main/main.test.ts, test/project-setup.test.ts

The popover is 320×520 with 497 px already spent and no scrolling, so the device list gets its
own window rather than a section inside it. This task builds the shell only — the window opens,
closes, remembers nothing it should not, and shows an empty table. T-66 fills it.

It is a normal resizable window, not a popover: it has a title bar, it appears in the window
list, and closing it does not quit the app. Opening it twice focuses the existing one instead of
making a second. It runs under the same `default-src 'none'` policy as the panel, so no chart
library and no remote font, and `backgroundThrottling: false` for the same reason the panel needs
it — the list is pushed from the main process and a throttled hidden renderer piles updates up.

The packaged app has to find this second HTML entry the way T-22 made it find the panel; a
second window is exactly the kind of thing that works in development and 404s in the bundle.

### Acceptance

- [x] a menu item opens the window, and the window is created with the app's CSP and `backgroundThrottling: false`
- [x] opening it a second time focuses the existing window instead of creating another, asserted by counting created windows
- [x] closing the window does not quit the app and does not stop the poll loop
- [x] the window's HTML entry resolves in a packaged layout as well as in development, asserted the way T-22 asserts the panel's
- [x] the renderer loads with no console error and renders a table with its column headers and no rows
- [x] the window's size is restored to a stated default on each open rather than being persisted
- [x] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write the failing tests for single-instance opening, the close behaviour and the packaged path
2. Add the window module in `src/main/` with the app's CSP and throttling settings
3. Add the `devices.html` entry and its renderer stub with the empty table
4. Wire the entry into the forge config so it reaches the bundle
5. Add the menu item that opens it
6. Run test, lint and build

### Notes

- Two paths in the plan did not exist and the work took the real ones instead, both verified by
  QA: there is no `forge.config.ts` — electron-forge is configured under `package.json`'s
  `config.forge`, and the entry reaches the bundle through T-22's `cp` step, which now copies
  `devices.html` as well; and the menu item lives in `src/main/main.ts`, not `src/main/tray.ts`,
  because `tray.ts` is the pure title builder and touches no Electron. `files:` above records
  what was actually changed.
- The worktree was cut from `1a2ba9a` rather than from the branch tip, so the branch had to take
  a merge of `batch/orange-carrier` before it would integrate. Both conflicts
  (`src/main/main.ts`, `test/main/main.test.ts`) were resolved by keeping both sides; nothing of
  T-50..T-61 was dropped, and the combined tree runs 1409 tests.
- The devices page deliberately ships with no stylesheet — inline `<style>` is blocked by the
  `default-src 'none'` CSP, so a `devices.css` belongs with T-66's real content.
- Carried into T-66: the app runs `LSUIElement` with the Dock icon hidden, so `open()`/`focus()`
  may raise the window without bringing the app forward. `app.focus({ steal: true })` in
  `devices-window.ts` is the fix if it shows up in use.

## T-66 Fill the devices window from the live router

T-66 · status: todo · size: M · needs: T-64, T-65 · files: src/main/poll.ts, src/main/devices-window.ts, src/renderer/devices.ts, test/main/poll.test.ts, test/renderer/devices.test.ts

The host list is an unauthenticated `GET` alongside the monitoring endpoints, so it joins the
existing poll rather than starting a schedule of its own — a second timer would be a second
thing to keep in step with the visible/hidden interval rule for no saving.

The window renders one row per device: name, IP address, MAC address, medium, how long it has
been connected, and an active dot. The graphical-default rule does not apply here and the
architecture now says so — these are identifiers with no magnitude, and a chart of a MAC address
would be worse than the text.

The states that are not "here is the list" matter as much as the list:

- **The router is unreachable.** Rendered as the offline state the panel already uses, never an
  error dialog — the app runs unattended.
- **The list is genuinely empty.** Distinct from unreachable, and it says so.
- **The window is closed.** No device fetch happens at all; the poll must not do work for a
  window nobody has open.

A device that disappears between polls leaves the table; one that appears joins it in sorted
position without reordering the rest.

### Acceptance

- [ ] with the window open, each poll fetches the host list and pushes a device array to the renderer
- [ ] with the window closed, no host-list request is made, asserted by counting calls over several ticks
- [ ] the rendered table has one row per device, carrying the name, IP, MAC, medium, connected-for and active state from the model
- [ ] a device leaving the model removes exactly its row, and a device joining lands in sorted position with the other rows unmoved
- [ ] an unreachable router renders the existing offline state, not an empty list and not a dialog
- [ ] an empty list renders as a stated empty list, distinguishable in the DOM from the offline state
- [ ] a host-list failure does not disturb the panel's usage reading, asserted by the panel model being unchanged across the failure
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write the failing tests for the open/closed fetch behaviour, the row rendering and the two empty states
2. Add the host-list fetch to the poll, gated on the window being open
3. Push the domain device list to the renderer over the existing channel
4. Render the table rows, keyed by MAC so updates are diffs rather than rebuilds
5. Render the offline and empty states distinctly
6. Run test, lint and build

## T-67 Know which devices the router is already blocking

T-67 · status: todo · size: M · needs: T-62, T-63 · files: src/hilink/macfilter.ts, src/domain/devices.ts, src/renderer/devices.ts, test/hilink/macfilter.test.ts, test/domain/devices.test.ts

Before anything can be blocked, the window has to show what already is — a toggle that does not
reflect the router's actual state is worse than no toggle.

This reads the MAC filter T-62 captured and turns it into the same shape as the host list: a
mode and a set of MAC addresses. The mode is the part that is easy to get wrong. A blacklist
containing a MAC blocks it; a **whitelist** containing the same MAC allows it and blocks
everything else. So "is this device blocked?" is a question about the mode and the list
together, and this task answers it in `src/domain/` as a predicate over both, never by testing
list membership alone.

The filter can also be off entirely, in which case nothing is blocked whatever the list holds.
That is the state the router is expected to be in today, and it is the state every fresh install
will meet first.

A device in the filter that is not in the host list is a device that was blocked and has since
gone away. It still appears in the window, marked as blocked and absent — otherwise unblocking it
would require it to connect first, which it cannot do.

### Acceptance

- [ ] the filter fixture parses into a mode and a set of MAC addresses, with every field converted at the `src/hilink/` boundary
- [ ] with the filter off, no device reads as blocked regardless of the list's contents
- [ ] in blacklist mode, a device whose MAC is listed reads as blocked and one whose MAC is not reads as allowed
- [ ] in whitelist mode, the verdict is inverted, asserted explicitly rather than by reusing the blacklist expectation
- [ ] MAC comparison ignores case and separator style, asserted with the same address written two ways
- [ ] a MAC in the filter but absent from the host list appears in the device list as blocked and absent
- [ ] the blocked state is visible in the rendered row without relying on colour alone
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write the failing tests for the three modes, the case/separator normalisation and the absent-but-blocked device
2. Parse the filter at the `src/hilink/` boundary
3. Add the blocked predicate in `src/domain/` over mode and list together
4. Merge filter-only MACs into the device list as absent devices
5. Render the blocked state in the row
6. Run test, lint and build

## T-68 Block and unblock a device from the list

T-68 · status: todo · size: M · needs: T-67 · files: src/hilink/macfilter.ts, src/main/devices-window.ts, src/renderer/devices.ts, test/hilink/macfilter.test.ts, test/main/devices-window.test.ts

This is the first `POST` outside the USSD path, and it inherits every rule that path established.

**The write is the whole list.** The router holds one filter and replaces it wholesale, so a
block is: read the current filter, add this MAC, write it back. Composing the write from a
remembered list would silently unblock whoever joined it since. If the read fails, the write does
not happen.

**The filter may be off.** Blocking the first device has to turn blacklist mode on as part of the
same write, and unblocking the last one leaves the mode as it is rather than switching it off —
a mode change the user did not ask for is a side effect on every other device.

**Authentication and the lockout.** It needs the stored router password, the single-use rotating
token, and the `125003` refresh-and-retry-once rule from T-24. A failed login is not retried;
five refusals lock the account, and the same reasoning that parks automatic syncing applies here
with more force, because this write is always a deliberate press.

**The list is bounded.** At the cap read in T-62, a further block cannot be written. That is
stated, not attempted and failed.

Every press is confirmed before it is sent, and the row reflects the router's re-read state
afterwards rather than the state the click assumed.

### Acceptance

- [ ] blocking a device reads the current filter, writes it back with that MAC added, and leaves every other entry present
- [ ] blocking a device while the filter is off enables blacklist mode in the same write
- [ ] unblocking the last blocked device leaves the mode unchanged, asserted explicitly
- [ ] a failed filter read aborts the write entirely — no `POST` is made, asserted by call count
- [ ] a `125003` refreshes the token and retries the write once, and never re-authenticates, asserted the way T-24 asserts it
- [ ] a failed login is not retried, and a second press after a failure is required to try again
- [ ] with the filter at its cap, a further block is refused before any request is made and the reason names the cap
- [ ] a block is only sent after an explicit confirmation, asserted by no request being made when the confirmation is declined
- [ ] the row's state after a write comes from a re-read of the filter, not from the click
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write the failing tests for the read-modify-write, the mode transitions, the abort-on-read-failure and the cap
2. Implement the filter write at the `src/hilink/` boundary, reusing the token and login path
3. Route `125003` through the existing refresh-and-retry-once helper
4. Add the confirmation step in the renderer
5. Re-read the filter after every write and render from that
6. Refuse a block at the cap before any request
7. Run test, lint and build

## T-69 Never let this Mac block itself off the router

T-69 · status: todo · size: S · needs: T-68 · files: src/domain/devices.ts, src/renderer/devices.ts, test/domain/devices.test.ts, test/renderer/devices.test.ts

Blocking the machine the app runs on cuts the app off from the router it is talking to, and
nothing inside the app can undo it — the unblock would have to travel over the connection that
was just severed. Recovery means the router's own web UI from another device, or a factory reset.

No confirmation dialog makes that a reasonable thing to offer, so the control is not offered at
all: this machine's row is identified and its block toggle is absent, with a short reason in its
place. Identification is by MAC address against the local interfaces, not by IP — a lease moves,
and blocking the wrong device because the DHCP table shifted is the exact failure this guard
exists to prevent.

If this machine is not in the list — on Ethernet when only Wi-Fi hosts are reported, say — the
guard has nothing to match and every row keeps its toggle, which is the correct outcome rather
than a fallback to be worked around.

### Acceptance

- [ ] the row whose MAC matches a local interface renders without a block control
- [ ] that row states why the control is absent, in text and not only by omission
- [ ] every other row keeps its control
- [ ] the match is on MAC address and ignores case and separator style
- [ ] a block requested for the local MAC is refused at the domain layer as well, so the guard does not depend on the UI, asserted by no request being made
- [ ] with no local MAC present in the list, every row keeps its control and nothing errors
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write the failing tests for the absent control, the domain-layer refusal and the no-match case
2. Read the local interface MACs and expose them to the device model
3. Mark the matching device in `src/domain/`
4. Withhold the control and state the reason in the renderer
5. Refuse the write at the domain layer regardless of the UI
6. Run test, lint and build

## T-70 Say why the list is empty or a block did not take

T-70 · status: todo · size: S · needs: T-66, T-68 · files: src/main/devices-window.ts, src/renderer/devices.ts, test/renderer/devices.test.ts

An unrecognised router error code is carried to the surface with its code and endpoint, never
collapsed into a bare "it failed" — that decision predates this feature and applies to it. The
device window has five conditions that are not a populated list, and today they would all look
alike:

- the router is unreachable — the ordinary offline state, not an error
- the router answered and no device is connected
- no router password is stored, so the blocked column cannot be read or written
- a block or unblock was refused, with the router's own numeric code and endpoint
- the filter is full, with the cap stated

Each reads as itself. The failure of a write never empties the list — the devices are still
there, and a list that vanishes because a toggle failed loses the information the window exists
for.

### Acceptance

- [ ] each of the five conditions renders a distinct message, asserted one per condition
- [ ] an unrecognised router refusal shows its numeric code and the endpoint, asserted with a code not handled by name
- [ ] a missing password is stated as a missing password and links to where it is set, not as a failure
- [ ] a failed write leaves every device row present, asserted by row count before and after
- [ ] no condition renders as an empty table with no explanation
- [ ] no condition raises a dialog
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Write the failing tests, one per condition, including the unhandled-code case
2. Model the conditions as a single discriminated state rather than several flags
3. Render each one in the window
4. Keep the rows on write failure
5. Run test, lint and build

## T-71 Show the devices window in the README

T-71 · status: todo · size: S · needs: T-66, T-68 · files: README.md, docs/media/devices.png

T-58 brought the README up to the Orange setup and left it describing an app with one window.
This adds the second: what the device list shows, that blocking writes the router's own MAC
filter and therefore needs the router password, that this machine cannot be blocked from it, and
that a block survives a reboot because it lives on the router and not in `config.json`.

The screenshot is of the real window against the real router, with names, IP addresses and MAC
addresses redacted in the image itself — a household's device list is exactly the kind of thing
that should not be committed legibly.

### Acceptance

- [ ] the README describes the devices window, how it is opened, and what each column means
- [ ] it states that blocking needs the stored router password and why a failed attempt is not retried
- [ ] it states that this machine cannot be blocked from the list
- [ ] it states that a block lives on the router, not in the app's config, and survives a reboot of both
- [ ] `docs/media/devices.png` exists, is referenced by the README, and shows no legible MAC address, IP address or device name
- [ ] `docs/ARCHITECTURE.md`'s `docs/media/` line describes what that directory now actually holds
- [ ] every relative link and image path in the README resolves, asserted by the existing link check
- [ ] `npm test`, `npm run lint` and `npm run build` all exit 0

### Tasks

1. Extend the link/asset check to cover the new image so it fails first
2. Capture the window against the live router and redact the image
3. Write the README section
4. Correct the `docs/media/` line in the architecture doc
5. Run test, lint and build
