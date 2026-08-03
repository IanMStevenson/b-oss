# SCR-15 — New / Edit Comment or Reply   [Must]

**Purpose:** Compose a comment on an entry, reply to an existing comment, or **edit one's own**
comment or reply.

**Reached from:** `SCR-06 Entry Detail` (Comment action, Reply on a comment, or Edit on one's own
comment); the Reply action in `SCR-24 Comments Inbox`.
**Leads to:** returns to the caller, which refreshes to show the new or edited comment/reply.
Account-gated (`FLW-01`).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Add a comment                [OK] |
|  [ B ] [ I ] [ link ] …              |  BBCode formatting toolbar
|  +------------------------------+    |
|  | Your comment…                |    |  multi-line editor
|  +------------------------------+    |
+--------------------------------------+
```

## Components & data shown
- A multi-line BBCode editor with the **formatting toolbar** (shared behaviour with `SCR-11`),
  empty for a new comment/reply and **seeded with the existing text** when editing.
- Context: whether this is a top-level comment, a reply to a specific comment, or an edit of one's
  own. The title reflects it ("Add a comment" / "Reply" / "Edit comment") so the user is never
  unsure whether they are about to replace or to add.
- **OK** (submit) and back/cancel.

## States
- **Editing** — normal.
- **Submitting** — on OK, show a brief progress indicator while the comment posts.
- **Error** — post failed; show a message and **keep the entered text** so the user can retry.
- **Discard guard** — backing out with text prompts a discard confirmation.
- **Account required, and read-write** — anonymous users are routed through sign-in before this
  screen, which always signs in read-write (`FLW-01`). A **read-only** account never reaches this
  screen — the upgrade prompt (`rules.md`, `FLW-07`) is shown instead.
- **Comments disabled** — if the entry's journal disallows comments, the action is unavailable with
  an explanation (handled at `SCR-06`).

## Actions & rules
- **OK** → post the new comment/reply, or commit the edit; on success return to the caller, which
  reloads to show it.
- **Cancel / back** → discard (with confirmation if text is present, or changed when editing).
- A reply is associated with its parent comment (one-level threading).
- **Editing is limited to one's own comment or reply**, driven by the comment's edit action flag —
  never offered for someone else's, including on one's own entry, where delete is the available
  moderation tool instead (`SCR-06`).

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- New comment or reply → `entry/comment` (POST), with the entry and, for a reply, the parent
  comment.
- Edit → `entry/comment` (PUT), with the comment being edited.

## Acceptance criteria
- [ ] Given a signed-in user, OK posts the comment and the caller shows it on return.
- [ ] Given a reply, it is attached to the correct parent comment.
- [ ] Given an edit, the editor opens seeded with the existing text and OK replaces it rather than
      adding a new comment.
- [ ] Given a post failure, the text is preserved and an error is shown.
- [ ] Given cancel with text, a discard confirmation is shown.
- [ ] Given an anonymous user, sign-in is required first.
- [ ] Given a signed-in, read-only user, the upgrade prompt is shown instead of this screen
      opening.
