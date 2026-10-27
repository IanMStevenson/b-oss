# b-status

The monitor behind the unofficial Blipfoto status page: a Cloudflare Worker (a cron every 15
minutes, plus `GET /v1/status` and `POST /v1/shares`) and a D1 database. How it works:
[ARCHITECTURE.md](ARCHITECTURE.md). Why, and the history: b-oss#476. The page it feeds:
`packages/b-site` (design record in `packages/b-site/docs/status-page.md`). What the probe checks and
what has been verified against the live system: [docs/probe-findings.md](docs/probe-findings.md).

## Status

**Live** since 2026-10-27 at `https://b-status.b-oss.workers.dev` (same Cloudflare account as b-push, D1
database `b-status`; the database id is in `wrangler.toml`). A visitor report triggers an immediate
re-check (b-oss#561, approach A; see ARCHITECTURE.md).

## Develop

```bash
npm run typecheck -w @b-oss/b-status
npm test -w @b-oss/b-status
```

## Deploy (manual)

Same method as b-push: a scoped API token, never `wrangler login`. From an up-to-date checkout of `main`:

```bash
cd packages/b-status
git log -1 --oneline                                           # the commit you mean to deploy
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN   # paste the token; nothing shows
npx wrangler@4.148.0 deploy                                    # answer yes to the config prompt if shown
unset CLOUDFLARE_API_TOKEN
```

Check the `Total Upload` line against what `npx wrangler@4.148.0 deploy --dry-run --outdir /tmp/x`
reports for the same checkout: a different size means a different build from the one you expect.
Secrets and D1 data carry over between deploys. A **new** cron trigger first fires about one full
cycle after the deploy (nothing runs at the next quarter-hour).

## Configuration

| What                        | Where                                                                                   | Notes                                                                                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MONITOR_CLIENT_ID`         | Worker secret (dashboard: Workers & Pages, `b-status`, Settings, Variables and Secrets) | The client id of the dedicated "status monitor" Blipfoto app. Sent as `Authorization: Bearer <id>` (a `client_id` query parameter is NOT accepted). Without it the API checks are skipped and the API shows Unknown. |
| `TURNSTILE_SECRET_KEY`      | Worker secret                                                                           | Cloudflare Turnstile secret key for the status page's widget. Without it reports answer 503.                                                                                                                         |
| `SHARE_HASH_SALT`           | Worker secret                                                                           | A long random string salting the IP hash used by the one-report-per-half-hour limiter.                                                                                                                               |
| `PUBLIC_TURNSTILE_SITE_KEY` | A **build** variable on the `b-oss-site` Cloudflare project (Settings, Build)           | The widget's public site key; read at site build time, so it must be a build variable, not a Worker runtime variable.                                                                                                |

Keep copies of the secret values in the password manager, never in the repo or in issue text. Which
origins may read the data is the `ALLOWED_ORIGINS` set in `src/cors.ts`.

## Operating it

- **Logs:** Workers Logs (enabled in `wrangler.toml`), lines prefixed `[b-status]`, for example
  `[b-status] slot 1992343 site=up api=up`. Cloudflare keeps them for 3 days on the Free plan (7 on
  Paid). Each request's log entry can include the visitor's IP address (see the site privacy policy).
- **Report-triggered re-checks** log `[b-status] triggered check start`, then `done` (with the elapsed
  time and what changed), `failed` or `skipped` (with the reason). A `start` with no `done` or
  `failed` after it means the run was cut off by the free plan's 10 ms CPU limit: switch to approach
  B (a once-a-minute cron) as described in ARCHITECTURE.md.
- **A check is failing:** the latest sample says why. In the D1 console:
  `SELECT checks FROM samples ORDER BY slot DESC LIMIT 1;` and read the failing check's `detail`
  (an API error shows its code, for example `API error 52: The client is invalid.`).
- **Loading the schema into a new database:** paste `src/schema.sql` into the D1 console (its
  comments are block comments because the console flattens pasted SQL onto one line). Every statement
  is `IF NOT EXISTS`.
- **Wiping data** (for example after testing): in the D1 console run
  `DELETE FROM samples; DELETE FROM incidents; DELETE FROM snapshot; DELETE FROM meta;` (add
  `DELETE FROM day_exceptions;` to drop long-term history too). The page shows "can't tell" until the
  next probe rebuilds the snapshot (up to 15 minutes), so do it just before a quarter-hour. To remove
  only test user reports: `DELETE FROM shares; DELETE FROM share_limit;`.
- **Budget (Workers Free, shared with b-push):** 100,000 Worker requests a day account-wide, 10 ms CPU
  per invocation, 50 subrequests; D1 5M rows read and 100k written a day. A page view costs no D1
  read in the normal case. Watch the Worker's Metrics for CPU time and errors now and then.
