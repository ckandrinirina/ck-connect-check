# Area — yas-sync

The YAS allowance sync: the anchor joining USSD absolutes to the router's counter, the stated plan cap, and when the app re-syncs by itself.

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
