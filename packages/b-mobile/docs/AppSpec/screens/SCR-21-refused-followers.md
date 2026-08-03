# SCR-21 — Refused Followers   [Must]

**Purpose:** View the members who have been refused access to this journal, and restore access.
The outward-facing half of the app's two safety features: **they can't see you.**

**Reached from:** `SCR-25 Settings` → Refused followers, shown only when the journal is
**protected** (a public journal has nothing to refuse — see below).
**Leads to:** `SCR-18 User Profile` (tap a member). Account-gated.

> **This is not the same as hiding a member.** Refusing controls *their* access to *your* journal;
> hiding (`SCR-31`) controls what *you* see of *them*. Neither implies the other. See
> [rules.md](../rules.md) (Hiding members, and refusing followers).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Refused followers                 |
|  They can't see your journal. This   |   the paired effect / non-effect line
|  doesn't hide their entries from you.|
|                                      |
|  [av]  spammer1        [Allow]       |
|  [av]  troll2          [Allow]       |
|        also hidden                   |   shown when hidden too (SCR-31)
|             (load more on scroll)     |
+--------------------------------------+
```

## Components & data shown
- The paired explainer line: **they can't see your journal** / *this doesn't hide their entries
  from you.*
- A paged list of refused members (avatar + username), each with an action to **restore access**.
- Where a member is *also* hidden (`SCR-31`), note it quietly on the row — the two states are
  independent and a user needs to see which apply.

## States
- **Loading / Loaded / Empty** ("You haven't refused anyone") **/ Error** (per
  [rules.md](../rules.md)).
- **Journal is public** — the screen is not offered at all; the Settings row is hidden. Refusal
  only has meaning where access is controlled.

## Actions & rules
- **Allow / restore access** → immediate; no blocking confirmation — it is exactly as reversible as
  hiding (the member can simply be refused again if it was a mistake), so a lightweight toast
  acknowledging the action is enough, matching `SCR-31`'s Unhide. Optimistic removal from the list.
  This does **not** make them a follower again: they may send a fresh follow request, which arrives
  at `SCR-20`. It's a write, gated on read-write; a read-only account sees the upgrade prompt
  (`rules.md`, `FLW-09`) instead. The list itself and viewing a member's profile stay available
  read-only.
- Refusing is not initiated here. A member arrives on this list **one way only**: by having a
  follow request **refused** on `SCR-20` (`FLW-09`). Removing an existing follower (`SCR-19`) does
  *not* put anyone here — see [rules.md](../rules.md).
- **Tap a member** → `SCR-18`. Their entries remain fully visible to you; refusing them never
  changed that.
- On restoring access, note that their entries were always visible to you, and offer **Hide** if
  what the user actually wanted was to stop seeing them.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `users/requests/blocked` (GET) — the refused list.
- `users/requests/blocked` (DELETE) — restore access.

## Acceptance criteria
- [ ] The screen and its Settings row appear only for a protected journal.
- [ ] The list shows every refused member, with the paired effect/non-effect explainer visible.
- [ ] Only members whose follow request was refused appear here; removing a follower on `SCR-19`
      never adds a row.
- [ ] Restoring access removes the row and allows a fresh follow request later.
- [ ] A member who is also hidden is shown as both, not merged into one state.
- [ ] Tapping a member opens their profile with their content still visible.
- [ ] Given a signed-in, read-only account, Allow shows the upgrade prompt instead of acting; the
      list and profile navigation remain available.
