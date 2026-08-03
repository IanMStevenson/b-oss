# Error codes → behaviour

The Blipfoto API **always returns HTTP 200**; success or failure is carried as an **error code**
in the response body. The app must read the code, not the HTTP status.

A canonical, complete error-code catalogue exists server-side; the table below is the confirmed
subset the UI must handle **specially** (each drives distinct behaviour). All other non-zero
codes are treated as a generic, surfaced error.

The published API documentation is broad but explicitly non-exhaustive, and known to be wrong or
incomplete in a few places (noted inline below where it matters). Confidence levels below reflect
that: "confirmed" means verified true independent of the published docs; "documented" means it
matches the published docs but hasn't been independently verified; "unconfirmed" means it's a
best-fit guess that still needs a live check before shipping copy that depends on it.

| Code | Meaning | Required app behaviour |
|---|---|---|
| `0` / none | Success | Proceed. |
| 11 | Request limit reached (rate-limited) | Back off and retry after a short delay; surface a lightweight "please wait a moment" message rather than a hard error; never retry immediately in a loop. |
| 16 | Access token scope is insufficient | A write was attempted with a read-only token. **Should not happen** — a read-only account must never be offered a write affordance ([rules.md](../rules.md)). If it occurs it means a gating bug: surface a plain "this account is signed in read-only" message, do not retry, and never silently escalate scope. |
| 31 | `invalid_grant` | An OAuth-layer rejection of the authorization itself. With implicit grant the app rarely sees this as a *code* — a failed or declined authorization normally arrives as an `error` parameter in the redirect instead (see below). Surface "sign-in failed" and let the user retry. |
| 50 | User access token missing | Programming/state error — a bearer wasn't attached to the call; should not happen in normal use (see [rules.md](../rules.md): a credential is always required). |
| 51 | Session invalid / token rejected | **Forced logout**, per-token (see [auth.md](auth.md)): clear that token; switch to another stored account or return to anonymous if none remain. Can occur on *any* call. (FLW-02) |
| 52 | Client is invalid | The app's own client id was rejected — a configuration/build problem, not a per-call bug; should not happen in normal use. |
| 101 | Username invalid | The username supplied was malformed / failed input validation — a client-side input problem, distinct from 103. Surface a generic "invalid username" message. Confirmed. |
| 102 | Username unavailable | The username is already taken by another account. Drives the "username already taken" message on `SCR-25` when changing username. |
| 103 | User unavailable | **Confirmed primary trigger for "no such user"** on a profile lookup (`SCR-18`) — the username was well-formed but the account isn't accessible (doesn't exist, deleted, or suspended). Surface "user not found" and return. |
| 104 | Protected / not visible | Show a "protected" message inline (in feeds) or close with a message (on the entry screen); do **not** treat as a hard error. Confirmed. |
| 202 | Entry unavailable | The entry no longer exists, or is not available to this viewer. Reached mainly by opening a stale target — a push, a notification-inbox row, a shared link, or a prev/next neighbour for an entry deleted since the list was fetched. Show a plain "this entry is no longer available" state and return to where the user came from; never a generic failure, and never an empty entry screen. |
| 205 | Comments disabled on this entry | Primary UX is **proactive**: gate the comment/reply action on the entry's own `actions.comment` flag (already specified on `SCR-06`/`SCR-15`) so the control is simply unavailable rather than erroring. This code is the defensive fallback for the race window between load and submit — same message as the proactive-gating state. |
| 221 | Already starred | **Not a failure.** The star is already in place, so the optimistic +1 stands: keep the UI as-is, show no error, and don't retry. Reachable by a double-tap or by acting from a stale screen. |
| 222 | Already favourited | Same as 221 — the favourite is already in place. Keep the optimistic state, show no error. Distinct from 223, which *is* a refusal. |
| 223 | Daily favourite quota reached | On favourite, show the quota-specific message and **roll back** the optimistic +1. |
| 240 | Image is not a valid JPG | Primary UX is **proactive**: pre-validate MIME type and dimensions client-side before upload, so this code is rarely hit server-side. This is the defensive fallback for whatever slips past a client-side check. |
| 250 | Cannot publish — date too far in the past | POST-time enforcement of the one-entry-per-day/date-window rules. The primary check is `GET journal/day`'s `state`/`actions.publish` fields (already resolved — see `SCR-10` and [open-questions.md](open-questions.md) item 1), used to disable/warn before submit; this code guards the race window between that check and the actual `POST entry`. |
| 251 | Cannot publish — date in the future | Same pattern as 250. |
| 252 | Already have an entry on this date | Same pattern as 250 — the one-entry-per-day rule. |
| 303 / 304 | Comment cannot be replied to | Primary UX is **proactive**: gate the reply action on the comment's `actions.reply` flag (`SCR-06`/`SCR-15`). Defensive fallback for the race window, same message either way. |
| 305 | Comment cannot be deleted (not yours) | Same pattern — gate on `actions.delete`. |
| 306 | Comment cannot be edited (not yours) | Same pattern — gate on the comment's edit action flag (`SCR-15`). |
| 516 / 517 | Journal title invalid / too long | Drives `SCR-25`'s journal-title field validation message. **Confirmed limit: 25 characters.** |
| 525 / 526 | Entry title too long / invalid | Drives `SCR-10`'s title-length warning. **Confirmed limit: 50 characters.** |
| 527 / 528 | Entry tags too long / invalid | Drives tag-field validation on `SCR-10`/`SCR-13`/`SCR-25`. **Confirmed limit: 255 characters** across the whole comma-separated field. |
| 107 / 506 | Registration errors | Not applicable in-app (registration is browser-based); included for completeness. |

## OAuth-layer codes (30–35)

These belong to the OAuth exchange itself, distinct from the resource-call codes above. Added here
for completeness, even though under this app's **implicit-grant** flow most of them arrive as a
redirect `error` parameter rather than as one of these numbered codes (see the next section).

| Code | Meaning | Note |
|---|---|---|
| 30 | `invalid_request` | The authorization request itself was malformed. |
| 31 | `invalid_grant` | The grant (code/credentials) was rejected — see below for how this actually surfaces under implicit grant. |
| 32 | `unsupported_grant_type` | Wrong `grant_type` sent. Should not occur — the app always sends the implicit-grant `response_type=token`. |
| 33 | `invalid_client` | `client_id` not recognised. Distinct from resource-call code 52 (a rejected bearer on an ordinary API call) — this is the client being rejected during the OAuth exchange itself. Should not occur once the app is registered ([open-questions.md](open-questions.md) prerequisite A). |
| 34 | `unauthorized_client` | This client isn't permitted to use the grant type it requested. A build/registration problem, not a per-call bug. |
| 35 | `invalid_redirect_uri` | **The failure to expect during first setup** — the registered `redirect_uri` doesn't match what the app sent. Build configuration problem, not user-actionable; make it unmistakable in development rather than folding it into a generic "sign-in failed." |

Codes 30–35 are documented (published-docs) rather than independently confirmed for this app's
flow specifically — verify live once app registration ([open-questions.md](open-questions.md)
prerequisite A) is in place.

## Authorization failures don't arrive as error codes

Under implicit grant, a sign-in that fails or is declined does not produce an API response at all —
there is no call to return a code on. The failure comes back as an **`error` parameter in the
redirect** to the app, not as one of the numbered codes above. `SCR-01` distinguishes its **Error**
and **Cancelled** states from that parameter, not from the table above:

- **`access_denied`** → the user declined on Blipfoto's page. This is `SCR-01`'s **Cancelled**
  state: return to idle, no error banner.
- **Any other `error` value** → `SCR-01`'s **Error** state: a clear message, stay on the screen,
  retry available.
- **A redirect-URI mismatch** (code 35, `invalid_redirect_uri`, above) is the failure to expect
  during first setup, and it is a build configuration problem rather than anything the user can act
  on. It should be unmistakable in development rather than folded into a generic "sign-in failed".

A returned token that then fails verification (`GET oauth/token`, see [auth.md](auth.md)) is also
an **Error**, not a Cancelled.

General rules (see [rules.md](../rules.md)):

- **Transport failures** (no connectivity, timeout) are *retriable*; **application error codes**
  are not retried blindly — they are handled per meaning or surfaced.
- On any surfaced error the user **stays where they are**, sees a clear message, and **keeps any
  entered text** (e.g. a half-written comment).
- Optimistic UI that changed a visible count (favourite/star) **rolls back** if the server
  rejects the action.

> Extend this table with any additional codes that warrant specific UX as they're encountered;
> leave the rest to the generic handler.

## Codes that don't uniquely identify their failure

Two codes are confirmed to genuinely cover more than one distinct failure — this is real server
behaviour, not a documentation gap, so the message text (not the code) is what distinguishes the
cases:

- **Code 80** covers four distinct search/list validation failures (missing query options,
  invalid location type, invalid sort, invalid bounding box).
- **Code 501** covers two distinct email-validation failures on registration ("no email provided"
  vs "email invalid") — moot in-app since registration is browser-based, included for
  completeness.

Neither needs special handling: the app was never going to branch UI logic on which sub-case
occurred, so the generic handler (surface the server's message text) already covers both
correctly.
