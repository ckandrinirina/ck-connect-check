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
| devices  | docs/areas/devices.md  | src/domain/devices.ts, test/domain/devices.test.ts, the Devices pane in src/renderer/              |

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
- A successful Set states that it was saved on the field's own status line, even when the value did not change (T-82) — a press that moves nothing on screen reads as a dead button, and the refusal already has that line, so a success gets it too
- Forfait alerts are decided by one pure function in `src/domain/alerts.ts` that takes the reading, the clock and what was already announced, and returns what to show and what to notify — the schedule (30 % remaining; 5, 4, 3, 2 days before the end; hourly on the last day, silent 22:00–07:00) is arithmetic on dates and volumes, and testing it must not need Electron or a router
- A low forfait fires one macOS notification and then stays as a panel banner and a tray-glyph mark until a recharge, never as a repeated pop-up — "always visible until recharge" is a state, and a notification re-sent on a timer is noise the user learns to dismiss unread
- A recharge clears the low-forfait state when the carrier's figure says so — on YAS the new-plan detection T-79 already performs, on Orange a new calendar month or a consumed figure that moves backwards — never a timer or a dismiss button, because only the carrier knows the forfait was topped up
- What has been announced is kept in `config.json` keyed by the period's end date, so a restart neither repeats a reminder nor loses one — the app is relaunched at login and the poll restarts from nothing
- A reminder missed while the Mac slept or during quiet hours is not replayed in bulk — only the newest due reminder fires, since five stale notices at 07:00 state nothing the latest one does not
- Settings are a third panel tab beside Usage and Devices, replacing the ⚙ header toggle — every setting has one discoverable home, and a tab costs the figures no height
- Launch at login is turned on once, on the first packaged launch, and a `launchAtLoginDefaulted` flag in `config.json` stops it from ever being re-applied — after that only the user’s switch changes it, and an unpackaged dev run never registers the bare Electron binary as a login item; **corrected (T-100):** on macOS the registration is the app's own `~/Library/LaunchAgents` plist, not `app.setLoginItemSettings` — Electron goes through SMAppService, which silently refuses an unsigned bundle, and this app ships unsigned, so the switch read back off and flipped back; Windows keeps Electron's registry entry
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
