# `b-api` corrections needed

`b-api` (the API client + docs in the `b-oss` monorepo, `packages/b-api/`) has several places
where its published documentation doesn't match the API's actual behaviour. `AppSpec/` has already
been corrected to the actual behaviour in each case; this is the checklist of matching fixes
`b-api`'s own docs (`docs/api-general.md`, `docs/api-reference.md`) still need, so the discrepancy
doesn't resurface for the next person who reads `b-api`'s docs instead of `AppSpec/`.

Not urgent — a `b-oss`-side correcting pass once implementation starts, not blocking `AppSpec/`.

## Auth-type corrections

These endpoints are usable with just the app's client key (no user token required) — `b-api`'s
docs currently mark them as requiring a user token:

- `entries/search`
- `user/profile`
- `users/search`
- `user/awards` (`GET`)
- `users/followers` (`GET`) — note `DELETE users/followers` correctly stays user-only; removing a
  follower needs a user context even though listing them doesn't.

## Error-code corrections

| Code | `b-api` docs currently say | Should say |
|---|---|---|
| 52 | generic "missing/bad bearer" | "The client is invalid." |
| 50 | *(missing)* | "The user access token is missing." — a distinct, real code from 52, not a duplicate |
| 11 | *(missing from the must-handle list)* | Rate limiting — "request limit reached" |
| 233 | "The authenticated user has reached their photo limit." | Minor precision gap, not urgent: this is an **annual** quota (100 additional photos per calendar year, across all entries, resetting each January 1st), not a per-entry cap as the short gloss might suggest. |

### Length limits `b-api` doesn't state

Codes 516/517 (journal title), 525/526 (entry title), and 527/528 (entry tags) are documented with
message text only, no number. Confirmed values worth adding: journal title 25 characters, entry
title 50 characters, entry tags 255 characters.

## Image resolution fields

`image_urls`' higher-resolution and original fields should be documented as **populated only for
trusted first-party apps** — the same restriction as `entry/photo`. They come back null for an
independently-registered app, so standard resolution is the practical ceiling. The current docs
describe the fields without noting that most callers will never see a value in them.

## `entry/photo`

Should be documented as restricted to trusted first-party apps. An independently-registered app
(this one included) gets no access — in practice, additional photos aren't returned to it at all,
regardless of what the current docs imply is possible.

## Where `b-api` is right and `AppSpec/` was wrong

Recorded so a later reader doesn't "correct" `b-api` to match an older version of the spec:

- **`DELETE users/followers`** — `b-api`'s "Remove followers from the authenticated user's
  followers list" is accurate. `AppSpec/` previously claimed this also refused the member and added
  them to the refused list; it does not, and the spec has been corrected. Only
  `DELETE users/requests/pending` produces a refused member.
- **`POST entry/report` reasons** — `b-api` documents all five (`reason_explicit`,
  `reason_inappropriate_content`, `reason_copyright`, `reason_promotional`,
  `reason_incorrect_date`). `AppSpec/` was missing `reason_explicit` and has been corrected.
- **Error codes 101 and 103** — `b-api`'s docs ("Username(s) invalid" for 101, "The specified user
  is unavailable" for 103) are both accurate: 101 is malformed input, 103 is the trigger for "no
  such user." An earlier pass of `AppSpec/`'s error-code work briefly favoured 101 over 103 based
  on unreliable evidence and was corrected back — recorded here so it doesn't get "corrected" a
  second time in the wrong direction.
- **Codes 80 and 501** — `b-api`'s docs list code 80 four times (distinct search/list validation
  failures) and 501 twice (distinct email-validation failures), each set sharing one numeric code.
  That looked at first like a documentation-generation duplicate; it isn't — both are genuine,
  confirmed server behaviour (the same code really is returned for each grouped case, distinguishable
  only by message text). No fix needed on `b-api`'s side; don't "correct" these to unique codes.

## Source

`AppSpec/api-appendix/error-codes.md`, `endpoints.md`, and `open-questions.md` carry the
corrected, current version of all of the above, phrased as plain API facts for that spec's
purposes — treat those as the reference for what's actually true, this file as the todo list for
bringing `b-api`'s docs into line with them.
