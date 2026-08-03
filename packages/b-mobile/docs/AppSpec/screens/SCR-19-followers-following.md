# SCR-19 — Followers / Following   [Must]

**Purpose:** A paged list of users — either a member's followers or the people they follow.

**Reached from:** the Followers / Following tabs of `SCR-17 My Profile` and `SCR-18 User Profile`.
**Leads to:** `SCR-18 User Profile` (tap a user).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Followers                         |  (or "Following")
|  [av]  alice                  >      |
|  [av]  bob                    >      |
|  [av]  carol                  >      |
|             (load more on scroll)     |
+--------------------------------------+
```

## Components & data shown
- A list of users (avatar + username), paged. A **hidden** member is still listed, marked as
  hidden — removing them here would make them impossible to find in order to unhide.
- For the signed-in user's own Followers, a **Remove follower** affordance — available whatever the
  journal's privacy setting, with different consequences:
  - **Protected journal** — they lose access to the journal. They are **not** refused and do
    **not** appear on `SCR-21 Refused Followers`; they may send a fresh follow request, which
    arrives at `SCR-20`, where it can be approved or refused.
  - **Public journal** — it only ends the follow relationship; public entries stay visible to
    everyone, and they can follow again at any time.

## States
- **Loading / Loaded / Empty** ("No followers yet" / "Not following anyone yet") **/ Error** (per
  [rules.md](../rules.md)).

## Actions & rules
- **Tap a user** → `SCR-18`.
- **Scroll to end** → load the next page until exhausted.
- **Remove follower** (own followers only, **and read-write**) → confirm, then optimistic removal;
  roll back on error. A read-only account sees the upgrade prompt (`rules.md`, `FLW-09`) instead;
  the list itself and viewing a profile stay available read-only. The confirmation states what it
  does and doesn't do:
  - on a **public** journal, that it does **not** stop them seeing the journal;
  - on a **protected** journal, that they lose access **but may ask to follow again**, and that a
    new request can be refused at that point (`SCR-20`) — it must not imply a permanent block.
- **This is not "Refuse."** Nothing on this screen produces a refused member. Refusing acts only on
  a pending follow request (`SCR-20`) — see [rules.md](../rules.md).

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `users/followers` or `users/following` (paged).
- `users/followers` (DELETE) for remove-follower.

## Acceptance criteria
- [ ] Given a followers/following list, users render and page on scroll.
- [ ] Given an empty list, an appropriate empty state is shown.
- [ ] Given a tap on a user, their profile opens (`SCR-18`).
- [ ] Given the owner removes a follower, the row is removed optimistically and rolls back on
      error.
- [ ] Removing a follower never adds them to `SCR-21 Refused Followers`, on either a public or a
      protected journal.
- [ ] On a protected journal, the remove-follower confirmation says they may ask to follow again;
      it never claims a permanent block.
- [ ] Given a read-only owner, Remove follower shows the upgrade prompt instead of acting; the
      list and profile navigation remain available.
