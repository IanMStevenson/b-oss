# Endpoint touchpoints

The Blipfoto API endpoints the app relies on, grouped by capability and mapped to the screens and
flows that use them. This is a **touchpoint map**, not a wire reference — for exact request params,
response shapes, and field names, see the **build-repo API specification** (the source of truth).

Conventions: paths are the v4 resource (`/4/<resource>`, JSON). **Auth** is either
`anon-ok` (works logged out with the app client id) or `user` (needs a signed-in user token). See
[auth.md](auth.md).

---

## Authentication
| Verb | Resource | Purpose | Auth | Used by |
|---|---|---|---|---|
| — | *(authorize URL)* | Implicit grant: open Blipfoto's authorization page with `response_type=token` and the requested `scope`; the token returns in the redirect | — | SCR-01, FLW-01, FLW-20, FLW-22 |
| GET | `oauth/token` | Verify the token just received was issued to this app, and confirm its granted `scope` | user | SCR-01, FLW-20, FLW-22 |
| DELETE | `oauth/token` | Revoke one specific token | user | FLW-02, FLW-22, SCR-30 |

> **There is no `POST oauth/token` in this app.** The implicit grant returns the access token
> directly in the redirect — there is no server-side code exchange, and no client secret. See
> [auth.md](auth.md).
>
> `DELETE oauth/token` is authenticated with the **specific token being revoked**, not with
> whichever token is currently active. That matters for the two-token modes: revoking one leaves
> the other untouched.
>
> Registration (`user/account`) is **not used** — registration is browser-based.

## Browse / discover feeds
| Verb | Resource | Purpose | Auth | Used by |
|---|---|---|---|---|
| GET | `entries/recent` | Recent feed | anon-ok | SCR-02, FLW-03 |
| GET | `entries/popular` | Popular feed | anon-ok | SCR-02, FLW-03 |
| GET | `entries/following` | Feed from people you follow | user | SCR-02, FLW-03 |
| GET | `entries/journal` | A member's journal (own = "Just Me") | anon-ok | SCR-02, SCR-17, SCR-18 |
| GET | `entries/favorites` | A member's favourites | anon-ok | SCR-17, SCR-18 |
| GET | `entries/search` | Text / radial (nearby) / bounding-box (map) entry search | anon-ok | SCR-03, SCR-04, SCR-05, FLW-04, FLW-14 |

> All feed/list responses are paged (page index/size + "more"). The new app uses real
> pagination (no fixed page cap). Adverts are **not** requested (feature dropped).

## Single entry
| Verb | Resource | Purpose | Auth | Used by |
|---|---|---|---|---|
| GET | `entry` | Fetch one entry (+ details/metadata/comments/replies/related/actions/photos/image-urls) | anon-ok | SCR-06, SCR-08, FLW-05 |
| POST | `entry` | Publish a new entry | user | SCR-10, FLW-12 |
| PUT | `entry` | Edit an entry (details, or replace photo) | user | SCR-13, FLW-13 |
| DELETE | `entry` | Delete an entry | user | SCR-13, FLW-13 |
| POST | `entry/comment` | Post a comment or reply | user | SCR-15, FLW-07 |
| PUT | `entry/comment` | Edit one's own comment or reply | user | SCR-15, FLW-07 |
| DELETE | `entry/comment` | Delete a comment or reply — one's own anywhere, or **any** comment on one's own entry | user | SCR-06, SCR-24, FLW-07 |
| POST | `entry/favorite` | Favourite an entry | user | SCR-06, FLW-06 |
| POST | `entry/star` | Star (rate) an entry | user | SCR-06, FLW-06 |
| POST | `entry/report` | Report an entry, **or a comment on it** (the comment is identified in the free-text note — there is no separate comment-report resource) | user | SCR-16, FLW-11 |

## Compose support
| Verb | Resource | Purpose | Auth | Used by |
|---|---|---|---|---|
| GET | `journal/day` | Publish eligibility for a single date (one-per-day rule; can-publish + state) | user | SCR-10, FLW-12, FLW-18 |
| GET | `journal/month` | Publish eligibility for a whole month, as an array of days | user | SCR-10, FLW-12 |

> Use `journal/month` to populate the date picker so ineligible days are visibly unselectable up
> front, and `journal/day` to confirm the specific chosen date. One month call beats one day call
> per date change — see the rate-limit note below.
>
> See [open-questions.md](open-questions.md) re: `journal/day` state definitions (in the build-repo spec).

## Profiles & social graph
| Verb | Resource | Purpose | Auth | Used by |
|---|---|---|---|---|
| GET | `user/profile` | A member's profile (own or other; details/entries/badges/friendship) | anon-ok | SCR-17, SCR-18 |
| GET | `user/awards` | Earned badges | anon-ok | SCR-22 |
| GET | `users/search` | People search | anon-ok | SCR-03, FLW-04 |
| GET | `users/followers` | Followers list | anon-ok | SCR-19 |
| DELETE | `users/followers` | Remove a follower — ends the follow relationship. Does **not** refuse them; see the note below | user | SCR-19, SCR-18, FLW-09 |
| GET | `users/following` | Following list | anon-ok | SCR-19 |
| POST | `users/following` | Follow / subscribe | user | SCR-06, SCR-18, FLW-08 |
| DELETE | `users/following` | Unfollow / unsubscribe | user | SCR-06, SCR-18, FLW-08 |
| GET | `users/requests/pending` | Pending follow requests | user | SCR-20, FLW-09 |
| PUT | `users/requests/pending` | Approve a request | user | SCR-20, FLW-09 |
| DELETE | `users/requests/pending` | **Refuse** a request — this is what makes someone a refused member | user | SCR-20, FLW-09 |
| GET | `users/requests/blocked` | Members refused access to a protected journal | user | SCR-21, FLW-09 |
| DELETE | `users/requests/blocked` | Restore a refused member's access | user | SCR-21, FLW-09 |

> **Removing a follower and refusing a follow request are different operations with different
> outcomes.** Only `DELETE users/requests/pending` — refusing a *pending request* — produces a
> refused member on `SCR-21`. `DELETE users/followers` ends an existing follow relationship and
> nothing more; the member never appears on `SCR-21`.
>
> What that means for the person removed:
> - **Public journal** — they lose nothing they couldn't get back; they can simply follow again.
> - **Protected journal** — they lose access. To regain it they must send a **fresh follow
>   request**, which arrives at `SCR-20`, where the owner can approve or refuse it. Refusing *that*
>   request is what puts them on `SCR-21`.
>
> So removing a follower from a protected journal is effective but not final, and the app must not
> describe it as though it were. Cutting a member off permanently is a two-step sequence: remove
> them, then refuse the request if they send one.
>
> **Hiding a member uses no endpoint.** It is enforced entirely on the device (`SCR-31`,
> `FLW-10`). Only *refusing* has a server-side representation, via the two
> `users/requests/blocked` calls above and `DELETE users/requests/pending`. The API's naming says
> "blocked"; the app's UI deliberately does not (see [../rules.md](../rules.md)).

## Messages (inboxes & unread counts)
| Verb | Resource | Purpose | Auth | Used by |
|---|---|---|---|---|
| GET | `messages/notifications/recent` | Recent notifications (optional `since_id` cursor). **Reading this marks the returned items read** | user | SCR-23, FLW-15 |
| GET | `messages/comments/recent` | Recent comments received (optional `since_id` cursor). **Reading this clears the comment unread total — all of it** — see below | user | SCR-24, FLW-15 |
| GET | `messages/totals/unread` | Unread comment + notification counts. **The only one of these with no side effect** | user | SCR-23, SCR-24, FLW-15 |

> **Reading either stream marks it read. There is no way not to.** This is the single most
> important property of this group, and it shapes both the app and the cloud notification service:
>
> - **Notifications** — fetching marks exactly the items returned as read. Paging is therefore
>   self-consistent: each page clears itself and nothing else. **No separate mark-read call is
>   needed**, and the app should not make one.
> - **Comments** — fetching clears **every** unread comment for the account, not just the page
>   returned. So a paged comments inbox must capture which items were unread from its *first*
>   response; later pages will show everything as read. There is no per-item control.
> - **Entries clear comments too** — `GET entry` with comments included clears the comment
>   notifications for that entry (`SCR-06`), so the comments badge can drop without the comments
>   inbox being opened.
>
> **`messages/totals/unread` is the only side-effect-free read**, which is why the **cloud
> notification service polls it and nothing else** — a service that fetched content would clear the
> user's badges, in this app and on the website, every polling cycle. Its push therefore reports a
> count rather than an event. See
> [`../../ImplementationSpec/notification-service.md`](../../ImplementationSpec/notification-service.md)
> and [02-notifications.md](../02-notifications.md).
>
> **Use `messages/totals/unread` for counts, not the similarly-named unread-totals resource under
> `messages/notifications/`** — the latter reports the notification count under both keys, which
> would make comment activity undetectable. Easy to "helpfully" switch to; don't.
>
> **The two counts are independent.** A comment raises only the comment total and never the
> notification total, so the two can be compared and reported separately without double-counting.
>
> Always page with the `since_id` cursor so only new items are fetched, never a full refetch.
>
> **Items in both streams expire after about two weeks**, so neither inbox pages back further.

## Settings
| Verb | Resource | Purpose | Auth | Used by |
|---|---|---|---|---|
| GET | `user/settings` | Read account/profile settings (general, journal, profile, username, biography) | user | SCR-25, FLW-17 |
| PUT | `user/settings` | Update settings; also avatar upload and avatar delete | user | SCR-25, FLW-17 |
| GET | `user/settings/notifications` | Read feed + push notification preferences | user | SCR-25, FLW-17 |
| PUT | `user/settings/notifications` | Update notification preferences | user | SCR-25, FLW-17 |
| GET | `config/countries` | Country list, to populate the country picker | anon-ok | SCR-25, FLW-17 |
| GET | `config/locales` | Locale list, to populate the locale picker | anon-ok | SCR-25, FLW-17 |

> The two `config/*` lists are static enough to fetch once and cache; they only need refreshing
> when the Settings screen is opened after a long gap.
>
> **Not used:** `service/settings` GET/PUT (Twitter/Facebook auto-share — feature dropped);
> `user/account` (registration is browser-based); `user/settings/push` (Blipfoto's own device-token
> registration — push is handled by the cloud service, which the app registers with separately,
> out of scope here).

---

## Rate limiting

The API enforces a **per-credential request rate limit**, and exceeding it returns error code 11
(see [error-codes.md](error-codes.md)) rather than an HTTP status. Practical consequences for the
app:

- **Budget the chatty surfaces.** Map panning (`entries/search` per viewport), the compose date
  picker (`journal/day` per date change — use `journal/month` instead), and inbox polling are the
  three places a naive implementation will burn the allowance.
- **Debounce and cancel.** Region and search fetches should cancel in-flight requests rather than
  racing them.
- **Cache what doesn't move.** `config/*` lists change rarely and are fetched once per session
  (see [rules.md](../rules.md) — this is a narrow, non-image exception to the app's caching rule).
  Awards and profile detail are *not* cached — per that same rule, all data is fetched fresh — but
  as single-object GETs, not chatty per-scroll lists like map panning or the compose date picker,
  the rate-limit exposure from that is minor and accepted rather than carved out as an exception.
- **Degrade, don't fail.** On code 11, back off and retry after a delay with a lightweight "please
  wait a moment" message — never retry immediately in a loop.
- The **cloud notification service polls on its own credential**, so its traffic is budgeted
  separately from the app's. Its polling interval is part of that service's design, not this one.

---

## Endpoints intentionally not used

| Resource | Why |
|---|---|
| `entry/photo` (POST/DELETE) | **Not available to this app.** Additional-photo endpoints are restricted to trusted first-party apps; an independently-registered app receives no access, and in practice additional photos are not returned to it at all. The app therefore neither displays nor manages them. |
| *(hi-res / original image URLs)* | Not an endpoint, but the same restriction: the entry response carries fields for higher-resolution and original images, and they are **null for this app**. Standard resolution is the ceiling — see [data-model.md](data-model.md) and [../rules.md](../rules.md). |
| `POST oauth/token` | The implicit grant returns the token in the redirect; there is no code exchange. |
| `user/account` (register) | Registration is browser-based. |
| `service/settings` (GET/PUT) | All Twitter/Facebook features dropped. |
| `user/settings/push` | Push device registration is with the cloud service, not Blipfoto. |
| `return_adverts` / advert items | Adverts dropped. |
| `entries/new` | Not surfaced; the Recent feed covers this need. |

> **On `entry/photo`:** this is a real capability of the Blipfoto platform that this app cannot
> offer. It is one of a small number of website features the app deliberately does not attempt —
> worth remembering when users ask why an entry looks different here than on the web.
