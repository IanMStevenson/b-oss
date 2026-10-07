# SCR-30 — Accounts   [Must]

**Purpose:** List every signed-in Blipfoto account, show each one's sign-in mode at a glance,
switch which is active, add another account, and manage (change mode / remove) an individual
account.

**Reached from:** `SCR-25` Settings ("Accounts" row); the **Manage accounts** row of the account
switcher popover (below); tapping the notification service's `reauth-required` system push
(`FLW-16`).
**Leads to:** `SCR-01` in its deliberate shape for **Add account** (`FLW-20`); an inline
account-detail state for mode-change/remove (`FLW-22`); switching (`FLW-21`) returns to wherever
the user was, now viewing the newly active account.

> See [auth.md](../api-appendix/auth.md) for the sign-in modes and per-account token lifecycle
> this screen exposes.

> This is the **full** account-management screen. A lighter-weight **account switcher popover**,
> reachable from a persistent avatar in the nav chrome whenever two or more accounts are stored,
> covers just "switch" (`FLW-21`) plus a **Manage accounts** link back to this screen for
> anything else — see [rules.md](../rules.md) (Multi-account clarity).

## Layout (ASCII wireframe)

List state:
```
+--------------------------------------+
| <  Accounts                          |
|                                      |
|  (*) alice             Read-write >  |   active account, marked
|      Notifications: on               |   tap status → that account's
|                                      |   Settings › Notifications (#244)
|  ( ) bobs_family        Read-only >  |   inactive — tap row to switch
|      Notifications: off              |
|                                      |
|  ( ) carol             Read-write >  |   notification read token died
|      Notifications: needs sign-in    |   (FLW-02), red + bold — rest of
|      [ Sign in again ]               |   the account is unaffected
|                                      |
|  ( ) dave                            |   app token died (needs-reauth)
|      Needs sign-in                   |   red + bold (b-oss#263)
|      [ Sign in again ]  Remove       |
|                                      |
|  + Add account                       |
+--------------------------------------+
```

Account-detail state (tap the active account's row):
```
+--------------------------------------+
| <  alice                             |   the app's green header bar
|                                      |
|  Mode            Read-write          |
|  Notifications   Notifications: on   |   status only — change in SCR-25
|                                      |
|  [ Switch to read-only ]             |   the other mode only (FLW-22)
|  [ Remove account ]                  |
+--------------------------------------+
```
No **Make active** (b-oss#263): only the active account opens the detail view — any other usable
account is switched to by tapping its row, and one needing a sign-in gets the sign-in dialog.

Signing in again (b-oss#263, `FLW-02`):
```
+--------------------------------------+
|  dave needs to sign in again         |   tapping the row or red status,
|  Blipfoto no longer accepts this     |   picking it in the header
|  account's sign-in.                  |   switcher, or tapping the
|              [ Cancel ] [ Sign in ]  |   reauth-required push
+--------------------------------------+
   ↓ Sign in (the row's own Sign in again skips the dialog)
   app sign-in, same mode as before (no mode question)
   ↓ only if it had notifications on, read-write
+--------------------------------------+
|  One more sign-in                    |
|  To turn notifications back on for   |
|  dave, Blipfoto needs you to approve |
|  one more sign-in.                   |
|            [ Not now ] [ Continue ]  |
+--------------------------------------+
   ↓
   back on Accounts, dave active, toast "dave is signed in again"
```

## Components & data shown
- **Account rows** — avatar, username, current mode label (Read-write / Read-only / Needs
  re-auth), a marker for the active account, and a notification **status text** — *Notifications:
  on / off / needs sign-in* ([b-oss#244](https://github.com/IanMStevenson/b-oss/issues/244)).
  There is no notifications on/off button here; tapping the status switches to that account and
  opens its `SCR-25` Notifications settings, where the per-stream push toggles live. An account
  whose notification read token died (the `reauth-required` push opens this screen) also shows
  **Sign in again**, which re-runs the `FLW-22` enable path with the push streams it had. Sign in
  again and the detail view's mode changes are owner-checked (`FLW-22` step 7,
  [b-oss#240](https://github.com/IanMStevenson/b-oss/issues/240)): a sign-in that comes back as
  another account changes nothing and shows the wrong-account alert, with **Try again in the app**
  on native.
- **Add account** — opens `SCR-01`'s deliberate (mode-choice) shape via `FLW-20`.
- **Needs sign-in** (b-oss#263) — an account whose app token died shows **Needs sign-in**, and one
  whose notification read token died shows **Notifications: needs sign-in**, both **red and bold**,
  each with **Sign in again** on the row (a needs-reauth row also has a quiet **Remove**, so an
  account that can't be signed in again can still be removed). The header account switcher shows
  needs-reauth accounts the same red way.
- **Account detail** — mode, notification status (text only), a button for the other mode,
  **Remove account**. Uses the app header with a back arrow.
- **Sign-in dialog** — "{username} needs to sign in again — Blipfoto no longer accepts this
  account's sign-in." [Cancel] [Sign in]. One dialog for every way in: tapping the row or its red
  status, picking the account in the header switcher, or tapping the `reauth-required` push (those
  two open this screen as `/accounts?reauth=<id>`). **Sign in** runs `FLW-02`'s re-sign-in: the app
  sign-in in the mode the account had (remembered across the forced logout), then — if it had
  notifications on — the "One more sign-in" explainer [Not now] [Continue] and the notifications
  sign-in. Not now leaves it signed in with the red notifications status. On success the account is
  active, the user stays here, and a toast reads "{username} is signed in again".

## States
- **Loading** — reading the locally-stored account list (no network call needed for this screen
  itself).
- **Loaded** — the list above.
- **Empty (transient only)** — this screen is only reachable from account-gated Settings, so it
  can't normally be empty; the one case it can become empty is removing the *last* account while
  viewing it — per [rules.md](../rules.md), account-gated screens close/revert on losing the
  active account, so this immediately exits to anonymous browsing rather than showing an empty
  list.
- **Error** — local account/token state failed to load; retry.

## Actions & rules
- **Switch account** (tap an inactive row) → `FLW-21`; instant, no network call.
- **Add account** → `SCR-01` deliberate shape → `FLW-20`; the new account becomes active on
  success.
- **Change mode** (from account detail) → `FLW-22`; may trigger zero, one, or two new
  authorization steps depending on the transition (see the token lifecycle table in
  [auth.md](../api-appendix/auth.md)). The detail screen must state what's about to happen (e.g.
  "This will sign you out of write access" or "You'll need to sign in again") **before** the user
  confirms a change that revokes a token — never revoke silently.
- **Remove account** → confirm → `FLW-22`; revokes whichever tokens that account holds. If it was
  active, another stored account becomes active, or the app returns to anonymous browsing if
  none remain.
- **Needs re-auth** accounts (forced-logout state, `FLW-02`) show a clear call to action — the
  sign-in dialog above — which re-authorizes the missing token(s) without asking for the mode
  again and without disturbing any other still-valid token the account holds.
- **The "Notifications" reason label applies only where the account actually holds two tokens** —
  i.e. read-write + notifications, where the service's read token is separate from the app's own.
  There, losing it affects push and nothing else, and the row must say so rather than reading as a
  whole-account failure. **In read-only + notifications the app and the service share one token**
  (see [auth.md](../api-appendix/auth.md)), so losing it is an ordinary whole-account needs-reauth
  and must be shown as one — never as a notifications-only problem, which would imply the rest of
  the account still works when it doesn't.
- Exactly one account is ever marked active.

## API touchpoints
- No dedicated read endpoint — this screen reflects locally-stored account/token state. Mode
  changes and additions run an **OAuth authorization round** via `FLW-20`/`FLW-22` (implicit
  grant, token returned in the redirect — there is no `POST oauth/token`); revocation and removal
  call `DELETE oauth/token` against the specific token being given up. See
  [auth.md](../api-appendix/auth.md) and [endpoints.md](../api-appendix/endpoints.md).

## Acceptance criteria
- [ ] Every stored account is listed with its current mode and active/needs-reauth status.
- [ ] Tapping an inactive account switches it to active instantly, with no network call.
- [ ] Add account reaches the full mode-choice sign-in; the result becomes active on success.
- [ ] Changing an account's mode states what will happen (revocation / new authorization) before
      it's confirmed.
- [ ] Removing the active account leaves another stored account active, or returns to anonymous
      browsing if none remain.
- [ ] A needs-reauth account can be re-authorized without disturbing its other still-valid token.
- [ ] Each account shows a notification status (on / off / needs sign-in) and no on/off button;
      tapping the status switches to that account and opens Settings › Notifications.
- [ ] An account whose notification read token died offers **Sign in again**.
- [ ] Needs-sign-in statuses are red and bold, on Accounts and in the header switcher; every entry
      point shows the same "{username} needs to sign in again" dialog; signing in reuses the old
      mode, follows on with notifications if they were on, and ends on Accounts with the account
      active and a "{username} is signed in again" toast (b-oss#263).
- [ ] The detail view has the app header and back arrow; Back never re-opens a dialog.
- [ ] For a read-write + notifications account, losing only the service's read token shows a
      notifications-specific reason label and doesn't imply the account lost write access.
- [ ] For a read-only + notifications account, losing its single token shows an ordinary
      whole-account needs-reauth, not a notifications-only label.
