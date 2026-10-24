# Probe findings (b-oss#482)

What has been checked about the public site, API and image host, and what is still open. Findings
are from plain anonymous requests made from a dev VM on 2026-10-23 (User-Agent
`b-oss-status-monitor/0.1 (+https://b-oss.dev; unofficial independent status monitor)`), one
request each, no credentials. **Partial: the items under "Still to verify" gate the final check list.**

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

## Still to verify (needs a Worker run and/or the monitor client id, b-oss#487)

- **Photo check from a Worker.** The dev VM's egress proxy blocks the image host, so `HEAD` on
  the photo URL couldn't be tried here. Confirm a Worker gets 200 and an `image/*` content type.
- **API checks with the monitor's client id**: how the client id is presented for anonymous app
  calls (the code sends `client_id` as a query parameter, provisional), the shape of
  `entries/recent` and `entry` responses, and what healthy latency looks like.
- **Thumbnail URL from the API** vs the entry page's `og:image`: whether to also check the API's
  thumbnail host. Currently only the entry page's image is checked.
- **From a Worker:** that the site and API behave as they did from the VM (no challenge pages for
  Cloudflare IP ranges), CPU time per run (limit 10 ms; waits don't count), subrequests per run
  (limit 50; a run with a retry is at most 10).
- **Thresholds:** `slowMs` is 8 s and `timeoutMs` 10 s as a first guess; set from observed latency.
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
