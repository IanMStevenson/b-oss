# Notification service — design

The backend spec `AppSpec/02-notifications.md` refers to but defers. That document states the
**app-side** contract (what the app does); this one specifies the **service** the app talks to —
a separate deployable, not part of the Android app or `b-oss`.

**Status:** architecture, data-flow, and the app-facing UX it feeds are all decided — see
"Resolved UX" at the end for where each piece landed in `AppSpec/`.

**Revised 2026-08-03.** The polling design was rebuilt around a constraint discovered late: *every*
Blipfoto endpoint that returns notification or comment content also marks it read. The previous
two-phase design would have silently cleared the user's unread badges on both streams, every cycle,
everywhere. The service now polls counts only. This resolved the open comment-polling question (it
was mis-scoped as a comments-only problem) and removed hidden-member filtering from the service's
responsibilities entirely — see Polling design.

**Where this gets built:** the service lives in the **b-oss repo, as a peer package to the app**,
for development and version control. Publishing the Android app and deploying the service are both
**manual steps**, deliberately — no automated deploy on push, at least initially.

---

## Scope

The service holds a **read-only** Blipfoto token per registered account, polls for new activity
on the user's behalf, and delivers a push to the device. It never writes to Blipfoto. See
`AppSpec/02-notifications.md` for why (the two-token security boundary) and
`AppSpec/api-appendix/auth.md` for the sign-in modes that produce the token it's handed.

Designed for the current expected scale: **2–20 registered accounts.** Beyond roughly that, the
subrequest-budget and cron-cadence choices below should be revisited — they're sized for this
range deliberately, not as a permanent ceiling.

## Architecture

**Cloudflare Workers, Free plan, no Durable Objects or Queues.**

| Piece | Choice | Why |
|---|---|---|
| Compute | Workers (Free) | Cron Triggers + HTTP handlers for the registration API |
| State | D1 | KV's 1,000 writes/day free cap is too tight for per-tick state updates; D1's 100k writes/day and 5M reads/day comfortably cover this scale, still free |
| Fan-out | Plain cron loop over registrations table | At 2–20 users, a Durable Object per user or a Queue between "detect" and "send" is unneeded complexity — revisit if scale grows an order of magnitude |
| Push transport | FCM HTTP v1 (Android today) | Free, no meaningful rate limit at this scale; requires a service-account and OAuth2 JWT signed via the Worker's native Web Crypto API — no external SDK needed |

**Cost at this scale: $0/month.** Everything fits Workers Free + D1 Free + FCM.

Cloudflare Workers Free plan limits relevant to this design (checked 2026-08-02):
- Cron Triggers: 1-minute minimum granularity, 5 triggers/account.
- CPU time: 10ms/invocation, but time spent waiting on `fetch()` doesn't count — polling is
  almost entirely I/O wait, so this is not a binding constraint.
- Subrequests: 50 external subrequests/invocation. Not a binding constraint under the counts-only
  polling design below, which makes at most one subrequest per due registration per tick.
- D1: 5GB storage, 5M rows read/day, 100k rows written/day.

## Data model (D1)

One `registrations` table, one row per (account, device) pair:

| Column | Notes |
|---|---|
| `id` | registration id, returned to the app |
| `secret_hash` | hash of the opaque bearer secret the app presents on `PATCH`/`DELETE` |
| `blipfoto_user_id` | |
| `read_token` | the Blipfoto read-only token; AES-256-GCM encrypted at rest under a single Worker secret, random nonce per row — see Security, below |
| `device_token`, `platform` | FCM token today; `platform` carried from day one so APNs is additive later, not a redesign |
| `poll_interval_minutes` | per-registration, server-enforced floor of 5 |
| `last_polled_at` | drives which registrations are due on a given 1-minute tick |
| `last_seen_unread_totals` | cached `messages/totals/unread` result — the only activity signal the service has, see Polling design |
| `cached_push_prefs` | last-fetched `user/settings/notifications` push-group toggles |
| `prefs_fetched_at` | when `cached_push_prefs` was last refreshed |

## Polling design

**Counts only. The service never reads notification or comment content.**

This is forced by the API, not chosen. **Every endpoint that returns content mutates the user's
read state**, on both streams:

- `GET messages/notifications/recent` marks every unread row it returns as read, in the same
  request. There is no parameter to suppress it.
- `GET messages/comments/recent` is worse: as soon as any returned row is unread it clears **all**
  of that user's unread comment rows, not just the page fetched. There is no non-clearing variant,
  no per-item mark-read, and no suppression parameter.
- `GET entry` with comments included also clears comment-unread, conditionally on entry ownership.

Only `GET messages/totals/unread` is side-effect-free — a pure count query on both streams.

So a polling service that read content would silently zero the user's badges **every cycle**, in
this app, on blipfoto.com, and in any other client. That is not an acceptable side effect for a
third-party service to impose on the first-party product, so the service reads counts and nothing
else.

A cron tick fires every 1 minute (Cloudflare's minimum granularity). Each tick:

1. Selects registrations where `now - last_polled_at >= poll_interval_minutes` (default 5,
   user-configurable down to that floor — an "Advanced" control on `SCR-25`).
2. Calls `messages/totals/unread` once per due registration — **1 subrequest each, and the only
   Blipfoto call the activity poll makes.** Compares against `last_seen_unread_totals`.
3. Where either total has risen, dispatches a push carrying **which stream moved and by how much**,
   filtered by `cached_push_prefs`, and stores the new totals.

The two totals are independent: a comment increments only the comment total and never the
notification total, so they can be compared and reported separately without double-counting.

**This removes the subrequest pressure the previous two-phase design was built around.** At most
one subrequest per due registration per tick, against a 50-subrequest cap, so the self-healing
per-tick cap and the 15-registration batch limit are both unnecessary. At the 2–20 registration
scale this is designed for, a tick cannot come close to the cap.

### What the push can and cannot say

A count delta is all the service has, so the push says something like *"2 new comments"* or *"1 new
notification"* and routes to the corresponding inbox. It carries **no activity type, no target, and
no actor** — the app fetches the actual items itself when the user opens the inbox, which is the
only moment at which clearing the badge is correct behaviour.

Three consequences, all of them app-side and all recorded in `AppSpec/`:

- **Tapping a push opens an inbox** (`SCR-23` or `SCR-24`), not a specific entry or profile. See
  `FLW-16`.
- **The service performs no hidden-member filtering.** It has no actor to filter on, so the
  device-local hidden list stays device-local — no digests, no uploads, no consent step, and
  `rules.md`'s promise that hiding sends nothing anywhere remains intact.
- **A push about a hidden member's activity still arrives**, but names nobody, so no identity
  leaks. The inboxes filter locally on the content they fetch. `FLW-16` records this as an accepted
  limitation.

### The service must never mark anything read

Stated as a prohibition because the failure would be silent and the endpoints are inviting:

- **Never call `messages/notifications/recent` or `messages/comments/recent`.** Both clear on read.
- **Never call `PUT messages/notifications/unread`.** That is the app's call, and only the app's.
- **Never call `GET entry` with comments included** for a registered user.

Use **`messages/totals/unread`**, not the near-identical `messages/notifications/unread/Total`
resource — the latter returns the notification count under both keys and would make comment
activity undetectable.

## Preference freshness

The service does **not** get told preferences by the app at registration time, and does not
re-read `user/settings/notifications` on every activity poll (too many reads for no benefit —
preferences change rarely). Instead, two paths, matched to how they actually change:

- **App-made changes** (the common case — someone edits Notifications in `SCR-25` and expects it
  to take effect immediately): `FLW-17`, on a successful Notifications-section save, calls
  `POST /v1/registrations/:id/refresh-preferences` (see contract, below) — a dedicated ping, no
  body, distinct from `PATCH` (which changes *stored* fields; this says "go re-read Blipfoto
  now"). If the ping itself fails, no retry — it degrades to the hourly path, never worse than not
  having pinged at all.
- **Everywhere-else changes** (blipfoto.com, rare): a separate hourly cron, `0 * * * *`, refetches
  `cached_push_prefs` for every registration — ~20 extra Blipfoto reads/hour at this scale,
  negligible. Worst-case staleness for a web-made change: **up to 59 minutes**, accepted.

This is a separate cron trigger from the 1-minute activity poll (well within the 5-trigger account
limit) so it doesn't compete with the activity poll above.

## Registration contract

App-to-service API. Auth on `PATCH`/`DELETE`/`refresh-preferences` is `Bearer <secret>`, the
opaque secret returned at registration — separate from the Blipfoto read token, which the app must
never use to authenticate to the service itself.

**`POST` is authenticated with a shared registration secret**, shipped in the app build and held as
a Worker secret. This is deliberately weak protection — anything shipped in a client binary can be
extracted — but it is meaningfully better than an open creation endpoint, which would let anyone
burn the free-tier D1 write budget. It bounds casual abuse, not a determined attacker; the real
protection remains that a registration is useless without a valid Blipfoto read token. Rotating it
means shipping an app update, so treat it as a coarse gate rather than a credential.

```
POST   /v1/registrations
  auth:  Bearer <shared registration secret>   (build-time constant, not per-user)
  body: { blipfotoUserId, readToken, deviceToken, platform: "android" | "ios" }
  → { registrationId, registrationSecret }
  Called by FLW-20 whenever a sign-in enables notifications.
  The per-registration secret returned here authenticates every later call for that registration.

PATCH  /v1/registrations/:id
  auth:  Bearer registrationSecret
  body: { readToken?, deviceToken?, pollIntervalMinutes? }
  → 204
  Called by:
    - FLW-22, re-authorizing the read token (toggling notifications while read-write always
      re-authorizes, per auth.md's token lifecycle table).
    - the app, whenever the OS issues a new FCM token — a new app responsibility, not previously
      specified anywhere; the app must call this on FCM token rotation or pushes silently stop.
    - SCR-25's Advanced polling-interval control (floor of 5 enforced here regardless of what the
      UI sends).

POST   /v1/registrations/:id/refresh-preferences
  auth:  Bearer registrationSecret
  → 204
  Called by FLW-17 after a successful Notifications-section save.

GET    /v1/registrations/:id
  auth:  Bearer registrationSecret
  → { status: "active" | "read-token-invalid", lastPolledAt }
  Read counterpart to the above, for CRUD symmetry. Not polled by the app in normal operation —
  the reauth-required push (below) is the primary signal — but used by the app's launch-time
  health check as a backstop for a missed push. See FLW-02.

DELETE /v1/registrations/:id
  auth:  Bearer registrationSecret
  → 204
  Called whenever the account's notifications go off, by any route: the user turning off the
  SCR-25/SCR-30 master switch, an account removal, or the app treating OS-permission-denied as an
  off decision (FLW-20, FLW-22) — deliberately the same call for all three, since the app treats
  them as the same event, not three different ones.
```

## System alert: reauth-required

When the activity poll (above) gets an auth failure from Blipfoto for a registration's read token,
the service:

1. Marks that registration's status `read-token-invalid` and **stops polling it** — no point
   retrying a dead token every cycle.
2. Sends **one** push, immediately, with a distinct payload shape from an ordinary activity push —
   `{ kind: "reauth-required" }`, no type/target/actor triple, since it isn't reporting Blipfoto
   activity. Not resent on subsequent cycles; the status flag makes it idempotent.

This works even though the token that just failed is the *polling* token — FCM delivery uses the
separate device token, unaffected by the Blipfoto token's validity. The app routes this push to
`SCR-30` and treats it as a forced-logout-style trigger for the read token specifically — see
`FLW-02`, `FLW-16`. Re-registering (a fresh `POST`) clears the invalid status and resumes polling.

## Security notes

- The read-only scope is the actual security boundary (see `AppSpec/02-notifications.md`) — a
  compromised service instance still can't write to Blipfoto. This design doesn't add a second
  boundary beyond that; `registrationSecret` protects the *service's* API, not Blipfoto.
- **`read_token` at-rest encryption in D1 — decided 2026-08-03.** AES-256-GCM under a single
  static Worker secret (`wrangler secret put`), random nonce per row stored alongside the
  ciphertext. Two alternatives were considered and rejected: deriving a per-row key (e.g. from
  `registration_id`) adds no real protection, since the derivation input sits in the same D1 row
  as the ciphertext — a D1 compromise yields both together either way, so the master secret alone
  still determines decryptability, identically to the plain single-key case. Envelope encryption
  (a KEK wrapping per-row DEKs) buys cheaper key rotation at scale, which doesn't matter at
  2–20 registrations — rotation here is a one-off script that decrypts all rows under the old
  secret and re-encrypts under the new one. This is also why the read-only scope matters: a
  compromised `read_token` still can't write to Blipfoto, so encryption-at-rest is defense in
  depth on top of that boundary, not the sole thing standing between an attacker and account
  takeover — proportionate to that, the single-secret scheme is enough.
- Deregistration (`DELETE`) must be a real removal of the row, not a soft-disable — an account
  that's removed or turns notifications off should leave no live read token sitting in the
  service's store.

## Resolved UX (2026-08-02)

Carried forward from `README.md` TODO B; all four resolved by reusing existing mechanisms rather
than adding new states — see each file for the detail:

- **Stale-token visibility** — the `reauth-required` system alert (above) plus the launch-time
  backstop; both feed `FLW-02`'s existing "background token" forced-logout branch, surfaced on
  `SCR-30` with a reason label distinguishing it from a whole-account failure (losing only the
  service's read token never narrows write access — see `rules.md`).
- **OS notification permission** — requested as part of enabling notifications (`FLW-20`); if
  refused, or found missing on a later launch check, the app treats it identically to the user
  turning the master switch off — full revoke, `DELETE` above, no separate "blocked" state
  remembered or distinguished from a deliberate off (`FLW-22`).
- **`SCR-25` push group** — an active master switch, available even for a read-only account;
  the push-toggle group only renders when it's on.
- **Polling interval** — user-facing, an "Advanced" control under Notifications in `SCR-25`,
  floor of 5 minutes enforced server-side (`PATCH`, above) regardless of what the UI sends.

**"Active hours" polling restriction** remains a noted-but-undesigned future possibility on top of
the polling-interval control — not in scope now.

## Cross-references

- `AppSpec/02-notifications.md` — app-side contract this service implements against.
- `AppSpec/api-appendix/auth.md` — token model and sign-in modes that produce the read token.
- `AppSpec/api-appendix/data-model.md` (Notification) — what a notification actually carries, and
  why a push can only report a count.
- `ImplementationSpec/app-architecture.md` §11 — the app-side push client this contract feeds.
- `AppSpec/flows/FLW-16`, `FLW-17`, `FLW-20`, `FLW-22`, `FLW-02` — app-side flows that call into
  this contract.
