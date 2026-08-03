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

Notifications sub-screen:
```
+--------------------------------------+
| <  Notifications                     |
|  Push notifications          [ On ]  |   master switch — FLW-22
|                                      |
|  Feed                                |
|   Friends activity              [ ]  |
|   Favourite received            [ ]  |
|   ...                                |
|                                      |
|  Push                                |   hidden entirely when switch is Off
|   Comment received              [ ]  |
|   Friends activity              [ ]  |
|   ...                                |
|                                      |
|  Advanced                       v    |   collapsed by default
|   Check for new activity every: 5m   |   slider/stepper, floor 5 minutes
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
| **Notifications** | Master switch; Feed toggles + Push toggles (per event); Advanced: polling interval | Master switch/interval — notification service; toggles — server (`user/settings/notifications`) |
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
- **Notifications**: an active **master switch** shows and controls the account's current
  notifications on/off state — tapping it runs the same on/off logic as `SCR-30`'s Notifications
  row, via `FLW-22`, including any confirmation or re-authorization that requires. Unlike the rest
  of this section, **the master switch is available regardless of sign-in mode** — it's a token
  action, not a content write, so a read-only account can still use it (see Actions & rules,
  below). The **push toggle group is only rendered when the switch is on** — not shown-disabled,
  not present at all — since there's nothing to push through when it's off. The **feed toggle
  group is unaffected** by the switch; it governs the in-app/web activity feed, independent of the
  notification service. An **Advanced** disclosure, collapsed by default, holds the polling
  interval control — a floor of 5 minutes is enforced by the service regardless of what this
  control allows the user to select. See
  [`../../ImplementationSpec/notification-service.md`](../../ImplementationSpec/notification-service.md).

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
  Notifications feed/push **toggle groups**) as **view-only** — no Save affordance — since all of
  them write to the account; see [rules.md](../rules.md). Reminders/Misc (local-only), Accounts,
  **Hidden members** (device-local, not a server write), and the Notifications **master switch**
  (a token action, not a content write — read-only + notifications is a valid sign-in mode) remain
  fully usable regardless of mode. Refused followers involves server writes and follows the same
  view-only rule.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `user/settings` (GET/PUT) — general, journal, username, biography, avatar (upload/delete).
- `user/settings/notifications` (GET/PUT) — feed + push preferences.
- Master switch and Advanced polling interval call the **notification service**, not Blipfoto —
  `FLW-22` (on/off) and `PATCH /v1/registrations/:id` (interval) in
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
- [ ] Given Notifications, feed and push toggles save; the push toggle group isn't rendered at all
      when the master switch is off.
- [ ] The master switch reflects and controls the account's actual notifications on/off state via
      `FLW-22`, and remains usable on a read-only account.
- [ ] The Advanced polling-interval control is collapsed by default and never allows a value below
      the service's 5-minute floor.
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
      affordance, except the Notifications master switch; Accounts, Reminders, Misc, and the
      master switch remain fully usable.
