# b-status

The monitor behind the unofficial Blipfoto status page: a Cloudflare Worker (cron every 15
minutes) and a D1 database. See [ARCHITECTURE.md](ARCHITECTURE.md) for how it works, and
b-oss#476 for the design and the page.

## Status

Under construction (b-oss#483). The probe, retry, incident tracking and schema exist and are
tested. Not yet built: the public JSON endpoint and rollup (b-oss#484), visitor reports
(b-oss#486), and the page (b-oss#485). The API checks need the monitor's client id (b-oss#487) and
are skipped without it.

## Develop

```bash
npm run typecheck -w @b-oss/b-status
npm test -w @b-oss/b-status
```

## Deploy (manual, once the setup in b-oss#487 is done)

Same method as b-push (see `packages/b-push/wrangler.toml`): a scoped API token, never
`wrangler login`.

```bash
read -rs CLOUDFLARE_API_TOKEN && export CLOUDFLARE_API_TOKEN
cd packages/b-status && npx wrangler@4.148.0 deploy
```

The D1 database is created in the dashboard and `src/schema.sql` is run in its Console; secrets
(`MONITOR_CLIENT_ID`) are set on the Worker in the dashboard. `wrangler deploy` leaves them in
place. Logs: Workers Logs, lines prefixed `[b-status]`.
