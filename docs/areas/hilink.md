# Area — hilink

The router client: session handshake, login, XML parsing, USSD dialogue and the LAN device API of the Huawei B310s-22.

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
| `/api/wlan/multi-macfilter-settings` | POST   | login | writes the whole filter back — built by T-68, and **never yet sent to a real device**: see the mode warning below |

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
shape a write has to start from. `0` is therefore the only status this device has been
observed to send; `1` is read as a whitelist and `2` as a blacklist, which is the order the
router's own web UI offers (disabled, allow, deny) and the mapping `src/hilink/macfilter.ts`
converts at the boundary. A status outside those three is rejected rather than guessed at,
so a firmware that numbers them differently fails loudly instead of drawing the wrong
verdict on every row.

> **The `1`/`2` mapping is inferred and has never been observed (T-68).** The only captured
> reply is all zeros, so nothing in this repository proves which integer the firmware means by
> which mode; a live check was attempted and did not settle it. If `2` is in fact the
> whitelist, a write believing it is the blacklist would tell the router "allow only this one
> address" and cut off every other device — including the Mac running this app, over the very
> connection the undo would have to travel. Two things follow, and both are enforced in code:
> the mapping lives in exactly one table (`MODES` in `src/hilink/macfilter.ts`, which both
> `parseMacFilter` and `macFilterStatus` read, so one edit corrects the reader and the writer
> together), and **blacklist is the only mode the app ever writes** — a change to a filter
> already in whitelist mode is refused in `refuseDeviceBlock` before any request is made,
> rather than reasoned about against a mapping nobody has verified.

## Conventions

- XML never escapes `src/hilink/` — responses are parsed into typed objects at that boundary
- Every numeric field from the router arrives as a string; parse it at the boundary, never downstream
