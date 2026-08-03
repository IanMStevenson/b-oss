# SCR-24 — Comments Inbox   [Must]

**Purpose:** Show recent comments received on the user's entries (and replies to the user), with an
unread count and a quick reply.

**Reached from:** primary navigation / app-bar (with an unread badge); a comment push.
**Leads to:** `SCR-06 Entry Detail` (the commented entry), `SCR-18 User Profile` (commenter),
`SCR-15 New Comment` (reply). Account-gated.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Comments                     (av) |
|  [thumb] alice: lovely light!   ↩    |  tap thumb -> entry; ↩ -> reply
|  [thumb] bob: where is this?    ↩    |  tap name -> profile
|        (pull to refresh)              |
+--------------------------------------+
```

## Components & data shown
- A list of received comments, each with the commenter (avatar/username + badge icons), the
  rendered comment, the related entry thumbnail, a **Reply** affordance (when permitted),
  **Report** (`SCR-16`, scoped to that comment), **Delete** where permitted — these are comments
  on the user's own entries, so the journal owner may remove any of them — and **Hide this
  member** (`FLW-10`).
- **Comments from hidden members are not listed at all** — see [rules.md](../rules.md). Unlike
  `SCR-23`, this is exact rather than best-effort: a comment states who wrote it.
- An unread count badge on the inbox entry point.
- **Which items were new**, if the screen distinguishes them — but see the trap below, because it
  can only be known from the first response.

## States
- **Loading / Loaded / Empty** ("No comments yet") **/ Error** (per [rules.md](../rules.md)).
  The list is **fetched fresh on every visit** — no cached items are shown, per the caching rule in
  [rules.md](../rules.md), so the inbox opens in its loading state.

## Actions & rules
- **Open inbox** → fetch recent comments and clear the unread badge. As on `SCR-23`, there is **no
  explicit mark-read call**: fetching is itself what clears the unread state. The app cannot clear
  selectively, and cannot open this screen *without* marking everything read — an API property, not
  a design choice. See [endpoints.md](../api-appendix/endpoints.md).
- **The first fetch clears everything, not just what it returned.** Loading one page of comments
  marks *all* of the account's unread comments read, including any not yet fetched. So if the
  screen shows which items are new, it must record that from the **first response** — by the second
  page there is nothing left to read it from. Get this wrong and new-item marking works on first
  open and silently stops working on scroll.
- **The badge can also clear without visiting this screen**, because opening one's own entry loads
  its comments and clears them too (`SCR-06`). Expected, not a defect.
- **Pull-to-refresh** → fetch the latest using the `since_id` cursor.
- **Tap thumbnail** → the entry (`SCR-06`); **tap commenter** → profile (`SCR-18`); **Reply** →
  `SCR-15` (pre-targeted to that comment).
- A new push refreshes the unread count.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `messages/comments/recent` (with a `since_id` cursor) — **this call is also what marks the
  comments read**, and it marks *all* of them read, not only those returned.
- `messages/totals/unread` (unread count).

## Acceptance criteria
- [ ] Opening the inbox fetches fresh, showing a loading state rather than a stale list.
- [ ] Given the inbox is opened, the unread badge clears and stays cleared after a refresh.
- [ ] Given the inbox is paged, any new-item marking still reflects what was new on first open.
- [ ] Given a comment, tapping its thumbnail opens the entry and tapping the commenter opens their
      profile.
- [ ] Given Reply, the composer opens targeting that comment.
- [ ] Given none, an empty state is shown.
- [ ] Given a hidden member, none of their comments appear in this inbox.
- [ ] Hiding a member from a comment row removes their comments from the list immediately.
- [ ] A comment on one's own entry can be deleted from this inbox, whoever wrote it, and reported
      to moderation.
