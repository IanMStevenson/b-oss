# SCR-02 — Browse   [Must]

**Purpose:** Top-level photo discovery: tabbed feeds of entry thumbnails the user browses and taps
into. The primary landing surface.

**Reached from:** primary navigation; app launch.
**Leads to:** `SCR-06 Entry Detail` (tap a thumbnail).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| = Blipfoto      (av) [search] [ + ] |  nav + quick actions
| Recent  Following  JustMe  Popular  Nearby |  tab strip (swipeable, scrolls)
+--------------------------------------+
|  +------+ +------+ +------+           |
|  | img  | | img  | | img  |           |  grid of thumbnails
|  +------+ +------+ +------+           |  (pull down to refresh)
|  +------+ +------+ +------+           |
|  | img  | | img  | | img  |           |
|  +------+ +------+ +------+           |
|  +------+ +------+ +------+           |
|  | img  | | img  | | img  |           |
|  +------+ +------+ +------+           |
|             (load more on scroll)     |
+--------------------------------------+
```

## Tabs
Tab set depends on sign-in state, and **changes live** when the user signs in/out:

| Tab | Shows | Auth |
|---|---|---|
| Recent | Newest entries across Blipfoto | anon-ok |
| Following | Entries from people the user follows | signed-in only |
| Just Me | The user's own journal | signed-in only |
| Popular | Popular entries | anon-ok |
| Nearby | Entries near the user's location | anon-ok (needs location permission) |

- **Logged out:** Recent, Popular, Nearby only.
- **Logged in:** all five.

## Components & data shown
- **Tab strip** (swipeable). The first tab (Recent) loads on open; other tabs **lazy-load** their
  first page when first viewed.
- **Grid of thumbnails** — each tile is an entry thumbnail; tapping opens the entry. (No adverts —
  that feature is dropped.)
- **Pull-to-refresh** — resets the active tab to its first page.
- **Infinite scroll** — loads the next page as the user nears the end (real pagination, no fixed
  page cap).
- Quick actions in the bar: open Search (`SCR-03`) and start a new entry (`FLW-12`).
- **Account indicator** (`(av)` in the wireframe) — the persistent avatar shown across primary
  navigation whenever two or more accounts are stored, opening the account switcher popover. Absent
  with zero or one account. Specified once in [rules.md](../rules.md) (Multi-account clarity) and
  inherited by every primary screen rather than respecified per screen.

## States (per tab, independently)
- **Loading** — first page in flight (grid skeleton / spinner).
- **Loaded** — thumbnails shown; more append on scroll.
- **Empty** — request succeeded but no entries (e.g. Following with no followees yet); show a
  helpful empty message (and, for Following/Just Me, a prompt to follow people / post).
- **Error** — request failed; show a message with retry.
- **Nearby — permission needed** — if location permission is not granted, show a prompt to enable
  it; if denied, explain the tab needs location.
- **Protected content** — an individual protected entry simply doesn't appear; no error.
- **Hidden member's entry** — appears as a hidden placeholder tile rather than being removed from
  the grid, per [rules.md](../rules.md); tapping it offers to unhide.

## Actions & rules
- **Tap thumbnail** → `SCR-06 Entry Detail` for that entry.
- **Switch tab** → show that tab's already-loaded results if fetched earlier this session, else
  lazy-load the first page (in-session state, not the caching rule in [rules.md](../rules.md) —
  a freshly (re-)entered tab always fetches fresh).
- **Pull-to-refresh** → reload page one of the active tab.
- **Scroll to end** → load the next page; stop when the API reports no more.
- **Sign in / out** → swap the tab set and reload the first tab (`FLW-01` / `FLW-02`).
- **Nearby** → request location at first use; re-query as appropriate. Respect runtime permission
  UX.
- Inherits global list rules from [rules.md](../rules.md) (paging, loading/empty/error states).

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md). All paged.
- Recent → `entries/recent`
- Following → `entries/following` (signed-in)
- Just Me → `entries/journal` (own)
- Popular → `entries/popular`
- Nearby → `entries/search` (radial / location-based)

## Acceptance criteria
- [ ] Given a logged-out user, only Recent, Popular, and Nearby tabs are shown; signing in adds
      Following and Just Me without leaving the screen.
- [ ] Given the Recent tab, it loads on open; other tabs load only when first viewed.
- [ ] Given the user pulls to refresh, the active tab reloads from the first page.
- [ ] Given the user scrolls to the end, the next page loads until the API reports no more.
- [ ] Given a tab returns no entries, an appropriate empty state is shown (not an error).
- [ ] Given the Nearby tab without location permission, the user is prompted; denial shows an
      explanatory state rather than an error loop.
- [ ] Given a tap on a thumbnail, the corresponding entry opens in `SCR-06`.
