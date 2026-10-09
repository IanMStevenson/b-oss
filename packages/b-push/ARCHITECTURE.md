# b-push — architecture

b-push is b-mobile's notification service. It holds a read-only Blipfoto token per registered
account and device, polls Blipfoto's unread **counts** on the user's behalf, and sends an FCM push
when a count rises. It never writes to Blipfoto. Deploying, secrets, logs and free-tier limits are
in the runbook, [README.md](README.md); schema changes are in
[migrations/README.md](migrations/README.md).

It lives in b-oss as a peer package to b-mobile and depends only on `@b-oss/b-api` (no Node-only
APIs; it runs on Workers). Deploys are manual. Sized for 2–20 registrations, with room to grow: the
per-run request budget (below) decides how many are polled, and the poll log reports when it runs
out (see the runbook's free-tier table).

## Architecture

**Cloudflare Workers (Free plan) + D1, no Durable Objects or Queues.**

| Piece          | Choice                                    | Why                                                                                                            |
| -------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Compute        | One Worker (`src/index.ts`)               | A hand-rolled router for the four registration routes, plus `scheduled()` for the cron trigger                 |
| State          | D1                                        | Each poll writes a row; KV's free write cap is too tight, D1's is ample at this scale                          |
| Fan-out        | Plain loop over due rows in one cron tick | A Durable Object per user or a Queue is unneeded at 2–20 registrations                                         |
| Push transport | FCM HTTP v1 (`src/fcm.ts`)                | Service-account JWT signed with the Worker's Web Crypto API, no SDK. `platform` is stored so APNs can be added |
| Blipfoto calls | `@b-oss/b-api`'s `BlipfotoClient`         | Same envelope parsing and error codes as the app, rather than a second client                                  |

There is one cron trigger, `*/1 * * * *` (`wrangler.toml`): the activity poll. One failing
registration is logged and counted, and never aborts the rest of the tick.

## Data model (D1)

One `registrations` table, one row per (account, device). `src/schema.sql` is the current full
schema; `src/types.ts` (`RegistrationRow`) mirrors it.

| Column                                                      | Notes                                                                                                           |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `id`                                                        | Registration id (random UUID), returned to the app                                                              |
| `secret_hash`                                               | SHA-256 (hex) of the per-registration bearer secret. The secret itself is never stored                          |
| `blipfoto_user_id`                                          | The account's **username**: b-api exposes no numeric user id                                                    |
| `read_token_ciphertext`, `read_token_nonce`                 | The Blipfoto read token, AES-256-GCM, random 96-bit nonce per row (see Security notes)                          |
| `device_token`, `platform`                                  | FCM token; `platform` is `android` or `ios`                                                                     |
| `poll_interval_minutes`                                     | Default 5; floor of 5 enforced on `PATCH`                                                                       |
| `last_polled_at`                                            | Epoch ms. Set to now at registration                                                                            |
| `last_seen_comments_total`, `last_seen_notifications_total` | Last unread totals seen. Seeded from a live call at registration, so existing unread items don't trigger a push |
| `push_comments`, `push_notifications`                       | The app's per-stream push choices, 0/1, default 1 (see Push choices)                                            |
| `status`                                                    | `active` or `read-token-invalid`                                                                                |
| `created_at`                                                | Epoch ms                                                                                                        |

Index `idx_registrations_poll (status, last_polled_at)` serves the due-registrations query.

## Polling design

**Counts only. The service never reads notification or comment content.**

This is forced by observed API behaviour, not chosen: every Blipfoto endpoint observed to return
notification or comment content also marks it read. `messages/notifications/recent` marks the
unread rows it returns as read; `messages/comments/recent` was observed to clear all of the user's
unread comments once any returned row is unread; `GET entry` with comments included also clears
comment-unread. Only `messages/totals/unread` has been observed to be side-effect-free. A service
that read content would zero the user's badges every cycle, in b-mobile, on blipfoto.com and in
any other client.

Each 1-minute tick (`src/poll.ts`):

1. Selects `active` rows where `last_polled_at` is null or `now - last_polled_at >=
poll_interval_minutes` (`listDueRegistrations`, `src/db.ts`).
2. Decrypts each row's read token and calls `messages/totals/unread` once, with both streams
   requested. This is the only Blipfoto call the poll makes.
3. Stores the new totals and `last_polled_at` regardless of the toggles, so a stream switched back
   on later doesn't fire a catch-up push.
4. For each stream whose total rose and whose toggle is on, sends one push with the delta.

The two totals are independent (a comment raises only the comment total), so they are compared and
pushed separately. With both toggles off a row still polls; the app deletes the registration when
the last toggle goes off, so that state is transient.

If FCM answers `404 UNREGISTERED` for a device token (app uninstalled, data cleared, new phone),
the row is deleted: the app has lost the secret it would need to delete it itself. Only
`UNREGISTERED` counts; a `400 INVALID_ARGUMENT` could be a malformed payload of ours.

### Request budget

The Workers Free plan allows 50 subrequests per invocation. The docs don't say clearly whether D1
queries share that pool with outbound `fetch`, so `src/budget.ts` counts both together. A run
spends one on the due-rows query, one per poll, one per push, one per FCM token exchange (the
token is cached for 50 minutes, so most runs make none) and one per D1 write. It starts another
registration only while a worst-case one (5 requests) plus the final write still fits.

State is written in two tiers (`src/poll.ts`):

- A registration that **pushed** (or tried to) is written immediately. If a later failure ended
  the run before a batched write, the next tick would send that push again, every minute for as
  long as the run kept dying.
- **Quiet** polls are queued and written with one D1 batch per `MARK_POLLED_CHUNK` rows and once
  at the end. A lost batch only means those rows are polled again.

Rows are taken oldest-first, so over capacity every registration's interval stretches about
equally and none is starved. The leftover count is `deferred` in the poll log line, with
`maxWaitMin` for the longest-waiting one.

### What the push can and cannot say

A count delta is all the service has. There are two payload shapes (`FcmPayload`, `src/fcm.ts`):

- `activity`: `stream` (`comments` | `notifications`), `accountId`, and a count, displayed as
  "b-mobile / 2 new comments".
- `reauth-required`: `accountId` only (see below).

Both are sent as ordinary FCM **notification** messages (never data-only, which Android defers in
Doze and drops for a force-stopped app), with `kind`, `stream` and `accountId` duplicated into
`data` for the app (`b-mobile/src/platform/push.ts`); the count is in the display text only.
Channel: `system_alerts` for reauth, `activity` otherwise. No activity type, target or actor is
ever carried, so a tap opens the account's comments or notifications inbox
(`routeForPushTap`, `b-mobile/src/flows/pushFlow.ts`), where the app fetches the items itself.
The service does no hidden-member filtering: it has no actor to filter on, so a push about a
hidden member still arrives but names nobody.

### The service must never mark anything read

A prohibition, because the failure would be silent and the endpoints are inviting
(`src/blipfoto.ts` is the only Blipfoto access):

- Never call `messages/notifications/recent` or `messages/comments/recent`.
- Never call `PUT messages/notifications/unread` (the app's call only).
- Never call `GET entry` with comments included.
- Never read or write `user/settings/notifications`.

The only other Blipfoto call is `GET user/profile` (no username, no extras), at registration and on
a `PATCH` that replaces the read token, to check whom the token belongs to (b-oss#240).

Use `messages/totals/unread`, not `messages/notifications/unread/Total`: the latter returns the
notification count under both keys, hiding comment activity.

## Push choices

Each registration holds two flags of its own, `pushComments` and `pushNotifications`, default on,
sent at registration and changed by `PATCH` (b-oss#244). They are per account per device and per
stream, not per event type. There is no master switch on the service.

The service never consults Blipfoto's own push settings: its `push_*` settings and
`push.configured` belong to Blipfoto's own app push service, whose device registration is not
available to our app type, so they say nothing about b-push. (An earlier design
cached `push.configured` and suppressed pushes when it was 0; that silenced anyone who had never
used Blipfoto's app with push, and was removed.)

## Registration contract

`src/routes/registrations.ts`; client `b-mobile/src/data/pushService.ts`. Errors are JSON
`{ error }`.

**Auth.** `POST` takes `Bearer <REGISTRATION_SECRET>`, a shared constant built into the app
(`VITE_NOTIFY_REGISTRATION_SECRET`). Every other call takes `Bearer <registrationSecret>`, the
per-registration secret returned once by `POST` (32 random bytes, base64url), stored on the device
in secure storage. The Blipfoto read token is never used to authenticate to the service. A missing
or malformed header is 401; an unknown id and a wrong secret both give the same 404, so a caller
learns nothing about which ids exist.

```
POST   /v1/registrations                       auth: shared registration secret
  body: { blipfotoUserId, readToken, deviceToken, platform: "android" | "ios",
          pushComments?: boolean, pushNotifications?: boolean }    (flags default true)
  → 201 { registrationId, registrationSecret }
  → 400 missing field, bad platform, non-boolean flag, or Blipfoto rejects readToken (50/51/52)
  → 401 wrong registration secret
  → 403 readToken belongs to a different account than blipfotoUserId (case-insensitive)
  Nothing is stored on any error.

PATCH  /v1/registrations/:id                   auth: registrationSecret
  body: { readToken?, deviceToken?, pollIntervalMinutes?, pushComments?, pushNotifications? }
  → 204
  → 400 non-boolean flag, or Blipfoto rejects readToken;  403 readToken for a different account
  A new readToken is owner-checked before anything is written, and resets status to active.
  pollIntervalMinutes is rounded and floored at 5, whatever the client sends.
  Omitted fields are unchanged.

GET    /v1/registrations/:id                   auth: registrationSecret
  → 200 { status: "active" | "read-token-invalid", lastPolledAt, pushComments, pushNotifications }

DELETE /v1/registrations/:id                   auth: registrationSecret
  → 204   A real row deletion, not a soft-disable.
```

How the app uses it (`b-mobile/src/flows/pushFlow.ts`): `POST` when notifications are turned on
for an account, including "Sign in again" recovery, after which the old registration is deleted
best-effort; `PATCH` for the per-stream toggles, the polling interval, and the new device token on
FCM token rotation (for every registered account); `GET` as a launch/resume backstop for a missed
reauth push; `DELETE` when the last stream is turned off, the account is removed, or OS
notification permission is found refused.

## System alert: reauth-required

When the poll cannot use a row's read token, it marks the row `read-token-invalid` (which removes
it from polling) and sends **one** `reauth-required` push. It is not resent: the status flag makes
it idempotent, and a failed send is only logged. The push still reaches the device because FCM
delivery uses the device token, not the Blipfoto token. If FCM reports that device as
unregistered, the row is deleted instead.

Triggers (`src/poll.ts`, `src/blipfoto.ts`):

- Blipfoto rejects the token with code 50 or 51 (b-api's `isTokenInvalid`; 51 is what a revoked or
  deleted user token returns).
- The stored token cannot be decrypted under the current `READ_TOKEN_ENCRYPTION_KEY` (rotated or
  lost key, b-oss#252).

Code 52 ("the client is invalid") on a stored token is **not** a trigger: on a previously accepted
token it would point to something wider (such as the app's client being rejected) that would hit
every row at once, so it is logged as an ordinary error and the row stays active (b-oss#238). At
registration, 52 means junk input and gives 400.

A row leaves `read-token-invalid` through a `PATCH` with a new read token. The app instead
registers afresh and deletes the old row.

## Security notes

- **The read-only scope is the real boundary.** A compromised service still cannot write to
  Blipfoto. The registration secret protects the service's own API, not Blipfoto.
- **`read_token` at rest:** AES-256-GCM under one static Worker secret,
  `READ_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64), with a random nonce per row stored beside
  the ciphertext. A per-row derived key was rejected (its input sits in the same D1 row, so it adds
  nothing), as was envelope encryption (cheaper rotation, irrelevant at this scale). Encryption at
  rest is defence in depth on top of the read-only scope.
- **The shared registration secret is a coarse gate, not a credential.** It ships in the APK and
  can be extracted. It stops casual abuse of an open creation endpoint (burning the free D1 write
  budget); the real protection is that a registration is useless without a valid read token that
  the owner check ties to the claimed account. Rotating it needs a new app build.
- **Per-registration secrets** are stored only as SHA-256 hashes and compared in constant time.
- **Deregistration deletes the row**, so no live read token is left behind when an account is
  removed or turns notifications off.
- **Logs** never include a token or a request body (`src/log.ts`).
