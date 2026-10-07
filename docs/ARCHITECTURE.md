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
- icon: `npm run icon` (rasterises `assets/icon.svg` into the `.iconset` and `.icns`)
- make: `npm run make` (Electron Forge makers → `.dmg` and `.zip` under `out/make/`; what the release workflow uploads)
- make (Windows): `npm run make:win` (Squirrel `Setup.exe`; runs on the Windows CI runner, not on the Mac)

`npm run icon` draws through an offscreen Electron window, so it launches a GUI
process — a sandboxed shell blocks it and the run hangs silently. `npm test`
inherits that, because the icon test runs the real rasteriser.

`tsconfig.json` is the strict base used for type-checking `src/` and `test/`;
`tsconfig.build.json` extends it, narrows the inputs to `src/` and is the only config
that emits. `test/fixtures/` is excluded from both, and from ESLint — it holds code that
is deliberately invalid.

## Areas

| Area     | Doc                    | Paths                                                                                            |
| -------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| hilink   | docs/areas/hilink.md   | src/hilink/, test/hilink/, test/fixtures/hilink/                                                 |
| pace     | docs/areas/pace.md     | src/domain/pace.ts, test/domain/pace.test.ts                                                     |
| orange   | docs/areas/orange.md   | src/orange/, test/orange/, test/fixtures/orange/                                                 |
| yas-sync | docs/areas/yas-sync.md | src/domain/allowance.ts, src/main/sync.ts, test/domain/allowance.test.ts, test/main/sync.test.ts |

## Folder structure

```
src/
  hilink/       router client — session handshake, login, XML parsing, USSD dialogue
  orange/       Orange selfcare portal — fetch 123.orange.mg, parse forfaits from HTML
  domain/       quota math, allowance anchor, formatting — pure, no I/O, no Electron
  config/       read and write the plan limit, router address and allowance anchor
  main/         Electron main process — tray, poll loop, popover window, login item,
                keychain-backed router password
  renderer/     popover UI (HTML + CSS + TS) — the Usage and Devices tabs are one page
test/           mirrors src/, one .test.ts per source file
assets/         icon sources — hand-written SVG, and the PNG/.icns rasterised from them
scripts/        build-time scripts that are not part of the app — icon rasterisation
docs/media/     screenshots referenced by README.md — the panel and Devices tab captures are redacted by hand, and no script regenerates them
site/           static GitHub Pages download page — plain HTML/CSS, no build step
.github/workflows/  CI — the release workflow builds the app on a `v*` tag and the Pages workflow deploys `site/`
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
- **Supersedes the high-water decision above:** the dial's 100% is the plan cap the user set, not the highest remaining ever anchored — with one anchor the high-water mark equals that anchor's own remaining, so the dial is forced to 0% after every first sync
- Consumed volume is `cap − remainingNow`, never the router's month counter — the counter's absolute value is anchored to the device's own clear time, not to the carrier's billing period, so the two figures were describing different months on the same card
- The router's month counter survives only as the delta inside `remainingNow` — it is a trustworthy accumulator and a meaningless absolute, and the anchor already uses it in exactly that shape
- The dial is absent, not zero, until the first successful sync — a percentage of a number the carrier never confirmed is worse than an honest prompt
- The plan cap is entered in the panel rather than only in `config.json` — a hand-edited config field is a setting nobody finds, and the panel already has an input for the router password
- USSD is dialled automatically only when no usable anchor exists — that keeps first launch self-configuring without turning every start into a carrier dialogue and a login attempt against a device that locks after five failures
- The "Resets in" countdown is gone — it was derived from the router's `StartDay`, which disagrees with the carrier's own expiry date, and "Valid for" states the date that actually governs the allowance
- A `planTotalBytes` left in an existing `config.json` is ignored on load rather than rejected — the app wrote that key itself, so a file it produced must never be a file it refuses to start from
- The dial's share cannot pass 100% — consumption is the cap minus the carrier's remaining, and that remaining never goes below zero, so an overrun is not a state the ring can be asked to draw
- Signal strength is four filled bars, not a coloured square plus a `5/5` string — an icon that looks the same at one bar as at five is decoration, and once the bars carry the level the text beside them is a second answer to the same question
- The signal bars are markup, not SVG — the dial and sparklines are drawn because their geometry comes from the model, whereas four bars never change shape and only change which of them are filled
- `CurrentNetworkTypeEx` is mapped to a label in `src/domain/`, not in `src/hilink/` — the code-to-name table is carrier-agnostic constants, and the router boundary's job ends at turning the string into a number
- An unmapped network-type code is shown as the code itself rather than hidden or guessed — the same reason an unrecognised error code is carried to the surface with its number
- The Sync button moves to the header but its status line stays at the foot of the panel — the steps of a dialogue that takes tens of seconds are several lines that arrive over time, and a header that grew and shrank mid-sync would push the dial down while it is being read
- The icon is a hand-written SVG in `assets/`, rasterised by a script rather than committed as a binary from a design tool — the artwork is a ring and four bars, which is geometry a text file states exactly, and a reviewable diff beats an opaque PNG
- Rasterisation runs through Electron's own offscreen `BrowserWindow`, not a new image dependency — Chromium is already in the tree and renders the SVG identically to the panel that inspired the mark, so the icon cannot drift from the UI it belongs to
- The generated PNG and `.icns` artefacts are committed, not built on demand — `electron-forge` reads `packagerConfig.icon` from disk at package time, and a packaged build must never depend on a rasterisation step having been run first
- `assets/` and `scripts/` are added to the forge ignore list — the icon reaches the bundle through `packagerConfig.icon`, so shipping its sources inside the asar would be dead weight
- The menu bar glyph is the signal bars and changes with the level, while the `.icns` is the ring mark — a tray image that never changes is the decoration already rejected for the panel, whereas the bundle icon's job is identity, not measurement
- The tray glyph is a template image, so macOS inverts it for dark and light menu bars and for the selected state — a coloured tray icon is the one thing that always looks wrong on one of the two appearances
- **Widens the "USSD only on an explicit press" decision above:** a dialogue also runs when the stored anchor is older than `syncStaleAfterMinutes` — an anchor carried forward for hours by a counter delta drifts from the carrier's own figure, and the whole point of the feature is that the panel states a number the carrier agreed with
- Staleness is checked on panel open and on a background timer, not on every poll tick — the poll runs every 30 seconds and would otherwise turn one stale window into a dialogue attempt loop
- The stale clock restarts only on a successful sync, and a failure parks automatic syncing until an explicit press — otherwise a wrong password would be re-offered every 30 minutes and lock the account within three hours
- The pace compares the share of the allowance spent against the share of the period elapsed, both cumulative — a per-day comparison would need stored daily usage, and cumulative shares already give the weekend-offsets-a-heavy-Monday behaviour for free
- **Reversed (T-79):** the plan's size and length are derived from the sync that detects a new plan (`remainingBytes`, and whole days to `expiresAt`), and a typed value is only an override — at that moment the carrier's remaining _is_ the plan size, and a hand-typed number was the thing that went stale on every top-up
- The pace is absent, not `safe`, until both a cap and a plan length are set — the same reason the dial is absent before the first sync
- **Supersedes the line above:** the pace reading is tiered, and a synced anchor alone already yields `remainingNow / daysUntilExpiry` — the app holds a remaining volume and an expiry date from its first sync, so gating the most useful daily figure behind two typed values withheld an answer it could already give
- Only the band and `affordedPerDay` still require a cap and a plan length — those two are genuinely un-derivable from the carrier's reply, whereas the sustainable daily figure is not
- Loading a new plan needs no reset control — every sync replaces the whole anchor through `anchorFrom`, so a reset button would clear nothing a sync does not already overwrite
- **Reversed (T-79):** a new plan re-derives the cap instead of marking it unconfirmed — a new plan still must never keep a stale cap (a top-up above it clamps the dial to 0%), but the fix is to take the carrier's own figure, not to ask for a retype; each value records whether its source is `carrier` or `user`, and a `user` value lasts until the next new plan
- The new-plan contradiction is read against the anchor being replaced, not against the cap alone, and Confirm is its own message that vouches for the stored cap — re-sending the hidden settings field confirmed the _old_ cap, and every later sync of the same bigger plan re-read the same contradiction and cleared the confirmation again (T-78)
- A refused Confirm is worded on the new-plan prompt itself, and every refusal line is re-marked on each refused press — a refusal written into the hidden settings view, or repeated word for word, reads as a press that did nothing
- The `over` band starts at 1.20 rather than above it — 150 Go over 30 days affords 5 Go a day and the ratio for 6 Go is exactly 1.20, so the intended verdict sat on the wrong side of an inclusive bound
- The pace states `averagePerDay` beside `affordedPerDay` as well as the ratio — "6.1 Go a day against 5.0" is the sentence the user reasons in, and the ratio alone made them do the division
- `averagePerDay` is derived from the same cumulative used volume and elapsed days as the ratio, never accumulated separately — two independent counters of the same thing eventually disagree, and only one of them would be right
- The pace is a coloured meter rather than a sentence — a band is a magnitude with three named regions, which is the one thing a bar states faster than prose, and the panel already draws its dial and sparklines for the same reason
- The band's colour is never its only signal — the fill crossing the afforded tick says the same thing, so the reading survives a colour-blind viewer and a greyscale screenshot
- The download and upload month totals are gone from the panel — the plan is billed on their sum, the dial and the carrier's remaining already state that sum, and the split answers a question nobody asked of a menu bar app
- The plan cap, the plan length and the router password move behind a settings toggle — three input rows and their error lines are a third of the panel's height serving a value typed once a month, and the panel is 320×520 with no room to scroll
- The panel's default is graphical: any figure with a range, a share or a threshold is drawn, and text is reserved for what has no magnitude — names, dates and error reasons; new panel work starts from a shape, not a sentence
- The carrier is detected at runtime from the router's `FullName`, not chosen at build time or typed in — the SIM can be swapped without touching the app, and the router already reports the answer on an endpoint the poll loop calls anyway
- The YAS USSD path stays in the tree beside the Orange one rather than being deleted — carrier detection means both are live code, and a SIM swap back must not need a release
- On Orange the allowance is read from the selfcare portal on the ordinary poll, with no anchor and no delta — the portal needs no authentication and states consumption directly, so every reason the anchor existed (an expensive, stateful, lockout-prone dialogue) is absent
- The Orange portal is scraped from server-rendered HTML, not from a JSON API — the page ships the figure in its markup and there is no API behind it to call, so the parse is the integration
- The Orange parse reads whatever forfaits the page lists rather than assuming one shape — `full.infoconso.js` renders a percentage ring for capped bundles and none for Wifiber Go+ SSE, so a single hard-coded layout would break on the next plan the user buys
- The Internet forfait is auto-selected and voice, SMS and credit bundles are ignored — the app measures a data allowance, and the other three answer a question the menu bar was never asked
- On Orange the plan period is the calendar month, derived — Wifiber renews on the first, so a typed plan length would be a second source of truth for something the calendar already states exactly; **the cap too is derived (T-80)** when the forfait's page states a total or a percentage ring, and is typed only for a forfait whose page states neither
- The router's month counter has no role at all on Orange — it read 51.1 Go against the portal's 7.37 Go on the same day, so the two count different traffic and joining them would produce a confident wrong number
- An unreachable portal is rendered like an unreachable router, as a state and not an error — the portal only answers on the Orange network, so a laptop on any other Wi-Fi is an ordinary condition
- **Reverses the separate-window decision this line used to state (T-72):** the connected devices are a second tab inside the popover, not a window of their own — a window was chosen because the panel had 497 of its 520 px spent, but a tab spends none of them: the two panes never draw at once, so the list gets the whole 320×520 and the app stays one screen with nothing to summon and nothing left open behind the menu bar
- The device list is the one place text beats a drawing, despite the graphical-default rule — names, IP addresses and MAC addresses are identifiers with no magnitude, and the rule reserves text for exactly that
- Devices are read on the ordinary poll, not on a timer of their own — `host-list` is an unauthenticated `GET` alongside the monitoring endpoints, so a second schedule would be a second thing to keep in step for no saving
- Blocking is the router's WLAN MAC filter, not a per-device API — the device holds one list and the write replaces it whole, so every block reads the current filter first and never composes a write from a remembered one
- A block or unblock is only ever an explicit press and is never retried automatically — the write is an authenticated `POST`, and the same five-failure lockout that forbids a USSD retry loop forbids this one
- The machine running the app can never be blocked from its own device list — cutting the app off from the router it is talking to is unrecoverable from inside the app, and no confirmation dialog makes that a reasonable thing to allow
- A full MAC filter is a stated condition, not an error — the firmware caps the list, and a household reaching that cap has done nothing wrong
- **Corrects the poll line above (T-62):** devices are read only when a password is stored, because `host-list` answers `100003` on an unauthenticated session — it is not on the same footing as `/api/monitoring/status`, so the list rides the poll only once logged in, and "no password stored" is an empty state the window renders rather than an error
- **Corrects the cap in the line above (T-62):** the filter holds ten entries per SSID, not 32, and the reply is four `<Ssid>` blocks rather than one list — a write carries all four or it silently clears the ones it omits
- The devices window drops the 2.4/5 GHz column it was sketched with (T-62) — `host-list` carries no band, frequency or medium field, `/api/lan/HostInfo` does not exist on this firmware, and a column with no source is not worth inventing one for
- **Narrows the "devices ride the poll" line above (T-66, retargeted by T-75):** the host list is read only while the Devices tab is the visible one and the popover itself is open — it is an authenticated request the menu bar never needs, so a pane nobody is looking at must not cost one every 30 seconds; a hidden popover and a popover showing Usage stand it down identically
- The device list is fetched inside the poll's own tick rather than beside it — a request started next to the poll could stack on the router, which is the one thing the settle-then-schedule cadence exists to prevent
- A login taken out for the device list is attempted once and, if refused, stands the list down for the rest of the run — the list is read on every poll while the window is open, and a retry on that cadence would reach the five-failure lockout in minutes
- An empty device list and an unreachable router are different states in the window, not one blank table — only the router can say that nothing is connected, and a router that did not answer has said nothing at all
- The devices window drops the active dot too (T-66) — `host-list` carries no `Active` element and reports only the hosts currently associated, so the dot would be lit on every row it ever drew
- Device rows are keyed by MAC in the renderer and updated in place — the list refreshes on the poll, and rebuilding the table would replace the row under a user reading it
- `WifiMacFilterStatus` becomes a named mode at the `src/hilink/` boundary (T-67) — unlike `CurrentNetworkTypeEx`, which is a carrier-agnostic label table, this number _is_ the reply's own encoding of a state, and a bare `2` crossing into the app would leave every caller re-reading the router's numbering
- "Blocked" is a predicate over the filter's mode and its list together, never a membership test (T-67) — a blacklist holding a MAC blocks it and a whitelist holding the same MAC allows it and blocks everyone else, so the list alone answers the opposite question half the time
- MAC comparison drops separators and case before comparing (T-67) — the host list and the filter slots are the same router spelling the same address two ways, and a raw string test would read a blocked device as allowed
- The four per-SSID blocks are kept beside the collapsed mode and address set (T-67) — the write replaces the filter whole, so the read T-68's `POST` is composed from has to carry the blocks it came from
- An address the filter blocks and `host-list` does not report is shown as a device that is blocked and absent (T-67) — a blocked device stops associating, so without a row of its own it could only be unblocked by connecting first, which is the one thing it cannot do
- A remembered address that does not read as blocked adds no row (T-67) — with the filter off, or under a whitelist, such an entry names a device that is merely remembered or merely permitted, and a ghost row for it answers no question the window was asked
- The blocked state is a word in an Access column, not a tint on the row (T-67) — the window ships unstyled, and the pace meter's rule already stands: colour is never the only carrier of a verdict
- Every write reads the filter first and sends back all four blocks with one address added or removed (T-68) — the router replaces the filter with whatever it is sent, so a write composed from a remembered list silently unblocks whoever joined it since, and a read that fails ends the press rather than guessing
- Blocking the first device turns blacklist mode on in the same write, and unblocking the last one leaves the mode exactly as it found it (T-68) — the user asked about one device, and switching the filter off is a change to every other one
- Blacklist is the only mode this app ever writes, and a filter already in whitelist mode is refused before any request (T-68) — the `1`/`2` mapping is inferred and unverified, and a whitelist blocks every device it does not name, so there is no safe way to reason about one
- A block requested for this machine's own MAC is refused in `src/domain/` before any request, not only hidden in the page (T-68) — the guard must hold whatever the UI renders, and it matches on MAC rather than IP because a DHCP lease moves and the wrong row is the exact failure it prevents
- The cap is stated rather than attempted (T-68) — ten entries per SSID is the firmware's limit, a household reaching it has done nothing wrong, and the refusal names the cap instead of reporting a write that failed
- A press gets its own single sign-in, where the poll's list gets one for the whole run (T-68) — a refused login is never retried inside one press, but a second press tries again, because a press is deliberate and a poll is not
- The row after a write is drawn from a re-read of the filter, never from the click (T-68) — the router is the only thing that knows what it is now refusing, and a row painted optimistically would state a block that may have been refused
- The devices page talks back over a preload bridge on a named channel, where the model rides a global (T-68) — the model only ever flows main → renderer, and this ends in an authenticated `POST`, so it is validated in the main process like every other channel that can reach the router
- This machine's own row carries no block control at all, with a sentence where the button would have been (T-69) — absent rather than disabled, because a disabled control is one attribute away from being pressed and an empty cell would leave the omission to be guessed at; the domain refusal above stands whatever the page renders
- Which row is this machine is decided in `src/domain/` from the interface MACs the main process reads, and travels on the row (T-69) — the page is told the verdict rather than working it out, exactly as it is told the blocked one, and a machine with no interface in the list marks nothing and leaves every row its control
- **Corrects "no password stored is an empty state" above (T-70):** no password stored is a state of its own, `no-password`, and never the offline one — the router is fine and has not been asked anything, and blaming it for something the user settles in the panel in ten seconds sends them looking in the wrong place
- Why a press changed nothing rides beside the list rather than replacing it (T-70) — a write that failed has said nothing whatever about which devices are connected, and a table that emptied over a refused toggle would throw away the one thing the window exists to show
- The refusal the window states is the `DeviceBlockRefusal | RouterFailure` the domain and the router boundary already speak, joined and not re-invented (T-70) — a second vocabulary in the renderer would have to be kept in step with both, and the refusal it could not name is exactly the one whose number matters
- An unrecognised router refusal reaches the devices window with its code and its endpoint intact (T-70) — the same rule the sync panel already keeps, because a bare "the change was refused" leaves nothing to act on and nothing to report
- Every one of the five reasons the window has no list, or no change, is a sentence on the page and never a dialog (T-70) — the app runs unattended, so a modal nobody dismisses blocks it for as long as it is left alone; the block confirmation stays, being the one thing a person is standing there for
- Both tabs exist in the DOM from first paint and selection only flips an attribute (T-72) — device rows are keyed by MAC and updated in place, and a pane rebuilt on every tab press would discard exactly the identity that keeps a row steady under a reader
- The panel reopens on whichever tab was last shown (T-72) — someone who went looking for a device usually looks again, and the tray title already states the usage figure, so re-showing Usage on every open would cost a press to get back where they were
- The Devices pane scrolls and the Usage pane does not (T-73) — the panel's no-scrolling rule exists because the usage figures are a fixed set that must all be readable at once, whereas a household's device count is unbounded and there is no layout that fits an unknown number of rows
- The device list is a stacked list rather than a table at 320 px (T-73) — the seven columns the 520 px window declared do not fit a third of that width, so the name and the address stack in one column with the access word beside them, and the address, network and duration run together on a muted line under them; nothing the window showed is dropped, only re-laid
- Every line of a row truncates with an ellipsis rather than wrapping (T-73) — a device names itself and the name has no length limit, so a wrapping row would be of unknown height and the scroll budget above it unknowable; the access word is the one part that never gives, because it is the verdict the pane exists to state
- `DevicesModel` moves into `src/main/view-model.ts` beside `PopoverModel` (T-73) — the list is now part of what the one panel shows, and leaving its model in `devices-window.ts` would make T-76's deletion of that window a deletion of the live model too; the window re-exports it until then
- The block control keeps its own preload channel, now on the popover's bridge rather than a second page's (T-74) — the channel is validated in the main process because it ends in an authenticated `POST`, and which window it arrived from was never what made it safe
- The payload check moves with the channel, unchanged rather than re-implemented (T-74) — a second validator would be a second thing to keep correct on the one path in this app that writes to the router, and the check T-68 wrote is the thing that made the channel safe in the first place
- The device list reaches the page on an entry point of its own, beside `applyPopoverModel` rather than inside it (T-74) — the figures land every couple of seconds and the list only while the Devices tab is showing, so one combined push would mean either sending a stale list or fetching one nobody is looking at
- Both the window and the panel are pushed the same model while both exist (T-74) — the window is deleted by T-76, and pushing only one of them would leave the other stating a household that had moved on
- Which pane is showing travels renderer → main on a channel of its own, and the tab itself never travels back (T-75) — the poll needs it to decide whether an authenticated request is worth making, but which pane the user is on is theirs, and a model that decided it would snatch the panel back to Usage mid-read
- The tab is reported on selection and on every reopen, never on every model (T-75) — the tab changes when someone changes it, and a message a couple of times a second would be a channel repeating itself; a reopen has to say it again because a hidden panel stood the list down
- A tab name the main process does not recognise leaves the last one standing (T-75) — falling back to Usage would stand the device list down under a user looking straight at it, which is the one failure the channel exists to prevent
- **Replaces the window-open gate outright (T-75):** the devices window stops being fed by the poll from here, rather than the two conditions being OR'd — an OR would keep asking the router for a list nobody is reading, and T-76 deletes that window days later anyway
- The devices window, its page and its renderer are deleted rather than left unreferenced (T-76) — an unreferenced module still compiles, still lints and still reads as part of the app to the next person opening the tree, and its assertions now live on the pane, so keeping both would be two descriptions of one feature with one of them testing dead code
- A test walks `src/` and `test/` for the deleted names rather than trusting the deletion (T-76) — a stale import, a comment or a build-script argument left pointing at a file nobody ships is exactly what a grep catches and a compiler does not
- The tray keeps its devices entry and it opens the panel on the Devices tab (T-76) — one right-click and one item is the fastest route to the list, and that is worth keeping even though the surface it lands on changed; it is never a toggle, because someone reaching for the list twice wants the list
- The pane is pushed before the model on every open and on every load (T-76) — a tray entry that asked for Devices must not flash the figures on the way there
- `src/domain/devices.ts` and `src/hilink/devices.ts` are untouched (T-76) — the domain that decides what a device _is_, and the boundary that parses one, were never the window
- A successful Set states that it was saved on the field's own status line, even when the value did not change (T-82) — a press that moves nothing on screen reads as a dead button, and the refusal already has that line, so a success gets it too
- Forfait alerts are decided by one pure function in `src/domain/alerts.ts` that takes the reading, the clock and what was already announced, and returns what to show and what to notify — the schedule (30 % remaining; 5, 4, 3, 2 days before the end; hourly on the last day, silent 22:00–07:00) is arithmetic on dates and volumes, and testing it must not need Electron or a router
- A low forfait fires one macOS notification and then stays as a panel banner and a tray-glyph mark until a recharge, never as a repeated pop-up — "always visible until recharge" is a state, and a notification re-sent on a timer is noise the user learns to dismiss unread
- A recharge clears the low-forfait state when the carrier's figure says so — on YAS the new-plan detection T-79 already performs, on Orange a new calendar month or a consumed figure that moves backwards — never a timer or a dismiss button, because only the carrier knows the forfait was topped up
- What has been announced is kept in `config.json` keyed by the period's end date, so a restart neither repeats a reminder nor loses one — the app is relaunched at login and the poll restarts from nothing
- A reminder missed while the Mac slept or during quiet hours is not replayed in bulk — only the newest due reminder fires, since five stale notices at 07:00 state nothing the latest one does not
- Settings are a third panel tab beside Usage and Devices, replacing the ⚙ header toggle — every setting has one discoverable home, and a tab costs the figures no height
- Launch at login is turned on once, on the first packaged launch, and a `launchAtLoginDefaulted` flag in `config.json` stops it from ever being re-applied — after that only the user’s switch changes it, and an unpackaged dev run never registers the bare Electron binary as a login item
- The author, version and repository link shown in the app are read from `package.json` (`author`, `version`, `repository`) through one module, never typed into the UI — a release bumps one file, and the About section and the native About panel can never disagree
- Releases are built by GitHub Actions on a pushed `v*` tag and attached to a GitHub Release, never uploaded by hand — the artifact anyone downloads is reproducible from the tag, and the tag must match `package.json`'s version or the job fails
- The app ships unsigned and un-notarised — there is no Apple Developer account; the download page and README carry the one-time "Open Anyway" instructions instead, and nothing in the build depends on signing so adding it later is a CI-secrets change only
- One universal (`arm64` + `x64`) build per release — the author's Mac is Intel and most current Macs are Apple silicon, and one file avoids asking a non-technical user which chip they have
- The GitHub Pages site links to `releases/latest/download/<fixed asset name>`, never a versioned URL — the page never needs editing when a new version ships
- Windows support is 1.1.0, after the macOS 1.0.0 release, and every platform difference is decided in one `src/main/platform.ts` taking `process.platform` as an argument — the rest of `src/main/` asks it a question rather than testing `darwin`, so both platforms are testable from the Mac
- On Windows the usage percentage is drawn into the tray icon itself and the full title goes in the tooltip — the Windows notification area has no text beside an icon, and the figure must stay visible without a click; the drawn icon is pure image-building code with no Electron import, so it is tested without a display
- On Windows the panel opens above the tray icon, clamped to the display's work area — the taskbar is usually at the bottom, and a panel placed as on macOS would open off-screen
- The Windows build is a Squirrel `Setup.exe` built on a `windows-latest` runner, unsigned — a per-user install needs no admin rights, and SmartScreen's "More info → Run anyway" is documented exactly as Gatekeeper's Open Anyway is
- The config file lives under `%APPDATA%\<app>` on Windows — `~/.config` is a Unix convention Windows users never look in

## Conventions

- Every network call carries an explicit timeout; there is no unbounded await
- The tray title stays under 12 characters so it does not crowd the menu bar
- Files kebab-case, exported types PascalCase
