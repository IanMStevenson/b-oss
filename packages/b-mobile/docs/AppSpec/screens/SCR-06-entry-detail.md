# SCR-06 — Entry Detail [Must]

**Purpose:** The content hub — view a single entry in full: photo, title, stats, description,
tags, and the comment thread; react, comment, follow the author, and (if owner) manage it. Supports
moving to the previous/next entry within the same journal.

> Entries are treated as **single-photo**. Blipfoto supports additional photos on the website, but
> that capability is not available to this app — see
> [api-appendix/endpoints.md](../api-appendix/endpoints.md).

**Reached from:** `SCR-02 Browse`, `SCR-03 Search`, `SCR-05 Tag Entries`, `SCR-04 Map`,
`SCR-23 Notifications`, `SCR-24 Comments`, `SCR-17/18 Profile`, deep links, and push targets.
**Leads to:** `SCR-07 Full-screen Photo`, `SCR-08 Entry Metadata`, `SCR-05 Tag Entries`,
`SCR-18 User Profile`, `SCR-15 New Comment`, `SCR-16 Report Entry`, `SCR-13 Edit Entry`,
`SCR-04 Map`, and the OS share sheet.

## Layout (ASCII wireframe)

```
+--------------------------------------+
| <   Mon 14 Jun 2026    [⋮]    >  ←→  |  date header, prev/next, overflow menu
|                                      |
|        [        photo        ]       |  photo (tap = prev/next entry)
|                                      |
|  Title of the entry                  |
|  👁 1,204   ★ 42   ♥ 7   [⛶]         |  views / stars / favourites / fullscreen
|                                      |
|  Rich description text rendered      |  BBCode -> formatted
|  from BBCode, with links…            |
|                                      |
|  #sunrise  #edinburgh  #leica        |  tag chips
|  -------------------------------     |
|  42 comments                         |
|  [av] alice:  lovely light!   ↩      |  comment (+ reply affordance)
|       └ [av] bob:  agreed       ↩    |  reply (one level)
|  ...                                  |
+--------------------------------------+
|  [ Comment ]  [ ★ Star ]  [ ♥ Fav ]  [ +Follow ] |  action bar
+--------------------------------------+
```

## Components & data shown

- **Date header** with previous/next affordance (swipe and arrows) to adjacent entries in the
  journal.
- **Overflow menu** (`⋮`) — context actions, shown per the entry's action flags: Author profile,
  Map (if geotagged), Report, **Hide this member** (`FLW-10`, unless it's the active account's own
  entry), and owner-only Edit details / Replace photo / Delete; Metadata (if present); Share.
- **Photo** — tapping the left/right half loads the previous/next entry (same as the header's
  arrows), matching the live Blipfoto site; it does not open the full-screen view.
- **Fullscreen button** — a dedicated control next to the star/heart reaction counts, not a photo
  tap → `SCR-07`.
- **Title**; **counts**: views, stars, favourites (correct singular/plural).
- **Rich description** — BBCode rendered to formatted text with working links.
- **Tag chips** — tap → `SCR-05 Tag Entries` for that tag.
- **Comment thread** — comment count, then comments each with avatar, username, badge icons,
  rendered content, and a **reply** affordance when permitted; replies nested one level. A comment
  the viewer may delete carries a **delete** affordance, and every comment by another member
  offers **Report** and **Hide this member**. Comments by hidden members are not rendered at all
  (see [rules.md](../rules.md)).

  **Who may edit a comment:** its author, and nobody else. An editable comment carries an **Edit**
  affordance opening `SCR-15` seeded with its current text.

  **Who may delete a comment:** its author, anywhere; and **the journal owner, for any comment on
  their own entry** — clearing unwanted comments from one's own journal is a first-class
  moderation tool, not an edge case.

  Edit and delete are driven by **separate action flags** and must not be collapsed into one
  "it's mine" check: a journal owner may delete a comment they cannot edit.

- **Action bar** — Comment, Star, Favourite, Follow/Unfollow, enabled per the entry's action flags
  and the viewer's relationship to the author.

## States

- **Loading / Loaded / Empty(no comments) / Error** (per [rules.md](../rules.md)).
- **Protected / not visible** (error 104) → show a "this entry is protected" message and close.
- **Entry by a hidden member** — reached deliberately, e.g. by tapping a placeholder in a grid.
  Show a "you've hidden this member" state with an **Unhide** action instead of the entry; do not
  render the photo, title, or description. Unhiding loads the entry in place.
- **Anonymous user taps a gated action** (Star/Favourite/Follow/Comment) → offer sign-in
  (`FLW-01`); on success, resume the action.
- **Signed-in, read-only account** — Star, Favourite, Follow, Comment/Reply, Delete comment, Edit,
  Delete are all writes: each shows the upgrade prompt (`rules.md`) instead of acting, per
  `FLW-06`/`FLW-07`/`FLW-08`/`FLW-13`. **Hide this member** is unaffected — it's device-local, not
  a write (`rules.md`). Report follows `FLW-11`'s gate.
- **Reached cold (deep link, push, notification)** — this is the screen most likely to open with
  no prior navigation through the active account's own feed. The persistent account indicator
  (nav chrome) covers the ambiguity generally; the optional confirm-account setting (`SCR-25`
  Misc) additionally gates Star/Favourite/Comment specifically — see
  [rules.md](../rules.md) (Multi-account clarity).
- **Owner vs non-owner** — owner-only menu items appear only when the entry's edit/delete action
  flags allow; never offer an action the flags don't permit.
- **Prev/next** — neighbour entries lazy-load when navigated to; show a brief loading state on the
  photo area.

## Actions & rules

- **Opening one's own entry clears its comments' unread state.** Loading an entry loads its
  comments, and that act marks the corresponding comment notifications read — so the comments badge
  can drop without the user ever opening `SCR-24`. This is a property of the platform, not a choice,
  and it is correct behaviour: the user has in fact seen the comments. Worth knowing because it
  makes the badge look inconsistent with the comments inbox otherwise. See
  [rules.md](../rules.md) and [endpoints.md](../api-appendix/endpoints.md).
- **Star** → optimistic +1; on error roll back and show a message. An "already starred" response is
  **not** an error — keep the optimistic state silently.
- **Favourite** → optimistic +1; on **daily-quota error (223)** roll back and show the quota
  message; other errors roll back + generic message. "Already favourited" is likewise not an error.
  (See [error-codes.md](../api-appendix/error-codes.md).)
- **Follow author** → optimistic; **Unfollow** requires a confirm; errors show a message
  (generally no revert for the relationship itself).
- **Comment / Reply** → open `SCR-15`; on return, the new comment appears (reload the thread).
  If the journal has comments disabled, the action is unavailable with an explanation.
- **Edit comment** (per the comment's edit action flag — one's own comment only) → `SCR-15` seeded
  with the existing text → on return the thread reloads to show the edited text.
- **Delete comment** (per the comment's delete action flag — one's own comment anywhere, or any
  comment on one's own entry) → confirm → optimistic removal from the thread; roll back and show a
  message on error.
- **Report comment** → `SCR-16`, scoped to that comment (the same `entry/report` call, with the
  comment identified in the note). Available on any comment by another member, on any entry.
- **Hide this member** (from the overflow menu or a comment) → `FLW-10`; their content disappears
  from this screen immediately, including any comments they've left. The comment **count** is a
  server figure and does not change.
- **Report** → `SCR-16`.
- **Edit / Delete** (owner) → `SCR-13`; Delete requires a confirm and, on success, closes the
  entry.
- **Share** → OS share sheet with the entry's web URL.
- **Tap photo** → previous/next entry (same as the header's prev/next arrows), not `SCR-07`.
- **Tap the fullscreen button** (next to the reaction counts) → `SCR-07`; **tap tag** → `SCR-05`;
  **tap username/avatar** → `SCR-18`.
- **Prev/Next** → load the adjacent entry within the journal.

## API touchpoints

See [endpoints.md](../api-appendix/endpoints.md).

- Load: `entry` (with details, metadata, comments+replies, related, friendship, actions, image
  URLs).
- React: `entry/star`, `entry/favorite`.
- Follow: `users/following` (POST/DELETE).
- Delete entry: `entry` (DELETE); delete comment: `entry/comment` (DELETE). (Posting a
  comment, reporting, and editing happen on their own screens.)

## Acceptance criteria

- [ ] Given a public entry, the photo, title, counts, description, tags, and comments (with
      replies) all render.
- [ ] Given error 104 on load, the user sees a "protected" message and is returned.
- [ ] Given an anonymous user taps Star/Favourite/Follow/Comment, sign-in is offered and, on
      success, the action completes.
- [ ] Given a signed-in, read-only account, every write action on this screen (Star, Favourite,
      Follow, Comment/Reply, Delete comment, Report, Edit, Delete) shows the upgrade prompt
      instead of acting; Hide this member remains available.
- [ ] Given Star/Favourite, the count updates immediately and rolls back on error; favourite
      quota (223) shows its specific message.
- [ ] Given the viewer is not the owner, edit/delete options are absent; given the owner, they are
      present per the action flags.
- [ ] Given an entry with previous/next neighbours, swiping or tapping the arrows loads the
      adjacent entry.
- [ ] Given a tap on a tag, the fullscreen button, or a username, the correct screen opens
      (`SCR-05` / `SCR-07` / `SCR-18`); tapping the photo itself loads the previous/next entry
      instead.
- [ ] Given one's own comment, a delete affordance is shown, confirms, and removes it optimistically.
- [ ] Given one's own comment, an edit affordance opens `SCR-15` seeded with its text, and the
      edited text shows on return.
- [ ] Given someone else's comment on one's own entry, delete is offered but edit is not.
- [ ] Given any comment on one's **own entry**, the same delete affordance is available, whoever
      wrote it.
- [ ] Given a comment by another member, both Report and Hide this member are offered.
- [ ] Given a hidden member, their comments do not render and the entry offers no trace of them,
      while the comment count is unchanged.
- [ ] Given an entry owned by a hidden member, the screen shows an unhide state rather than the
      entry's photo, title, or description.
