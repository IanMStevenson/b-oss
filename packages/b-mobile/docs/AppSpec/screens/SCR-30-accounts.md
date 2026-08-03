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
|      Notifications on                |
|                                      |
|  ( ) bobs_family        Read-only >  |   inactive — tap row to switch
|                                      |
|  ( ) old_account    Needs re-auth >  |   a token went invalid (FLW-02)
|      Notifications need re-auth     |   read-token-only case: rest of the
|                                      |   account is unaffected, see below
|                                      |
|  + Add account                       |
+--------------------------------------+
```

Account-detail state (tap the `>` on a row):
```
+--------------------------------------+
| <  alice                             |
|                                      |
|  Mode            Read-write     >    |   tap to change (FLW-22)
|  Notifications   On             >    |   tap to change (FLW-22)
|                                      |
|  [ Make active ]                     |   hidden if already active
|  [ Remove account ]                  |
+--------------------------------------+
```

## Components & data shown
- **Account rows** — avatar, username, current mode label (Read-write / Read-only / Needs
  re-auth), a notifications indicator, and a marker for the active account.
- **Add account** — opens `SCR-01`'s deliberate (mode-choice) shape via `FLW-20`.
- **Account detail** — mode, notifications state, **Make active** (if not already active),
  **Remove account**.

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
- **Needs re-auth** accounts (forced-logout state, `FLW-02`) show a clear call to action — tapping
  re-authorizes only the missing token, without disturbing any other still-valid token the
  account holds.
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
- [ ] For a read-write + notifications account, losing only the service's read token shows a
      notifications-specific reason label and doesn't imply the account lost write access.
- [ ] For a read-only + notifications account, losing its single token shows an ordinary
      whole-account needs-reauth, not a notifications-only label.
