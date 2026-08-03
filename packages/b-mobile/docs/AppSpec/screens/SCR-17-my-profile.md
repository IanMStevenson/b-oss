# SCR-17 — My Profile   [Must]

**Purpose:** The signed-in user's own profile, with tabs for their identity, entries, favourites,
social graph, and awards.

**Reached from:** primary navigation. Account-gated.
**Leads to:** `SCR-06 Entry Detail`, `SCR-18 User Profile`, `SCR-19 Followers/Following`,
`SCR-20 Pending Requests`, `SCR-22 Awards`.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  My profile                   (av) |
|  [avatar]  username  ★member         |  header: avatar, name, badges
|  Journal title · 1,204 entries       |
|  Bio text (rendered)…                |
| About | Entries | Faves | Followers… |  tabs
+--------------------------------------+
|  (tab content)                       |
+--------------------------------------+
```

## Components & data shown
- **Header:** avatar, username, journal title, member badge / award icons, biography (rendered),
  entry count.
- **Tabs:**
  - **About** — the profile detail above.
  - **Entries** — the user's journal (grid → `SCR-06`).
  - **Favourites** — entries the user favourited (grid → `SCR-06`).
  - **Followers** — list (→ `SCR-19`); also the path to **Pending Requests** (`SCR-20`) when the
    account is protected.
  - **Following** — list (→ `SCR-19`).
  - **Awards** — earned badges (→ `SCR-22`).

## States
- **Loading / Loaded / Empty / Error** per tab (per [rules.md](../rules.md)). Empty examples: no
  entries yet (prompt to post); no followers yet.
- **Protected account** — surfaces the Pending Requests entry point.
- **Deep link to Awards** — a push/notification may open directly on the Awards tab.

## Actions & rules
- **Switch tab** → lazy-load that tab's data on first view.
- Favourites may include entries by members since hidden; those show as hidden placeholders
  ([rules.md](../rules.md)). Nothing on one's own profile can be hidden — you can't hide
  yourself.
- **Tap entry** → `SCR-06`; **tap a user** (in lists) → `SCR-18`; **followers → pending** →
  `SCR-20`; **awards** → `SCR-22`.
- Editing identity (avatar, bio, username, journal, etc.) is done in `SCR-25 Settings`.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `user/profile` (own — details/entries/badges/friendship).
- `entries/journal` (own entries), `entries/favorites` (own favourites).
- `users/followers`, `users/following`, `users/requests/pending`, `user/awards`.

## Acceptance criteria
- [ ] Given a signed-in user, the header shows avatar, username, journal title, bio, badges, and
      entry count.
- [ ] Given each tab, its data lazy-loads and renders (entries/favourites as grids; followers/
      following as lists; awards as badges).
- [ ] Given a protected account, the pending-requests entry point is available from Followers.
- [ ] Given an empty tab (e.g. no entries), a helpful empty state is shown.
- [ ] Given a deep link to awards, the Awards tab opens directly.
