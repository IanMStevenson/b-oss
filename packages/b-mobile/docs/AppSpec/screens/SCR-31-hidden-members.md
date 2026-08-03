# SCR-31 — Hidden Members   [Must]

**Purpose:** View the members whose content has been hidden from this account, and unhide them.
The inward-facing half of the app's two safety features: **you don't see them.**

**Reached from:** `SCR-25 Settings` → Hidden members. Always available, whatever the journal's
privacy setting.
**Leads to:** `SCR-18 User Profile` (tap a member, shown in its hidden state). Account-gated.

> **This is not the same as refusing a follower.** Hiding controls what *you* see of *them*;
> refusing (`SCR-21`) controls *their* access to *your* journal. Neither implies the other. See
> [rules.md](../rules.md) (Hiding members, and refusing followers) for the full suppression rule.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Hidden members                    |
|  You won't see their entries,        |   the paired effect / non-effect line
|  comments or notifications. This     |
|  doesn't stop them seeing your       |
|  journal or commenting on it.        |
|                                      |
|  ⚠ Your journal is public, so hidden |   only when journal is public
|    members can still see your entries|
|                                      |
|  [av]  loudmouth1      [Unhide]      |
|  [av]  bore2           [Unhide]      |
|        also refused                  |   shown when refused too (SCR-21)
+--------------------------------------+
```

## Components & data shown
- The paired explainer line: **you won't see their entries, comments or notifications** / *this
  doesn't stop them seeing your journal or commenting on your entries.*
- **A standing reminder when the journal is public**, as above. This is the fact most likely to
  surprise someone, so it is shown here permanently rather than only at the moment of hiding.
- A list of hidden members (avatar + username), each with **Unhide**.
- Where a member is *also* refused (`SCR-21`), note it quietly on the row.
- A note that hiding is held **on this device for this account** and does not transfer elsewhere.

## States
- **Loaded / Empty** ("You haven't hidden anyone"). There is no loading or error state worth
  designing: the list is local, so it is always immediately available.

## Actions & rules
- **Unhide** → immediate; that member's content reappears everywhere. No confirmation needed —
  it is not a destructive act and is trivially reversible.
- Hiding is not initiated here; it happens wherever the member appears (`SCR-18`, `SCR-06`,
  `SCR-24` — see `FLW-10`).
- **Tap a member** → `SCR-18` in its hidden state, offering Unhide.
- The list is **per account**: switching the active account shows that account's hidden members.
- Where the journal is protected and a hidden member currently follows it, offer **Remove them as
  a follower** (`SCR-19`) as a separate action — the user may have wanted both. Never label this
  action "Refuse" — there is no pending request to refuse (see [rules.md](../rules.md), Hiding
  members, and refusing followers).

## API touchpoints
None. The hidden list is entirely device-local; hiding changes nothing server-side and the hidden
member is never told.

## Acceptance criteria
- [ ] The screen is reachable regardless of the journal's privacy setting.
- [ ] The paired effect/non-effect explainer is shown, and the public-journal reminder appears
      whenever the journal is public.
- [ ] Unhide restores that member's content everywhere in the app, immediately.
- [ ] A member who is also refused is shown as both, not merged into one state.
- [ ] Switching the active account switches the list shown.
- [ ] The screen makes no network request.
