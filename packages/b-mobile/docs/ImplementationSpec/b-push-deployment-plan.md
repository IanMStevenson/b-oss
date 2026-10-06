# Deploying and verifying the notification service (b-push) — plan

Plan for [#148](https://github.com/IanMStevenson/b-oss/issues/148) (Phase 13). `packages/b-push`
is built and unit-tested against a local SQLite fake; **nothing has ever run against real
Cloudflare, real FCM, or the real Blipfoto totals endpoint.** This plan gets it live and proves
push delivery end to end, with the smallest set of manual steps. Design background:
[notification-service.md](notification-service.md).

Deploys stay **manual and deliberate** (no CI deploy, no agent ever holds the Cloudflare or Firebase
credentials). The split below keeps your part to a few short sessions.

## What is and isn't proven today

| Proven (local fakes / unit tests) | Never exercised for real |
| --- | --- |
| Registration API (POST/PATCH/GET/DELETE/refresh), auth, validation | Worker running on Cloudflare; D1 `--remote`; the two cron triggers |
| Counts-only poll logic and the "never mark anything read" rule | `messages/totals/unread` with a **read-only service token** from the second OAuth round |
| AES-GCM `read_token` encryption; FCM v1 payload + JWT signing code | FCM OAuth2 token exchange and a real delivery to a device |
| App side: permission flow, registration calls, token-rotation PATCH, reauth routing | Android receiving, channel routing, tap-through, Doze/killed-app delivery |

## Stage 0 — decisions to confirm (before you spend time)

1. **Which build gets push first?** The debug APK is enough: FCM needs only the package name
   (`io.github.ianmstevenson.bmobile`), not a signing fingerprint. Release signing can wait.
2. **Poll interval.** Default 5 min (floor 5). Each registration costs 1 Blipfoto request per poll,
   per read token — well inside a 15-minute rate-limit window. Keep the default for the trial.
3. **Whose accounts.** Suggest the trial uses `cyclops` (receiver) and `cyclopstest` (actor), the two
   accounts already on your phone.

## Stage 1 — Firebase (you, ~15 min, free Spark plan)

1. console.firebase.google.com → **Add project** (e.g. `b-mobile`), analytics off.
2. **Add Android app**, package name `io.github.ianmstevenson.bmobile` → download
   **`google-services.json`**.
3. Project settings → **Service accounts** → **Generate new private key** → a JSON file. This is the
   `FCM_SERVICE_ACCOUNT_JSON` secret. Make sure *Firebase Cloud Messaging API (V1)* is enabled
   (Project settings → Cloud Messaging).
4. Hand me nothing secret: put `google-services.json` at
   `packages/b-mobile/android/app/google-services.json` (already gitignored; the Gradle plugin applies
   only when it exists) and keep the service-account JSON for Stage 2.

## Stage 2 — Cloudflare (you, ~20 min, free plan; from `packages/b-push`)

```
npx wrangler login
npx wrangler d1 create b-push                      # paste the database_id into wrangler.toml (do NOT commit it)
npx wrangler d1 execute b-push --file=src/schema.sql --remote
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"   # -> READ_TOKEN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"      # -> REGISTRATION_SECRET
npx wrangler secret put READ_TOKEN_ENCRYPTION_KEY
npx wrangler secret put REGISTRATION_SECRET
npx wrangler secret put FCM_SERVICE_ACCOUNT_JSON   # paste the whole JSON as one line
npx wrangler deploy                                # prints https://b-push.<you>.workers.dev
```

Then put the URL and registration secret in the root `.env.local`:
`VITE_NOTIFY_SERVICE_URL=…` and `VITE_NOTIFY_REGISTRATION_SECRET=…` (same value as the Worker secret).
Back up the encryption key somewhere safe: losing it makes every stored read token unreadable (users
would simply re-register, but you'd want to know why).

**One question for you:** do you want `wrangler.toml` to keep the `REPLACE_WITH_REAL_D1_DATABASE_ID`
placeholder and use a local, uncommitted override, or commit the real id (it is an identifier, not a
secret)? I'd commit it — fewer foot-guns — but it's your call.

## Stage 3 — smoke-test the service with no app (me, ~10 min, once the URL exists)

Using only `curl` (no real tokens):
- `POST /v1/registrations` with a **wrong** bearer → expect 401 JSON (proves the Worker is up and the
  secret gate works; there is no health endpoint, and an unknown path returns 404 JSON).
- `POST` with the right secret but a junk read token → expect a clean validation/401, and **no row**
  left in D1 (`wrangler d1 execute … --remote "select count(*) from registrations"`).
- `npx wrangler tail` while a cron tick fires, to confirm both triggers run (1-minute and hourly) and
  an empty table is a quiet no-op.

## Stage 4 — wire the app and register (you + me, ~15 min)

1. I build a **debug APK with `google-services.json` present and the two env vars set** and install it.
2. On the phone: sign in `cyclops` (read-write) with **Get notifications on**. This runs the two OAuth
   rounds (second one read-only, the "service token"), asks for the Android notification permission,
   and calls `POST /v1/registrations`.
3. I verify from logcat (`[push]`/registration) and `wrangler d1 execute … "select id, status,
   last_polled_at from registrations"` (never selecting the token columns) that one active row exists.

## Stage 5 — prove delivery (you + me)

| Test | How | Pass when |
| --- | --- | --- |
| Basic push | From `cyclopstest`, comment on / star a `cyclops` entry | A push arrives within ≈ one poll interval, on the right Android channel |
| **Reads nothing** | Before/after: check the unread badges on blipfoto.com and in the app | Badges are **unchanged** by the service polling (the core design rule) |
| Tap-through | Tap the push | App opens to the right inbox |
| Background | Screen off / app swiped away / Doze (leave 15 min) | Still delivered (FCM high-priority notification message) |
| Preferences | Turn a push group off on blipfoto.com, trigger **Refresh** via Settings save | That group stops notifying (service uses cached prefs; hourly refresh as backstop) |
| Token rotation | Clear app data or `adb shell` reinstall, sign in again | One registration, `PATCH`ed or replaced — never two live rows pushing twice |
| Reauth | Revoke the app's access on blipfoto.com (or invalidate the read token) | One `reauth-required` push, row → `read-token-invalid`, polling stops; app routes to Accounts and recovers on re-authorise |
| Deregister | Turn notifications off / remove account | Row **deleted** (not flagged) and no further pushes |

## Stage 6 — hardening and handover (me)

- Fix whatever Stage 3–5 find (expect small things: first-ever FCM v1 JWT exchange, payload shape,
  channel ids). Each fix is its own PR with a regression test where the fake could have caught it.
- Add `packages/b-push/README.md` / a runbook: deploy, rotate secrets (re-encrypt script), read logs
  with `wrangler tail`, roll back (`wrangler rollback`), and what the free-tier limits are.
- Update `RESUME.md`/`AGENT_LOG.md`, close #148, and record in `AppLimitations.md` anything the
  service can't do (it reports *counts*, so a push says "3 new comments", not who/what).

## Risks to watch

- **Counts only means generic pushes** — by design (reading content would zero the user's unread
  badges). Expect "New comments" style text, not previews.
- **Rate limits** are per access token, 15-minute windows. 1 request/5 min/user is far below any
  plausible cap; if registrations grow ~50×, revisit.
- **Free-tier ceilings**: Workers cron is 1-minute granularity, D1 100k writes/day — fine at 2–20
  registrations.
- **Delivery can be delayed by OEM battery managers** (Samsung's "sleeping apps"); if the app is
  being optimised away, pushes still arrive via FCM but may be batched. Check this on the phone
  before blaming the service.
- **Secrets**: the registration secret ships inside the APK, so it's a coarse gate, not a credential
  (as designed). The real protection is that a registration is useless without a valid read token.

## Who does what

| You | Me |
| --- | --- |
| Firebase project + two downloads (Stage 1) | Everything in Stage 3 and 6; build/install; all verification and logs |
| Cloudflare account + the `wrangler` commands (Stage 2) | Fix PRs, runbook, docs |
| Trigger activity from the second account; confirm what you see on the phone (Stage 5) | Read the D1/logcat/`wrangler tail` side of each test |

**Estimated effort:** about an hour of your time in total, spread over three short touchpoints
(Stages 1–2, then 4, then 5). **Definition of done:** a comment from `cyclopstest` produces a push on
`cyclops`'s phone with the unread badges untouched; reauth and deregistration behave as in the table.
