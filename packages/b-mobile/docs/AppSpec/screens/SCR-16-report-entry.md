# SCR-16 — Report Entry   [Must]

**Purpose:** Report an entry — **or a comment on it** — to Blipfoto's moderation team, citing one
or more reasons.

**Reached from:** `SCR-06 Entry Detail` overflow → Report (reporting the entry); or the **Report**
action on an individual comment (`SCR-06`, `SCR-24`), which opens this screen already scoped to
that comment.
**Leads to:** back to the caller after submitting.

> **Comments are reported through the same mechanism as entries.** There is no separate
> comment-report endpoint: a comment is reported by reporting its entry and identifying the
> comment in the note. This screen makes that explicit rather than leaving users to know it.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Report this entry          [Send] |
|  [ ] Explicit content                |
|  [ ] Inappropriate content           |
|  [ ] Copyright infringement          |
|  [ ] Promotional / spam              |
|  [ ] Incorrect date                  |
|  Reporting: alice's comment          |  context line; or "this entry"
|  Note (optional)                     |
|  [ alice's comment: "…"          ]   |  pre-seeded for a comment report
|  [____________________________]      |
+--------------------------------------+
```

## Components & data shown
- **A context line** naming what is being reported — *this entry*, or *a comment by `<username>`*.
  The user must never be unsure which they are sending.
- Reason checkboxes — **five**, and this set is server-defined: **explicit content**, **inappropriate
  content**, **copyright infringement**, **promotional / spam**, **incorrect date**. Do not invent
  additional reasons, drop any of these, or vary the set for the comment case.
- **Note** (optional free text). When reporting a comment, it is **pre-seeded with a line
  identifying that comment** (its author, and enough of its text to locate it), which the user can
  edit or extend. This is what tells the moderation team which comment is meant.
- **Send** and cancel.

## States
- **Read-only account** — never reaches this screen; the upgrade prompt (`rules.md`, `FLW-11`) is
  shown instead, before navigating here.
- **Editing** — normal.
- **Validation** — Send requires at least one reason; otherwise show "Select a reason" and stay.
- **Submitted** — the report is sent (in the background) and the screen returns to the entry.

## Actions & rules
- **Send** → require ≥1 reason; submit the selected reasons + note against the **entry**; return
  to the caller. A comment report is the same call with the comment identified in the note.
- **Cancel** → return without sending.
- Submission is fire-and-forget from the user's perspective (no blocking wait needed).
- Reporting is **moderation**, and independent of the personal controls: hiding the member
  (`SCR-31`) affects only what you see, while reporting asks Blipfoto to act for everyone. Offer
  **Hide** alongside a successful report, as a separate choice — a user who reports someone
  usually also wants to stop seeing them.
- On one's **own** entry, reporting a comment is rarely the first move — the owner can simply
  **delete** it (`SCR-06`). Offer both; deletion is immediate, reporting escalates.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md): `entry/report` (entry + selected reasons +
note). The same endpoint serves both entry and comment reports.

## Acceptance criteria
- [ ] Given no reason selected, Send is blocked with a "select a reason" message.
- [ ] Given ≥1 reason, Send submits the report and returns to the caller.
- [ ] The optional note is included when provided.
- [ ] Given the screen was opened from a comment, a context line names that comment's author and
      the note is pre-seeded with text identifying it.
- [ ] Given a successful report, Hide is offered as a separate action, never applied
      automatically.
- [ ] Given a signed-in, read-only account, the upgrade prompt is shown instead of this screen
      opening.
