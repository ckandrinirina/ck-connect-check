# Area — pace

The consumption-pace reading: the three tiers, the period it is measured over, and how it is drawn in the panel.

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
`remainingBytes` exceeds the configured cap when the previous anchor's did not. Any of those
re-derives both values through `derivePlan` (T-79): the cap becomes the synced
`remainingBytes`, the length the whole days from `syncedAt` to `expiresAt` rounded up, each
recorded with source `carrier`, and the cap is confirmed on the spot — so the dial and the pace
show right after that sync with nothing to confirm. The first sync with no cap stored derives
the same way. A sync of the same plan leaves both values alone, whether derived or typed
(`user`), so a derived cap never shrinks to a later, smaller remaining.
