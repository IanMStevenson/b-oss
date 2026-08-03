# Open questions

## Blocking — must be resolved before or during early implementation

| # | Item | Status |
|---|---|---|
| A | **App registration.** This app needs its own Blipfoto client ID and redirect URI (`bmobile://oauth/`). Both are registered. The client ID itself isn't recorded in this repo — see the b-oss handover material for where it's supplied. | Done |
| B | **The cloud notification service is designed but not yet built.** Architecture, data model, polling design and registration contract are specified in [`../../ImplementationSpec/notification-service.md`](../../ImplementationSpec/notification-service.md); the app-side contract is in [02-notifications.md](../02-notifications.md). It remains a hard dependency of `SCR-23` and `FLW-16`. Both decisions once open inside that document — at-rest token encryption, and whether polling may read recent comments given that doing so clears the user's unread badge — are now resolved; nothing left but the build. | Designed; build outstanding |

## Non-blocking — resolved elsewhere, wire in during implementation

The items below are exact definitions **already available in the build-repo API specification**
and just need to be wired in during implementation — they do not affect the screen/flow spec.

| # | Item | Status | Where it's resolved |
|---|---|---|---|
| 1 | `journal/day` publish **state definitions** | Resolved — states defined in the build-repo API spec, and each one's user-facing message is now written into `SCR-10` | Nothing outstanding. The can-publish boolean does the gating; the state drives the message, per `SCR-10`'s table. |
| 2 | **Complete error-code catalogue** | Confirmed — a canonical, single-source catalogue exists | Corrected/expanded entries are folded into [error-codes.md](error-codes.md); extend further as new codes are encountered in testing. |
| 3 | **Write/multipart contract** (publish/edit entry, avatar): exact field names, size/format limits, GMT-offset units, crop semantics | Resolved — detailed JSON spec + docs in build repo | Implement per build-repo spec. **Excludes additional photos** — `entry/photo` is unavailable to this app and is not implemented at all (see [endpoints.md](endpoints.md)). |
| 4 | OAuth **scope strings** | Resolved and recorded | The two literal values, and the rule that scope must always be sent explicitly, are in [auth.md](auth.md). |
| 5 | **Error codes 101 vs 103** — which means "no such user" on `SCR-18` | Confirmed | 103 is the trigger ("user unavailable" — nonexistent, deleted, or suspended); 101 is malformed input, a distinct case. See [error-codes.md](error-codes.md). |
| 6 | **Entry title / tags / journal title length limits** — sourced `SCR-10`'s title-length warning (`SCR-25` for journal title) | Confirmed | 50 / 255 / 25 characters respectively. See [error-codes.md](error-codes.md), `SCR-10`. |

## Settled by the review (recorded for traceability)

- **Auth**: Blipfoto OAuth, **implicit grant** (the distributed-app flow — see
  [auth.md](auth.md)). Token effectively **indefinite** until revoked → no refresh logic; a
  session ends on account removal, mode-downgrade, or forced-logout (error 51).
- **Client credentials**: app uses its **own registered App ID / Client ID**; same id is the
  anonymous bearer for logged-out browsing.
- **Wire format**: **JSON v4**; **ids handled as strings**.
- **Notifications**: the cloud service polls `messages/notifications/recent`,
  `messages/comments/recent`, `messages/totals/unread` — the only available source.
- **Dropped**: in-app registration (→ browser), membership purchase, all Twitter/Facebook
  features (login, auto-share, Sharing settings), Activities feed, Stats, Adverts.
- **Rich text**: BBCode retained, with formatting toolbar buttons in the editor (SCR-11).

## Cross-cutting build note

Exact request parameters — the `return_*` flags, upload field names, the paging contract,
namespaced paths — are **not restated in this appendix**. The build-repo JSON specification is
authoritative for all of them; implement against that.
