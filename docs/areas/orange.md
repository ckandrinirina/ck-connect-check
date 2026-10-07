# Area — orange

The Orange MG selfcare portal: where the carrier's consumed figure comes from on Orange, and the findings that shape its parser.

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
