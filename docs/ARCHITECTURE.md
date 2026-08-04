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

`npm run icon` draws through an offscreen Electron window, so it launches a GUI
process — a sandboxed shell blocks it and the run hangs silently. `npm test`
inherits that, because the icon test runs the real rasteriser.

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
| `/api/net/current-plmn`              | `FullName` (carrier — read `Yas` until 2026-08, reads `ORANGE MG` since)                 |
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

### LAN device API

Verified live against the B310s-22 on `21.333.01.00.00` (T-62), read-only. Every reply below
is committed under `test/fixtures/hilink/`, and `test/hilink/device-fixtures.test.ts` holds
this section to those captures — including the absences, which are findings in their own
right.

| Endpoint                             | Method | Auth  | What it actually answers                                                                                          |
| ------------------------------------ | ------ | ----- | ----------------------------------------------------------------------------------------------------------------- |
| `/api/wlan/host-list`                | GET    | login | one `<Host>` per Wi-Fi client — `ID`, `MacAddress`, `IpAddress`, `HostName`, `AssociatedTime`, `AssociatedSsid`   |
| `/api/lan/HostInfo`                  | GET    | —     | **not implemented**: `100002`, even on an authenticated session                                                   |
| `/api/wlan/multi-macfilter-settings` | GET    | login | `<Ssids>` → four `<Ssid>` blocks, each `Index`, `WifiMacFilterStatus`, `WifiMacFilterMac0..9`, `wifihostname0..9` |
| `/api/wlan/multi-macfilter-settings` | POST   | login | writes the whole filter back — not yet exercised; T-68 is the first write                                         |

**`host-list` is the only device source, and the app reads nothing else.** `/api/lan/HostInfo`
was expected to add wired clients and the connection medium; it does not exist on this
firmware, answering `100002` even when logged in, and so do `/api/lan/hostinfo` and
`/api/wlan/station-information`. `host-list` is the Wi-Fi association table alone: there are no
wired clients in it, there is no `Active` element, and there is **no band or frequency field**
— the 2.4 GHz / 5 GHz column the devices window was sketched around has no source and is not
built. `AssociatedSsid` is the nearest thing, and on this device all four SSIDs share one name.

Four things follow, each observed rather than assumed:

- **Reading the device list needs the stored password.** Both `host-list` and the filter `GET`
  answer `100003` on a plain `SesTokInfo` session and only yield after `/api/user/login`. This
  is the correction that matters most: devices cannot ride the unauthenticated poll the way
  `/api/monitoring/status` does, so the whole feature sits behind the credential, and "no
  password stored" is a first-class empty state the window has to render.
- **The filter is per-SSID and capped at ten, not 32.** The reply carries one block per SSID
  (`Index` 0–3) with exactly `WifiMacFilterMac0..9` slots each — ten entries per SSID. A full
  list is an ordinary state to report, not an error.
- **Blocking is a filter write, not a per-device call**, and the write must carry _all four_
  `<Ssid>` blocks. The router replaces what it is sent, so a write built from a stale read — or
  one that omits the other three SSIDs — silently unblocks everyone else. Every write reads the
  filter first.
- The write is a `POST`, so it inherits the entire authenticated path above: a login, a
  single-use rotating token, the `125003` refresh-and-retry-once rule, and the five-failure
  account lockout that forbids automatic retries.

One parsing trap, and it is the router's own: the MAC slots are `WifiMacFilterMacN` but the
name slots are `wifihostnameN`, lower-case. A write has to reproduce both spellings exactly.

At rest the filter is off — `WifiMacFilterStatus` is `0` on all four SSIDs — and that is the
shape a write has to start from.

## Orange portal

Verified live on 2026-08-04, from a machine behind the same router. The SIM moved to
Orange MG on that date; the device is unchanged, and every `/api/monitoring/` endpoint above
still answers exactly as documented. Only the source of the carrier's own figure has moved.

```
GET http://123.orange.mg/info-conso/   →  200, server-rendered HTML, ~38 KB
```

**No authentication of any kind.** The network identifies the subscriber — the reply carries
`X-Header: intercepting the request` and sets `PROFILE=wifiber`, and the page greets the
MSISDN without a login. There is no session, no token, no password and therefore no lockout
to protect against. It is a plain `GET` that can be polled on the same footing as the router.

The figure lives in the `Forfaits en cours de validité` section, one `.bundle-item` per
active forfait:

```html
<span class="item_title title">Wifiber Go+ SSE</span>
<span class="title-da-nature title">Internet</span>
<p>
  Vous avez consommé
  <span class="color-orange text-bolder text-nowrap">7.37Go</span> sur votre
  forfait
</p>
```

Three findings that shape the design, each the reverse of the YAS situation:

- The portal states **consumed**, not remaining, and states it directly. There is no
  remaining volume and no expiry date anywhere on the page for this forfait.
- A forfait's shape varies. `assets/js/full.infoconso.js` initialises a
  `.bundle-circlebar` from `data-bundle-type` (`credit` | `data` | `voice` | `sms`) and
  `data-bundle-pcvalue`, so a _capped_ bundle renders a percentage — Wifiber Go+ SSE renders
  none. The parser must read the forfaits it finds rather than assume one layout.
- The router's month counter and the portal's figure count different things: 51.1 Go since
  `2026-7-27` against the portal's 7.37 Go on the same day. The counter is therefore not an
  accumulator for this plan at all.

The portal is unreachable off the Orange network, which is a normal state rendered like a
missing router, never an error.

## Syncing the real allowance — YAS only

Everything in this section describes the **YAS** path and is unreachable on Orange, where the
portal already states consumption on every poll. It stays because the carrier is detected at
runtime, not chosen at build time.

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

The plan total behind the dial is the **plan cap the user typed in** — 150 Go, say — set
from a field in the panel and stored in `config.json`. Everything the user reads as a
share or a consumed volume is derived from the anchor against that cap:

```
usedNow    = planLimitBytes − remainingNow
percentNow = usedNow / planLimitBytes
```

The router's month counter therefore appears in exactly one place in the arithmetic — as
the `routerMonthBytes` delta inside `remainingNow`. Its absolute value is never a headline
figure, because it counts from whenever the device last cleared itself and knows nothing
about the carrier's billing period. Before the first successful sync there is no anchor and
so no dial: the panel asks for a sync rather than showing a percentage of an unrelated
number.

An earlier design calibrated the denominator automatically from the highest
`remainingBytes` ever anchored. It cannot work with a single anchor — the high-water mark
_is_ that anchor's remaining, so the dial reads 0% by construction after every first sync,
which is exactly what the panel showed on 2026-07-28. The cap is now stated, not inferred.

The app syncs by itself when there is no usable anchor — none stored, expired, or
invalidated by a counter reset — **and when the anchor it does hold has gone stale**, which
is any anchor older than `syncStaleAfterMinutes` (default 30). Staleness is evaluated when
the panel is opened and on a background timer, so an app nobody has looked at for hours
still re-anchors by itself. A failed automatic sync is reported in the panel and never
retried on a timer, for the same reason a failed login is never retried: the account locks
after five refusals — the stale clock only restarts on a **successful** sync, and a failed
one parks automatic syncing until the next explicit Sync press.

At most one dialogue is ever in flight, and a dialogue is never started while the router is
unreachable or while no password is stored. A 30-minute window means up to roughly forty
carrier dialogues a day on an app left running, each one a login and a real signalling
exchange; the single-attempt, park-on-failure rule is what keeps that from becoming a
lockout.

## Reading the consumption pace

Knowing that 40 Go of 150 are gone does not say whether that is calm or reckless — the
answer depends on how far into the plan's life it happened. But a useful part of that
answer needs nothing the app does not already hold, so the reading is built in **three
tiers** and each input adds detail rather than unlocking the feature:

**Tier 1 — the anchor alone.** A sync states a remaining volume and an expiry date, and
those two give the number that matters most day to day:

```
sustainablePerDay = remainingNow / daysUntilExpiry
```

"You can spend 2.4 Go a day between now and the 15th." No cap, no plan length, no typing.
This appears as soon as anything has ever been synced.

**Tier 2 — with `planLimitBytes`.** The cap turns the remainder into a consumed share,
`usedShare = usedNow / planLimitBytes`, which is the dial T-25 already draws.

**Tier 3 — with `planDays`.** Only the plan's length can say how far the calendar has
travelled, and only then can consumption be compared against it:

```
periodStart  = anchor.expiresAt − planDays
elapsedShare = (now − periodStart) / planDays
pace         = usedShare / elapsedShare
```

`pace` below 1 means less has been spent than the calendar has, which is the state a
weekend of no usage produces. The bands are `safe` at or under 1.00, `warning` strictly
between 1.00 and 1.20, and `over` at 1.20 and above. `affordedPerDay`
(`planLimitBytes / planDays`) accompanies the band as the flat budget, against which tier
1's `sustainablePerDay` reads as the recovery figure — it rises whenever nothing is used,
which is exactly the compensation the band encodes.

The same ratio is also stated the way the user thinks about it, as two daily volumes side
by side:

```
averagePerDay = usedNow / elapsedDays          // what has actually been spent per day
affordedPerDay = planLimitBytes / planDays     // what the plan affords per day
pace = averagePerDay / affordedPerDay          // identical to usedShare / elapsedShare
```

150 Go over 30 days affords 5 Go a day; an average of 6 Go is `over` and 3 Go is `safe`.
`averagePerDay` is a restatement, not a second calculation — it is derived from the same
cumulative figures, so it can never disagree with the band beside it.

### On Orange, the period is the calendar month

Wifiber runs from the first of the month to its last day, so on Orange the period is not
derived from a carrier expiry date and `planDays` is not typed — both come from the
calendar:

```
periodStart = first day of the current month
planDays    = days in the current month        // 28 · 29 · 30 · 31
elapsedDays = days elapsed since periodStart
usedNow     = the portal's consumed figure     // stated, not derived
remainingNow = planLimitBytes − usedNow
```

The tiers therefore collapse on Orange. The portal states consumption but never a cap, and
the calendar supplies the length for free, so **the cap is the only input that gates
anything**: with it, every reading including the meter is available; without it, the panel
can state the consumed volume and nothing else — no dial, no meter, no per-day figure,
because all three need a total. There is no Orange equivalent of tier 1, since tier 1's
inputs were a carrier-supplied remaining and expiry, and the portal supplies neither.

`planDays` being derived also means the setting disappears from the panel on Orange rather
than being asked for and ignored.

### Drawing the pace

The band is drawn, not narrated: a horizontal meter whose fill is `averagePerDay` against a
full width of `affordedPerDay`, tinted green in `safe`, orange in `warning` and red in
`over`, with a tick at the afforded figure so the overshoot is visible rather than implied.
The two volumes stay as short numerals beside it — the colour says which band, the meter
says by how much, and the numerals say the amounts. Colour is never the only carrier of the
verdict: the meter's fill past its tick states the same thing without relying on hue.

Below tier 3 there is no band and no meter, because there is no afforded figure to measure
against. Tier 1 keeps its single sustainable-per-day line.

Both sides of the ratio are **cumulative**, never per-day, so no daily usage is ever stored
and the "no history database" decision stands.

### Loading a new plan

A top-up needs no reset. Every sync builds a whole new anchor through `anchorFrom` — label,
remaining, expiry and both router counters — so nothing survives a sync that a reset button
could usefully clear. What a sync cannot refresh is the two typed values, and a cap left
over from the previous plan is a silent fault: `usedBytes` is `max(0, cap − remaining)`, so
a remainder above a stale cap clamps consumption to zero and the dial reads 0% forever.

So the new plan is _detected_ instead. A synced anchor belongs to a different plan when its
`planLabel` differs from the previous one, its `expiresAt` moves later, or its
`remainingBytes` exceeds the configured cap. Any of those marks the cap unconfirmed: the
panel keeps the tier 1 reading, drops the dial and the pace rather than drawing them from a
contradicted cap, and asks for the cap and length to be confirmed.

## Folder structure

```
src/
  hilink/       router client — session handshake, login, XML parsing, USSD dialogue
  orange/       Orange selfcare portal — fetch 123.orange.mg, parse forfaits from HTML
  domain/       quota math, allowance anchor, formatting — pure, no I/O, no Electron
  config/       read and write the plan limit, router address and allowance anchor
  main/         Electron main process — tray, poll loop, popover window, login item,
                keychain-backed router password
  renderer/     popover UI (HTML + CSS + TS), and the connected-devices window
test/           mirrors src/, one .test.ts per source file
assets/         icon sources — hand-written SVG, and the PNG/.icns rasterised from them
scripts/        build-time scripts that are not part of the app — icon rasterisation
docs/media/     screenshots referenced by README.md
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
- The plan's length in days is entered by the user next to the cap, not derived — the period start is `expiresAt − planDays`, and the carrier's USSD reply states the expiry but never the duration
- The pace is absent, not `safe`, until both a cap and a plan length are set — the same reason the dial is absent before the first sync
- **Supersedes the line above:** the pace reading is tiered, and a synced anchor alone already yields `remainingNow / daysUntilExpiry` — the app holds a remaining volume and an expiry date from its first sync, so gating the most useful daily figure behind two typed values withheld an answer it could already give
- Only the band and `affordedPerDay` still require a cap and a plan length — those two are genuinely un-derivable from the carrier's reply, whereas the sustainable daily figure is not
- Loading a new plan needs no reset control — every sync replaces the whole anchor through `anchorFrom`, so a reset button would clear nothing a sync does not already overwrite
- A synced anchor that contradicts the stored cap marks the cap unconfirmed instead of being reconciled — `usedBytes` is `max(0, cap − remaining)`, so a top-up above a stale cap silently clamps the dial to 0%, and a silently corrected number is the unreliability the anchor design exists to remove
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
- On Orange the plan period is the calendar month, derived, and only the cap is typed — Wifiber renews on the first, so a typed plan length would be a second source of truth for something the calendar already states exactly
- The router's month counter has no role at all on Orange — it read 51.1 Go against the portal's 7.37 Go on the same day, so the two count different traffic and joining them would produce a confident wrong number
- An unreachable portal is rendered like an unreachable router, as a state and not an error — the portal only answers on the Orange network, so a laptop on any other Wi-Fi is an ordinary condition
- The connected devices live in their own window, not in the popover — a device list is a table that grows with the household, and the panel is 320×520 with 497 px already spent and no room to scroll
- The device list is the one place text beats a drawing, despite the graphical-default rule — names, IP addresses and MAC addresses are identifiers with no magnitude, and the rule reserves text for exactly that
- Devices are read on the ordinary poll, not on a timer of their own — `host-list` is an unauthenticated `GET` alongside the monitoring endpoints, so a second schedule would be a second thing to keep in step for no saving
- Blocking is the router's WLAN MAC filter, not a per-device API — the device holds one list and the write replaces it whole, so every block reads the current filter first and never composes a write from a remembered one
- A block or unblock is only ever an explicit press and is never retried automatically — the write is an authenticated `POST`, and the same five-failure lockout that forbids a USSD retry loop forbids this one
- The machine running the app can never be blocked from its own device list — cutting the app off from the router it is talking to is unrecoverable from inside the app, and no confirmation dialog makes that a reasonable thing to allow
- A full MAC filter is a stated condition, not an error — the firmware caps the list, and a household reaching that cap has done nothing wrong
- **Corrects the poll line above (T-62):** devices are read only when a password is stored, because `host-list` answers `100003` on an unauthenticated session — it is not on the same footing as `/api/monitoring/status`, so the list rides the poll only once logged in, and "no password stored" is an empty state the window renders rather than an error
- **Corrects the cap in the line above (T-62):** the filter holds ten entries per SSID, not 32, and the reply is four `<Ssid>` blocks rather than one list — a write carries all four or it silently clears the ones it omits
- The devices window drops the 2.4/5 GHz column it was sketched with (T-62) — `host-list` carries no band, frequency or medium field, `/api/lan/HostInfo` does not exist on this firmware, and a column with no source is not worth inventing one for
- **Narrows the "devices ride the poll" line above (T-66):** the host list is read only while the devices window is open — it is an authenticated request the menu bar never needs, so a window nobody has open must not cost one every 30 seconds
- The device list is fetched inside the poll's own tick rather than beside it — a request started next to the poll could stack on the router, which is the one thing the settle-then-schedule cadence exists to prevent
- A login taken out for the device list is attempted once and, if refused, stands the list down for the rest of the run — the list is read on every poll while the window is open, and a retry on that cadence would reach the five-failure lockout in minutes
- An empty device list and an unreachable router are different states in the window, not one blank table — only the router can say that nothing is connected, and a router that did not answer has said nothing at all
- The devices window drops the active dot too (T-66) — `host-list` carries no `Active` element and reports only the hosts currently associated, so the dot would be lit on every row it ever drew
- Device rows are keyed by MAC in the renderer and updated in place — the list refreshes on the poll, and rebuilding the table would replace the row under a user reading it

## Conventions

- XML never escapes `src/hilink/` — responses are parsed into typed objects at that boundary
- Every numeric field from the router arrives as a string; parse it at the boundary, never downstream
- Every network call carries an explicit timeout; there is no unbounded await
- The tray title stays under 12 characters so it does not crowd the menu bar
- Files kebab-case, exported types PascalCase
