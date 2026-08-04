![ck-connect-check](docs/media/icon.png)

# ck-connect-check

A macOS menu bar app that shows how much of your mobile data plan is left, read
straight from a Huawei HiLink router and from whatever your carrier publishes —
a USSD menu on one network, a self-care page on another.

## What it does

It sits in the menu bar as a signal glyph and a number — how much of the plan is
gone, and what share of it that is. Clicking opens a panel with a dial for the
period, a coloured meter saying whether that share is being spent faster than the
period is passing, the carrier's own figure, and live download and upload
sparklines.

The panel is one screenful and never scrolls, so the figures it has to be told
live behind the ⚙ toggle in its header rather than taking a third of it. The
toggle swaps between the figures and the settings; you see one or the other,
never both.

The figure it shows is the real one. A router of this kind counts bytes
faithfully but has no idea what your plan is — it reports its data limit as
`0MB` — so the app asks the carrier instead, by whichever route that carrier
answers on. **Which route is taken is decided by the router, not by you**: the
panel and the menu bar rearrange themselves around the SIM that is in the
device, and the controls a network has nothing behind are not drawn at all. See
[Where the allowance comes from](#where-the-allowance-comes-from).

Everything is local. There is no account, no server, no telemetry and no
database — one JSON settings file and the macOS Keychain.

## What it was tested against

Honestly: one router, one Mac, two carriers — the SIM moved from one network to
the other during development, which is why both paths exist and why neither is
presented as the normal one.

- **Router:** Huawei **B310s-22**, software version **21.333.01.00.00**, at the
  stock address `192.168.8.1`
- **Carriers:** Yas Madagascar, over its `#359#` USSD menu, and Orange
  Madagascar, over `http://123.orange.mg/info-conso/`. Neither is a standard —
  both were captured live from this line, and another carrier will answer
  something else entirely
- **macOS:** built and run on Apple silicon, macOS 15

Other HiLink routers speak the same `/api/` endpoints and will very likely show
usage, signal and throughput. The carrier's own figure is the part most likely
to need changing for you — see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
for the captured dialogue and the captured page the two paths are built on.

## Install and build

Node 22 or newer, on macOS.

```sh
git clone https://github.com/ckandrinirina/ck-connect-check.git
cd ck-connect-check
npm install
npm start
```

`npm start` builds and launches the app. It has no Dock icon and no window — it
lives entirely in the menu bar, so look up there rather than in the app switcher.

To build a real `.app` bundle:

```sh
npm run package
```

The result lands under `out/`. Drag it to Applications and it behaves like any
other menu bar utility.

The other scripts, for working on it:

| Command         | What it does                                               |
| --------------- | ---------------------------------------------------------- |
| `npm test`      | The whole suite                                            |
| `npm run build` | Type-checks and compiles into `dist/`                      |
| `npm run lint`  | ESLint over everything                                     |
| `npm run icon`  | Redraws the app icon and the menu bar glyphs from the SVGs |

`npm run icon` opens an offscreen Electron window to rasterise, so it needs a
real graphical session — it will hang in a sandboxed or headless shell, and so
will `npm test`, which runs it.

## Where the allowance comes from

**The carrier is detected, never configured.** Every poll reads
`/api/net/current-plmn` off the router and matches the network name it comes
back with:

- `ORANGE MG` → the Orange path below
- `Yas` → the YAS path below
- any other network → neither. The panel names the network the router reported
  and says no allowance source is known for it, rather than guessing at one:
  quoting a stranger's figure would be worse than saying nothing.

There is no carrier setting in the config file and no menu to choose from. Swap
the SIM and the next poll rearranges the panel around it.

What the two paths share is everything the router itself knows — the byte
counter, the signal, the radio, the connected devices, the live throughput — plus
the plan size, which no carrier states and which you therefore type in either
way. Everything below applies only to the network it names.

### On Orange — the info-conso portal

![The panel on an Orange SIM: the dial, the pace meter, the named forfait and no
Sync row](docs/media/panel-orange.png)

The exact figure comes from Orange's own self-care page:

```
GET http://123.orange.mg/info-conso/
```

**No login, no password and no dialogue.** The Orange network recognises the
subscriber, so the page answers a plain unauthenticated `GET` — nothing to sign
in to, nothing to store, nothing to press. It is read on the ordinary slow poll
like any other endpoint. Off the Orange network the page does not answer at all,
which the panel reports as a state rather than an error, the same way it treats
an unreachable router.

The page states what has been **consumed**, not what is left, and names the plan
it is counting — `Wifiber Go+ SSE` on the line this was built against. The panel
shows that name, so the plan the dial is measuring is visible rather than
assumed. Where several data forfaits are live at once — a base plan plus a
top-up is the obvious case — the app measures one and offers you the others; the
one you choose is remembered in `orangeForfaitLabel`, so the dial tracks the same
plan on every poll instead of following whichever the page happens to list first.

Two things the portal never states, and how each is answered:

- **The plan size.** Nothing on the page says how much you bought, so the cap is
  typed in — the _Plan_ field in the settings view, behind the ⚙ toggle in the
  header. Enter it in Go (`150` means 150 Go) and it is remembered. Until it is
  set there is a consumed volume and nothing else: no dial, no meter and no share
  in the menu bar, because all three need a total to measure against.
- **The period.** A Wifiber plan runs the **calendar month**, first day to last,
  so no plan length is typed on Orange and the field is not on the panel at all.
  The length comes from the calendar — 28, 29, 30 or 31 days — and the day being
  lived counts as a day elapsed, so the first of the month is one day in rather
  than none.

The menu bar carries the same figure the panel does. With a cap it reads
`7.4Go · 37%`; with none it reads `7.4Go` and stops there rather than inventing
the other half. There is deliberately no fallback to the router's own month
counter, which counts different traffic entirely — 51.1 Go against the portal's
7.37 Go on the same day.

The panel drops what Orange has nothing behind: no Sync button and no sync status
line, since a plain `GET` needs neither, and no plan-length field, since the
calendar has already answered it. A control you can reach but not use is worse
than the space it costs.

### On YAS — the USSD sync

Yas publishes nothing on the web, so the exact figure comes out of one carrier's
own menu: the app signs in to the router, dials `#359#`, walks the menu, and
reads a line like `il vous reste 145835.9 Mo`. That wording and its `1 / 1 / 1`
navigation are Yas's own and are not a standard.

A dialogue takes tens of seconds and holds carrier-side state, so it is never run
on the poll. Press **Sync** in the panel to re-ask the carrier. The reading that
comes back is pinned to the router's byte counter at the moment it arrives — an
_anchor_ — and from then on the app subtracts the counter's movement from it. So
the panel stays right between syncs without dialling at all, including across
quits, because the router keeps counting while the app is closed.

Signing in to the router is what makes that possible, so on YAS the first run
asks for the router's admin password — the one for the router's own web
interface, not your Wi-Fi password. It never reaches `config.json`; see
[The config file](#the-config-file).

Two figures are still typed in here, because the carrier states neither.

**Your plan size** is the same _Plan_ field the Orange path uses, on the same
terms: in Go, behind the ⚙ toggle, and until it is set there is a usage figure
but no percentage.

**How long your plan runs** — its plan length — is typed in beside it, in whole
days (`30`). This is the field Orange does not have. The carrier states an expiry
_date_ and never a duration, so on YAS this is the only thing that can say how
far through the period today is. It is optional: without one the dial and the
allowance work exactly as before and only the pace meter stops short. A fraction
of a day is refused rather than rounded, because a rounded period would silently
disagree with the expiry date the pace is measured back from.

## The pace meter

The dial says how much is gone. The bar under it answers the other question:
whether it is going faster than the period is passing.

On YAS it grows with what the app has been told, in three tiers:

| Tier | What it needs        | What it says                              |
| ---- | -------------------- | ----------------------------------------- |
| 1    | a sync               | what the remainder still affords each day |
| 2    | plus the plan size   | the share consumed — the dial             |
| 3    | plus the plan length | the coloured meter                        |

Only tier 3 draws the meter, because only a plan length can say how much of the
period has gone. On Orange there is no such ladder: the portal states consumption
on every read and the calendar states the period, so the plan size is the single
gate — with it the dial, the band and the meter all arrive at once, and without
it none of them can.

The meter's tick sits at the daily budget the plan affords, and the fill is what
has actually been spent per day, so an overshoot reads as fill past the mark
rather than as a bar that is merely long. The fill is pinned at twice the budget
— a runaway month would otherwise leave the panel — while the numerals beside it
stay exact.

Colour is the fast answer, never the only one:

| Band    | Ratio                  | Colour |
| ------- | ---------------------- | ------ |
| safe    | up to 1.00             | green  |
| warning | above 1.00, below 1.20 | orange |
| over    | 1.20 and above         | red    |

The ratio is what you have spent per day divided by what the plan affords per
day, and it is the same ratio on both carriers — only the period behind it
differs. Worked through: a **150 Go** plan running **30 days** affords 5 Go a
day. Spend 5 Go a day and the ratio is 1.00 — green, exactly keeping step with
the calendar. Spend 6 Go a day and the ratio is 1.20 and above, so it bands as
`over`, the meter turns red, and the fill sits a fifth past the tick. That
boundary is inclusive: 6 against 5 is the case worth calling extreme, so it is
`over` rather than a warning.

Both sides of the ratio are cumulative rather than daily, so a weekend of no
usage pulls the pace back on its own and no history of your days is ever kept.

## When it syncs by itself — YAS only

Everything in this section is the YAS path. Orange has no sync at all: the portal
is read on the ordinary poll, so there is nothing to schedule and nothing to go
stale.

A carrier figure does drift while it is carried forward — another device on the
Wi-Fi, an adjustment at the carrier's end — so a reading older than **30 minutes**
counts as stale and the app re-anchors it without being asked. Half an hour is
the default; `syncStaleAfterMinutes` in the config file changes it.

That check runs at two moments and no others: when you open the panel, and on a
background timer for an app nobody has opened all afternoon. Never on a poll
tick — a poll comes round every couple of seconds and a carrier dialogue takes
tens of them.

Four guards keep the window off the router's lockout:

- one dialogue is ever in flight at a time;
- nothing starts with no password stored, with the router unreachable, or before
  the first successful reading;
- a **failed** sync is never retried on a timer. It parks automatic syncing until
  you press **Sync** yourself, because the router locks the admin account after
  **five** refused sign-ins and a retry loop would walk you straight into that;
- the staleness clock restarts only on a success.

A sync is also run when there is nothing trustworthy to show at all: no anchor
yet, one the carrier's expiry has overtaken, or one invalidated because the
router's month counter reset.

## After a top-up — YAS only

On Orange a top-up needs nothing: the portal states the new plan on the next
read, and the panel offers it as a forfait to measure if the old one is still
live beside it. Only the cap has to be retyped, and only if the size changed.

On YAS, loading a new plan takes two actions, and there is **no reset button** —
by design, because there is nothing left for one to clear.

1. **Press Sync.** A sync rebuilds the entire anchor — offer name, remaining
   volume, expiry and both router counters — so everything the carrier states is
   replaced already.
2. **Confirm the plan size.** It is the one value a sync cannot refresh, because
   you typed it. Same size as before? One press of **Confirm**. Different size?
   Retype it in the settings view, which confirms it too.

You will be asked rather than having to remember. The app spots a new plan from
any one of three signs: the carrier renamed the offer, the expiry moved later, or
the remaining volume came back **larger than the cap you typed** — and that last
one catches a top-up the carrier labelled identically.

Until it is confirmed, `planCapConfirmed` is false and the panel withholds
everything computed from the cap: no dial, no share in the menu bar, no coloured
meter. The tier 1 daily figure stays, because it is read from the carrier's own
remaining volume and needs no cap to be true.

This is not housekeeping. On YAS, consumption is worked out as `cap − remaining`,
so topping up from a 50 Go plan to a 150 Go one without retyping the cap would
clamp consumption to zero and leave the dial reading 0% indefinitely, with
nothing on screen suggesting why. Withholding the dial is the honest failure; a
confident wrong one is the dangerous one.

## The config file

Settings live in a single JSON file:

```
~/Library/Application Support/ck-connect-check/config.json
```

It is written by the app; you can edit it by hand while the app is not running.
There is no carrier key in it, and adding one would do nothing — the network is
read off the router on every poll.

| Key                         | Meaning                                                                                                                                                                                |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`                      | Router address, no scheme. Defaults to `192.168.8.1`                                                                                                                                   |
| `pollIntervalSeconds`       | Seconds between polls while the panel is closed. Default `30`, minimum `5`. On Orange this is also how often the portal page is read                                                   |
| `activePollIntervalSeconds` | Seconds between polls while the panel is open. Default `2`, minimum `1`                                                                                                                |
| `warnThresholdPercent`      | Share of the plan at which the menu bar starts warning. Default `90`                                                                                                                   |
| `planLimitBytes`            | Your plan size in bytes, or `null` when unset. Set it from the settings view. Needed on both carriers                                                                                  |
| `planDays`                  | How long your plan runs, in whole days, or `null` when unset. YAS only — on Orange the calendar month supplies it. An unusable value reads as unset rather than taking the config down |
| `planCapConfirmed`          | Whether `planLimitBytes` still describes the current plan. Cleared by a sync that finds a new one, set again by confirming the size on the panel. Default `true`                       |
| `syncStaleAfterMinutes`     | Minutes before the carrier figure counts as old and is re-anchored on its own. YAS only. Default `30`. An unusable value falls back to that default                                    |
| `routerUsername`            | Router admin username. Absent until a credential has been saved, which only the YAS sync ever needs                                                                                    |
| `routerPasswordBlob`        | The password **as encrypted by the Keychain**, base64-encoded — see below                                                                                                              |
| `orangeForfaitLabel`        | The Orange forfait you chose to measure, by name, when several data forfaits are live at once. Absent until you choose one                                                             |
| `allowanceAnchor`           | The last carrier reading and the router counter it was pinned to. Written by the YAS sync; Orange keeps no anchor                                                                      |

**Your router password is never in `config.json`.** It is encrypted by the macOS
Keychain through Electron's `safeStorage`, and only the ciphertext is stored in
`routerPasswordBlob` — unreadable by anything but this app, on this machine, as
this user. A bad or missing config file is never fatal: the app logs why and
runs on the defaults.

## Troubleshooting

### On any carrier

**The menu bar says `offline`.** The router is not answering at `host`. Check you
are on its Wi-Fi, and open `http://192.168.8.1` in a browser — if that fails too,
it is the router, not the app. An unreachable router is a normal state here, not
an error: the app keeps polling and recovers on its own.

**The panel says no allowance source is known for your network.** The router
reported a network name the app has no path for, and it names that network in the
line so it can be reported. The router's own figures — usage, signal, throughput
— keep working; only the carrier's exact figure is missing.

**The dial is missing.** On Orange: no plan size has been set, or the portal has
not answered yet. On YAS: one of three things — no successful sync has happened
yet, no plan size has been set, or a sync found a plan the stored size cannot
describe and is waiting for you to confirm it, which is
[After a top-up](#after-a-top-up--yas-only). The panel says which, and none of
them is an error: a percentage of a number the carrier never confirmed would be
worse than nothing.

### On Orange

**The panel says Orange's page answered an HTTP status.** The status is carried
up rather than hidden. The page only answers on the Orange network, so the usual
cause is being on some other connection — a laptop on café Wi-Fi is an ordinary
situation, not a fault.

**The panel says the page could not be read.** Something answered but it was not
your page. A captive-portal middlebox sits in front of this address and is
exactly the kind of thing that replies for it; the app says so rather than
reporting an expired plan it has no evidence of.

**The panel says no Internet plan was listed,** naming how many plans it did
find. Either the plan has expired, or the line is voice-only — the count is there
so the two can be told apart.

### On YAS

**The panel says the sign-in was refused.** The password is the router's admin
password, not your Wi-Fi password. Get it right on the second attempt rather than
the fifth: **the router locks the account after five consecutive refusals**, and
the app deliberately will not retry for you. If it does lock, sign in to the
router's web interface — or power-cycle it — to clear the lockout.

**Sync fails naming a number and an endpoint,** such as `125003 at
/api/ussd/send`. That is the router's own refusal code, carried up rather than
hidden. `125002` is an expired session and `125003` a spent token — both usually
clear on a second press. `100003` means the sign-in did not take. Anything else
is worth reporting, with the code and endpoint exactly as shown.

**The pace meter is missing but the dial is there.** No plan length has been set,
so the app has no period to measure the elapsed share against. Type one in the
settings view and the meter appears; until then the line above it still says what
the remainder affords each day.

**The carrier dialogue times out or reads oddly.** The `#359#` menu is one
carrier's own menu. If yours answers differently, the navigation in
`src/hilink/ussd.ts` is where it is encoded, and the captured dialogue in
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) shows the shape it expects.

## How it is built

TypeScript and Electron, tested with Vitest. The router client, the Orange portal
reader, the quota arithmetic, the Electron main process and the panel are
separate layers, and the arithmetic layer touches neither Electron nor the
network — which is why almost all of it is testable without a router present, and
why adding a second carrier changed one branch rather than the whole app.
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) documents the endpoints, the
portal page, the sync design, and every decision behind them with its reason.
