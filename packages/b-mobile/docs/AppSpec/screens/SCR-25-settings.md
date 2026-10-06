# SCR-25 — Settings   [Must]

**Purpose:** A single settings hub with sections for account, journal, profile, notifications, and
local preferences. Every setting lives on this one screen rather than in separate sub-screens.

**Reached from:** primary navigation. Account-gated.
**Leads to:** section editors (in-screen or pushed), `SCR-11 Description Editor` (biography),
`SCR-31 Hidden Members`, `SCR-21 Refused Followers`, `SCR-30 Accounts`. Drives `FLW-17`.

> There is no **Sharing** section — the app has no Twitter/Facebook integration — and no
> **Membership** purchase: membership status is read elsewhere to gate features, but buying and
> managing it happens on Blipfoto web.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Settings                     (av) |
|  Accounts                       >    |  which account, mode, add/switch
|  General                        >    |
|  Journal                        >    |
|  Profile                        >    |
|  Notifications                  >    |
|  Reminders                      >    |
|  Misc                           >    |
|  Hidden members                 >    |  always shown
|  Refused followers              >    |  (only if journal is protected)
+--------------------------------------+
```

- **Accounts** row opens `SCR-30`: list of signed-in accounts, sign-in mode, switch/add/remove.
  See [api-appendix/auth.md](../api-appendix/auth.md).

Notifications sub-screen (redesigned in [b-oss#244](https://github.com/IanMStevenson/b-oss/issues/244) — no master switch, no Push group):
```
+--------------------------------------+
| <  Notifications                     |
|  NOTIFICATIONS FROM THIS APP         |   per active account, b-push
|  Pushes to this phone for alice...   |
|  Push for new comments         [on]  |
|  Push for new notifications    [on]  |
|   Your Blipfoto feed has stars...    |   hint: only when some feed_* off
|  Check for new activity every  [5]min|   floor 5 minutes
|                                      |
|  BLIPFOTO FEED SETTINGS              |   Blipfoto, Save/Cancel
|  What appears in your activity on... |
|  Activity from people you follow [on]|
|  Favourites                    [on]  |
|  Stars                         [on]  |
|  ...                                 |
+--------------------------------------+
```

## Sections

| Section | Fields | Persistence |
|---|---|---|
| **General** | Real name; country; locale; find-me-by-name toggle | Server (`user/settings`); country and locale pickers populated from `config/countries` / `config/locales` |
| **Journal** | Journal title; **privacy** (protected account) toggle; allow-comments toggle | Server (`user/settings`) |
| **Profile › Username** | Username | Server (`user/settings`) |
| **Profile › Biography** | Biography (BBCode via `SCR-11`) | Server (`user/settings`) |
| **Profile › Picture** | Avatar: take / choose / delete | Server (`user/settings`, avatar) |
| **Notifications** | *Notifications from this app*: Push for new comments, Push for new notifications, check interval; *Blipfoto feed settings*: the six `feed_*` toggles | Push toggles/interval — notification service, per account per device (local copy on the account record); feed toggles — server (`user/settings/notifications`) |
| **Reminders** | Daily reminder on/off + time | Local, **per account**; read-write accounts only (drives `FLW-18`) |
| **Misc** | Upload full-size toggle; **confirm account before Star/Favourite/comment** toggle (default **off**; shown only with 2+ accounts stored) | Local, **per device** — these describe how this installation behaves, not an account |

- **Hidden members** → `SCR-31`. Always shown, whatever the journal's privacy setting. Subtitle:
  *"People whose content you won't see."*
- **Refused followers** → `SCR-21`. Shown only for a **protected** journal, since a public journal
  has no access to refuse. Subtitle: *"People who can't see your journal."*
- The two rows sit together and are **never merged**. They are opposite-facing features and the
  subtitles are what distinguish them — see [rules.md](../rules.md) (Hiding members, and refusing
  followers).
- **The privacy policy and the blipfoto.com link-handling toggle are deliberately *not* here.**
  They live on `SCR-29 Help & Info`, which is not account-gated. Both are device-level rather than
  account-level, and the privacy policy in particular must be reachable by someone who has never
  signed in — this screen is unreachable in that state. Don't duplicate them here; one home each.
- **Confirm account before Star/Favourite/comment** — off by default; only offered when **two or
  more accounts** are stored (hidden with fewer, since it would have no effect). When on, those
  three actions ask which stored account to act as, before the read-write check, rather than
  silently using whichever account happens to be active — see [rules.md](../rules.md)
  (Multi-account clarity), `FLW-06`, `FLW-07`.
- **Notifications** ([b-oss#244](https://github.com/IanMStevenson/b-oss/issues/244)) acts on
  the **active account** and has two clearly separate parts:
  - **Notifications from this app** — two toggles, **Push for new comments** and **Push for new
    notifications**, both on by default. There is **no master switch**: notifications are "on" when
    at least one toggle is on. Turning the first one on from off runs the enable path (`FLW-22`:
    permission, the read-only authorization for a read-write account, registration) with just that
    stream. Changing a toggle while the other stays on updates the registration (`PATCH`). Turning
    the **last** one off deregisters; on a read-write account it first confirms (*"Turn off
    notifications?" — "Turning this off stops all notifications for {username}. To turn them back
    on later you'll need to sign in to Blipfoto again."* [Turn off] [Keep on]), because the
    separate notification token is revoked. A read-only account reuses its app token, so it gets no
    warning. These are token actions, not content writes, so they work in either sign-in mode and
    apply immediately (no Save). When the service has reported the token dead, a note says
    notifications for that account need a sign-in, and turning a toggle on signs in again.
    On a read-write account, turning the first toggle on first shows `SCR-01`'s **"One more
    sign-in"** explainer [Cancel] [Continue]; Cancel leaves the toggle off. That sign-in uses the
    clean in-app browser when more than one account is on the device, and its token's owner is
    checked: if it's another account, the token is revoked, nothing changes, and an alert names
    the account it was actually for, with **Try again in the app** on native
    ([b-oss#240](https://github.com/IanMStevenson/b-oss/issues/240)).
  - **Feed hint** — Blipfoto never creates (or counts) a notification whose `feed_*` type is off,
    so the app can't push about it. While *Push for new notifications* is on and some saved feed
    types are off, a quiet note under it names them (*"Your Blipfoto feed has stars and follower
    milestones turned off, so you won't be notified about those."*); with all six off it says the
    app will never have any notifications to tell you about. It reflects the **saved** feed
    settings, not unsaved edits. Comments are never gated by the feed, so there's no hint for them.
  - **Check interval** — floor of 5 minutes, also enforced by the service.
  - **Blipfoto feed settings** — the six `feed_*` toggles, Save/Cancel, captioned *"What appears in
    your activity on blipfoto.com and in every app. A type turned off here is never created, so
    this app can't notify you about it either."* Blipfoto's own **Push** settings are not shown and
    never written by this app; the service no longer reads them.
  See [`../../ImplementationSpec/notification-service.md`](../../ImplementationSpec/notification-service.md).

## States
- **Loading** — fetching current values for a server-backed section.
- **Editing / Saving** — standard form; Save commits, Cancel discards.
- **Saved** — on success, return to the hub; refresh any locally cached account state (e.g. privacy,
  membership) that other screens depend on.
- **Error** — save failed; show a message and keep edits.
- **Discard guard** — unsaved edits prompt a discard confirmation.

## Actions & rules
- Each server-backed section: **load current values → edit → Save (commit) / Cancel**.
- **Privacy toggle** is significant — turning it on enables follow-request approval (`SCR-20`) and
  reveals the Refused followers entry (`SCR-21`); changing it should refresh dependent UI. It is
  also the control the app points users at when hiding someone isn't enough to stop that member
  seeing their journal (`FLW-10`).
- **Avatar**: take/choose (with crop) uploads; delete removes the avatar (with confirmation).
  **Take** requests the camera permission at the point it's tapped, and handles refusal the same way
  `SCR-09` does — explain, leave "choose" working, and route to system settings rather than
  re-requesting if the OS will no longer prompt.
- **Reminders / Misc** persist locally with no network call; saving Reminders (re)schedules the
  daily reminder (`FLW-18`).
- **Local settings split two ways, and the distinction is visible to the user**: **Reminders** are
  **per account** (each read-write account has its own on/off and time, and switching accounts
  shows that account's), while **Misc** is **per device** (one setting for the installation,
  unaffected by which account is active). Hidden members (`SCR-31`) are per account, like
  Reminders.
- **The Reminders section is hidden entirely for a read-only account** — it cannot publish, so a
  publish reminder has nothing to lead to. This is a hide, not a view-only: unlike the server-backed
  sections, there is no value worth showing. See `FLW-18`.
- **Read-only accounts** see every server-backed section (General, Journal, Profile, and the
  Notifications **feed toggles**) as **view-only** — no Save affordance — since all of
  them write to the account; see [rules.md](../rules.md). Reminders/Misc (local-only), Accounts,
  **Hidden members** (device-local, not a server write), and the Notifications **push toggles**
  (token actions, not content writes — read-only + notifications is a valid sign-in mode) remain
  fully usable regardless of mode. Refused followers involves server writes and follows the same
  view-only rule.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `user/settings` (GET/PUT) — general, journal, username, biography, avatar (upload/delete).
- `user/settings/notifications` (GET/PUT) — **feed** preferences only; `push_*` keys are never
  read or written.
- The push toggles and the check interval call the **notification service**, not Blipfoto —
  `FLW-22` (first on / last off) and `PATCH /v1/registrations/:id` (`pushComments`,
  `pushNotifications`, interval) in
  [`../../ImplementationSpec/notification-service.md`](../../ImplementationSpec/notification-service.md).
- `config/countries`, `config/locales` (GET) — options for the country and locale pickers; safe to
  fetch once and cache.
- (Reminders, Misc — local only.)

## Acceptance criteria
- [ ] Given each server-backed section, current values load, edits save, and Cancel discards.
- [ ] Given the privacy toggle is enabled, the Refused followers row and pending-request approval
      become available.
- [ ] The Hidden members row is present regardless of privacy setting, and the two rows carry
      subtitles distinguishing who each one affects.
- [ ] Given the avatar section, the user can take/choose (with crop) or delete the avatar.
- [ ] Given Notifications, the two push toggles show the active account's streams; first-on
      enables, a change while the other is on PATCHes, last-off deregisters (with the sign-in
      warning on a read-write account only); they remain usable on a read-only account.
- [ ] Feed toggles save only `feed_*` keys; there is no Push group.
- [ ] The feed hint lists saved feed types that are off (or says none can arrive when all six are
      off), only while Push for new notifications is on.
- [ ] The check-interval control never allows a value below the service's 5-minute floor.
- [ ] Given Reminders/Misc, changes persist locally with no network call; saving Reminders
      (re)schedules the daily reminder.
- [ ] Reminders are per account and switching accounts shows that account's setting; Misc settings
      are unchanged by switching accounts.
- [ ] The Reminders section is not shown at all for a read-only account.
- [ ] Neither the privacy policy nor the blipfoto.com link-handling toggle appears on this screen;
      both live on `SCR-29`.
- [ ] The confirm-account toggle is hidden with fewer than two accounts stored, defaults to off,
      and when on, Star/Favourite/comment show the account-confirm dialog before acting.
- [ ] There is no Sharing section and no membership-purchase option.
- [ ] Given a read-only account, every server-backed section shows current values with no Save
      affordance, except the Notifications push toggles; Accounts, Reminders, Misc, and the
      push toggles remain fully usable.
