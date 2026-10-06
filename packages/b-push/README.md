# b-push — runbook

b-push is b-mobile's notification service: a Cloudflare Worker with a D1 database. Every minute
it checks which registered accounts are due (every 5 minutes by default), reads each one's
unread **counts** from Blipfoto (`messages/totals/unread`, which never marks anything read), and
sends an FCM push when a count rises. Design: [notification-service.md](../b-mobile/docs/ImplementationSpec/notification-service.md).
History of the first deployment: [b-oss#148](https://github.com/IanMStevenson/b-oss/issues/148).

Deploys are manual. No CI job deploys this, and no agent holds the credentials.

## What's live

| Thing | Where |
| --- | --- |
| Cloudflare account | A dedicated account for b-push, not a personal one. `account_id` is in `wrangler.toml` |
| Worker | `b-push`, at `https://b-push.b-oss.workers.dev` |
| Database | D1 `b-push`. `database_id` is in `wrangler.toml` |
| Cron | `*/1 * * * *`, the activity poll (the only trigger) |
| Firebase | Project `b-oss-mobile`, Android app `io.github.ianmstevenson.bmobile` |

## Credentials and secrets

| What | Kept in | Used for |
| --- | --- | --- |
| Cloudflare API token ("Cloudflare – b-push deploy token") | Ian's 1Password | `wrangler deploy`. Permissions: Workers Scripts Edit, D1 Edit, Account Settings Read; this account only |
| `READ_TOKEN_ENCRYPTION_KEY` | Worker secret; backup in 1Password ("b-push secrets") | AES-GCM encryption of stored Blipfoto read tokens |
| `REGISTRATION_SECRET` | Worker secret; 1Password; the root `.env.local` as `VITE_NOTIFY_REGISTRATION_SECRET` | Coarse gate on `POST /v1/registrations`. It ships inside the APK, so it's not a credential |
| `FCM_SERVICE_ACCOUNT_JSON` | Worker secret only | Signing FCM requests. A new key can be generated in Firebase at any time |
| `google-services.json` | `packages/b-mobile/android/app/` (gitignored) | Firebase client config for the app build. Not secret; re-download from Firebase |

Never paste any of these into chat, commit messages, issues or logs. Secrets are set in the
dashboard: Workers & Pages → `b-push` → Settings → Variables and Secrets, type **Secret**.

## Deploy

From an up-to-date checkout of `b-mobile-initial` on the VM:

```
cd packages/b-push
git log -1 --oneline          # check this is the commit you mean to deploy
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN    # paste the token; nothing shows
npx wrangler@4.148.0 deploy
unset CLOUDFLARE_API_TOKEN
```

It prints the URL, the cron schedule and a new Version ID. Secrets carry over between deploys.
Then check the logs (below) for an `activity poll` line within a minute or two.

If the change comes with a schema migration, follow [migrations/README.md](migrations/README.md);
each migration says whether it runs before or after the deploy.

## Read the logs

Dashboard → Workers & Pages → `b-push` → **Observability** → Events. Choose a time range and
click **Refresh**; the view doesn't update on its own, and a freshly opened page can look empty.
The free plan keeps up to 200,000 events a day.

The lines b-push writes (never tokens or request bodies; see `src/log.ts`):

| Line | Meaning |
| --- | --- |
| `[b-push] activity poll {"due":1,"polled":1,"pushed":0,"reauthRequired":0,"errors":0}` | One cron tick. `due:0` is normal between polls |
| `[b-push] poll failed for <registration id>: <error>` | One registration's poll failed. It's retried next minute |
| `[b-push] reauth push failed for <id>: <error>` | The "sign in again" push couldn't be sent |
| `[b-push] <METHOD> <path>: <error>` | An unexpected error in an HTTP request (it returned 500) |

Each HTTP request also appears as an event with its status.

`npx wrangler tail` (live logs from the terminal) needs the **Workers Tail: Read** permission,
which the deploy token doesn't have. Add it to the token if you want it.

## Look at the database

Dashboard → Storage & Databases → D1 → `b-push` → **Console**. Never select the token or secret
columns (`read_token_ciphertext`, `read_token_nonce`, `secret_hash`, `device_token`). For
example:

```sql
SELECT id, blipfoto_user_id, platform, status, poll_interval_minutes,
       push_comments, push_notifications,
       datetime(created_at/1000,'unixepoch')     AS created,
       datetime(last_polled_at/1000,'unixepoch') AS last_polled,
       last_seen_comments_total, last_seen_notifications_total
FROM registrations;
```

Times are stored in UTC milliseconds.

## Roll back

Dashboard → `b-push` → **Deployments** → pick the previous version → **Rollback**. Or, with the
token loaded as above, `npx wrangler@4.148.0 rollback`. Rolling back the code doesn't roll back
D1. If a migration ran with the deploy, check the older version still works with the current
schema (each migration's notes say what the old Worker needs).

## Rotate secrets

- **`FCM_SERVICE_ACCOUNT_JSON`**: Firebase console → Project settings → Service accounts →
  Generate new private key. Paste the file's contents into the Worker secret, delete the local
  file, then delete the old key in Google Cloud console → IAM → Service accounts → (the
  firebase-adminsdk account) → Keys. No user impact.
- **`REGISTRATION_SECRET`**: set the new value on the Worker and in `.env.local`, and ship a new
  app build. Existing registrations are unaffected (each has its own per-registration secret),
  but installs of older builds can no longer *create* a registration.
- **`READ_TOKEN_ENCRYPTION_KEY`**: **don't rotate it yet.** Every stored token would fail to
  decrypt, and at the moment that fails silently: the row is retried every minute and the user
  is never told ([b-oss#252](https://github.com/IanMStevenson/b-oss/issues/252)). Once #252 is
  fixed, rotating means each user gets one "sign in again" notification. If the key is ever
  lost, the effect is the same as rotating it.
- **Cloudflare API token**: dashboard → My Profile → API Tokens → Roll. Update 1Password.

## Free-tier limits

| Limit | Use at 2–20 registrations |
| --- | --- |
| Workers: 100,000 requests a day | 1,440 cron runs a day, plus a handful of app calls |
| Cron: 1-minute minimum, 5 triggers per account | One trigger |
| 10 ms CPU per run (waiting on `fetch` doesn't count) | Polling is almost all waiting |
| 50 outbound requests per run | One per due registration, plus two per push (FCM token exchange and send). Registrations fall due at different minutes, so a run uses a few. About 10 registrations due in the *same* minute with both streams pushing would reach the cap |
| D1: 5M rows read, 100k rows written a day | Each poll writes one row: under 6,000 writes a day at 20 registrations |
| Workers Logs: 200,000 events a day | About 3,000 a day |
| Blipfoto: rate limit per access token, 15-minute windows | One call per registration every 5 minutes |

If registrations grow by an order of magnitude, revisit the outbound-request budget first (for
example, cache the FCM access token across pushes in a run).
