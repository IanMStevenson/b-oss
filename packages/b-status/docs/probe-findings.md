# Probe findings (b-oss#482)

What has been checked about the public site, API and image host, and what is still open. Findings
are from plain anonymous requests made from a dev VM on 2026-10-23 (User-Agent
`b-oss-status-monitor/0.1 (+https://b-oss.dev; unofficial independent status monitor)`), one
request each, no credentials. The items under "Still to verify" are the remaining open points.

## Verified

- **Website browse page** (`GET /browse`): HTTP 200, HTML, no bot challenge for a non-browser
  User-Agent, fast (about 0.2 s). It links to many entries as `/entry/<digits>` (19-digit ids), so
  "first match of `/entry/(\d{6,})`" is a reliable way to pick an entry id; ids are taken from the
  page, never hard-coded.
- **Entry page** (`GET /entry/<id>`): HTTP 200, a `<title>` of the form `<entry title> | <user> |
Blipfoto`, and `og:image` (a direct photo URL). That URL is the photo the photo check uses, so
  the photo check does not depend on the API.
- **API without a client id** (`GET /4/entries/recent?page_size=10`): HTTP 200 with a JSON envelope
  `{"version":"4","error":{"object":"Error","code":52,"message":"The client is invalid."},"data":null}`.
  The same envelope comes back for a path that doesn't exist, so an anonymous call only proves
  the API's front door and JSON layer are up; it is **not** evidence that the API serves data. A
  real check needs the monitor's client id.
- Rate-limit headers on that response are `-1` (unlimited) for an unidentified client.
- The API reports failures in the body (`error` non-null) with HTTP 200, so the check must read the
  envelope, not the status code (as implemented in `src/checks.ts`).

## Verified on the live system (2026-10-27)

- **API auth for the monitor:** the client id goes in an `Authorization: Bearer <client id>` header.
  A `client_id` query parameter is **not** accepted: it answers `error.code 52, "The client is
invalid."`, exactly as an unidentified call does. (The first deployed version sent the query
  parameter, so its API check failed; fixed afterwards.)
- `entries/recent?page_size=N` with that header returns 200 and `{error: null, data: {page, entries[]}}`
  with `entry_id_str`, `thumbnail_url` and `image_url` per entry. `entry?entry_id=<id>` returns the
  same entry (`data.entry.entry_id_str`). Both are what `api_recent` and `api_entry` check.
- **Photo check from a Worker:** the website checks and the photo `HEAD` all pass from Cloudflare's
  network (about 160 ms for the pages and 10 ms for the photo), so the site doesn't challenge or
  block the Worker.
- **Cron:** the first scheduled run of a new trigger is about one full cycle after deploy (nothing
  ran at the first slot).

## Still to verify

- **CPU per run** against the free plan's 10 ms limit (check the Worker's metrics over a few days;
  the runs so far completed normally).
- **Thumbnail URL from the API** vs the entry page's `og:image`: whether to also check the API's
  thumbnail host. Currently only the entry page's image is checked.
- **Thresholds:** `slowMs` is 8 s and `timeoutMs` 10 s as a first guess; set from observed latency
  (so far: pages about 0.16 s, API about 0.6 s).
- **Retry delay:** 5 s is a first guess.

## Check list as implemented

| #   | Check            | Pass condition                                                                                                                        |
| --- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `website_browse` | `GET /browse`: 200, contains an `/entry/<id>` link, within `slowMs`                                                                   |
| 2   | `website_entry`  | `GET /entry/<id from 1>`: 200, has a `<title>` and an `og:image`, within `slowMs`                                                     |
| 3   | `photo`          | `HEAD <og:image from 2>`: 200 and an `image/*` content type, within `slowMs`                                                          |
| 4   | `api_recent`     | `GET entries/recent?page_size=10` with the monitor client id: JSON envelope with `error` null and at least one entry, within `slowMs` |
| 5   | `api_entry`      | `GET entry?entry_id=<id from 4>`: `error` null and the same entry id back, within `slowMs`                                            |

Site = checks 1, 2, 3. API = checks 4, 5, 3. A check that cannot run because its input is missing
is skipped, not failed.
