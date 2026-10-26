# b-status — architecture

b-status is the monitor behind the unofficial Blipfoto status page (b-oss#476). A Cloudflare
Worker probes the public website, API and image host from outside every 15 minutes, records the
result in D1, and publishes one JSON snapshot the static status page reads. It is not
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

| Table            | Rows                                                                                                                                                                                                                                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `samples`        | One per 15-minute slot (`slot` = floor(ms / 15 min), a duplicate cron is a no-op). A missing slot is "no data", never up or down. Per-check results kept as JSON, so an incident can say which check failed                                                  |
| `incidents`      | One per component per outage; `ended_at` NULL while ongoing                                                                                                                                                                                                  |
| `day_exceptions` | **Sparse** long-term history: a row only for a UTC day and component that had down or unknown slots. "Up" is derived (a day has 96 slots), so a day with no row was a perfect day. Incident counts and what failed are not stored here: `incidents` has them |
| `meta`           | `first_ts` (when monitoring began), `folded_through` (the last day folded) and `history` (a cached summary of the folded days, rebuilt once a UTC day)                                                                                                       |
| `snapshot`       | The page's whole data bundle, one row, rebuilt each run                                                                                                                                                                                                      |

Whole UTC days that ended at least 48 hours ago are **folded** into `day_exceptions` and their
samples deleted, in one batch (`fold.ts`), so raw samples are kept for 48 to 72 hours. Only days
with something to record get a row. Every day since the last fold is visited, so a day on which the
monitor never ran is recorded as all-**unknown** instead of silently counting as up (uptime would
otherwise be overstated). Incidents are kept for good. A day's definition is frozen when it is
folded.

## The snapshot and the endpoint (`snapshot.ts`, `serve.ts`)

After each probe, the run folds old days and rebuilds **one JSON snapshot** holding everything the
page draws: current state, the 48-hour lanes (as down/no-data _segments_, not 192 samples), daily
history for the **last 30 days** (non-empty days only; the page fills the gaps; anything older is
covered by the uptime table and the incident list),
the uptime table (rounded **down**, so 100 only when nothing was found down), and the incident list
(one row when one cause took both parts down). It carries `generated_at` and `next_refresh_at` so
the page knows when fresher data can exist. `now.*.stale` only says the monitor itself has missed
samples as of the build; a snapshot whose cron has stopped is not rewritten, so **the page must judge
staleness from `generated_at` against its own clock** (older than two intervals reads as Unknown).

`GET /v1/status` serves it from isolate memory: a page view costs **no D1 reads** in the normal
case, and `Cache-Control: max-age` is the time remaining. If the cron is late the Worker still holds
the old snapshot for a minute before looking again. Only the page's own origins get CORS headers.

The once-a-day history rebuild reads only the sparse `day_exceptions` rows and the incidents, so it
stays small however many years accumulate (b-oss#510).

## Visitor shares (`shares.ts`)

`POST /v1/shares` takes an anonymous "share a problem": which part (**Site** = the website, **API**
= an app), what's happening (**offline** or **not working right**), and optional tags (login, uploads,
slow, unreliable). No account, no email, no free text. Shares are a separate, unverified signal: they
**never** change probe state or uptime.

Cheapest check first, so bots never reach the store: validation (no I/O), then Cloudflare Turnstile
verification, then the 30-minute limiter and a global hourly circuit breaker (two D1 reads), then
one D1 batch. The limiter keeps a **salted hash of the IP** (`share_limit`), never the IP, checked
inline against its expiry so the 30 minutes is exact. A repeat gets `already_shared` and is never
told when it can share again. Expired limiter rows are purged on every accepted share and by each
cron run, so a hash can outlive its 30 minutes by up to one cron interval (15 minutes): say "about
half an hour" in user-facing copy, not "exactly 30 minutes then deleted".

Whole days older than 48 hours fold into `share_days` counts and the raw rows (with their tags) are
deleted. The snapshot carries hourly counts (48 hours) and daily counts (30 days) per part. The client should send the POST as `text/plain` so it is a simple request with
no CORS preflight.

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
