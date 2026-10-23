# b-status — architecture

b-status is the monitor behind the unofficial Blipfoto status page (b-oss#476). A Cloudflare
Worker probes the public website, API and image host from outside every 15 minutes, records the
result in D1, and (b-oss#484) publishes one JSON snapshot the static status page reads. It is not
operated by, affiliated with, or endorsed by Blipfoto, and it never uses credentials or user data.

It is a peer package to b-push and shares nothing with it except the Cloudflare account. It depends
on no other package. Design decisions and the visual targets are in b-oss#476 and
[design/](design/) (temporary screenshots).

## What a run does (`src/index.ts` → `probe.ts` → `incidents.ts`)

1. **Checks** (`checks.ts`), in sequence, each fed by the one before: website browse page (and an
   entry id from it), that entry's page (and its photo URL), a `HEAD` of the photo, then the API's
   recent-entries call and a single-entry call. A check whose input is missing is **skipped, not
   failed**, so one root cause isn't counted three times.
2. **State** (`derive.ts`): **Site** = website checks + photo; **API** = API checks + photo. So a
   photo failure turns both down. A component is **Unknown** when none of its own checks ran
   (e.g. before the monitor's API app exists).
3. **Retry** (`probe.ts`): if anything is down, run once more a few seconds later. A component is
   recorded down only if it is down on both attempts, so a blip doesn't paint a red sample.
4. **Store** (`incidents.ts`): one D1 batch writes the sample row and opens, extends or closes
   incidents. An incident starts at the first confirmed-down sample and ends at the first passing
   one; an Unknown sample does neither.

The API is judged by the **envelope's `error` field**, not the HTTP status: the API answers 200
with the failure in the body.

## Data (`src/schema.sql`)

| Table       | Rows                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `samples`   | One per 15-minute slot (`slot` = floor(ms / 15 min), a duplicate cron is a no-op). A missing slot is "no data", never up or down. Per-check results kept as JSON, so an incident can say which check failed |
| `incidents` | One per component per outage; `ended_at` NULL while ongoing                                                                                                                                                 |
| `snapshot`  | The page's whole data bundle, one row, rebuilt each run (b-oss#484)                                                                                                                                         |

Later (b-oss#484): samples older than 48 hours fold into per-day count rows; incidents are kept.

## Free-tier budget

The Cloudflare account is shared with b-push and its **Workers Free** quotas are account-wide: 100k
Worker requests/day, 10 ms CPU per invocation (waiting on `fetch`/D1 doesn't count), 50
subrequests per invocation, 5 cron triggers. D1: 5M rows read and 100k rows written per day. The
free plan doesn't bill, it **fails** (Error 1027) once a limit is hit, and a status page's traffic
peaks exactly when Blipfoto is down. So:

- A probe run is ~5 to 10 subrequests, one D1 read of the open incidents, and one batched write.
  Steady state is a few hundred rows written per day, well under 1% of the limit.
- Page views must cost no D1 reads: the snapshot is built once per run and cached in isolate
  memory (b-oss#484). One request per page load, `Cache-Control` set to the time remaining, no KV,
  no R2 in v1.
- Keep indexes minimal (each one costs an extra row write on every insert).

## Testing

`src/__tests__` runs the real `src/schema.sql` in an in-memory `node:sqlite` database, as b-push
does, and drives the checks with a fake `fetch`, so no network or Cloudflare emulation is needed.
