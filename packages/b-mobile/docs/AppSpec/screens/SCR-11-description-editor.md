# SCR-11 — Description Editor   [Should]

**Purpose:** Edit rich text (BBCode) for an entry description, a comment, or a biography, with
formatting buttons so users rarely type raw BBCode.

**Reached from:** `SCR-10 Compose Entry Details` and `SCR-13 Edit Entry` (entry description);
`SCR-25 Settings` → Profile → Biography; conceptually also the comment composer (`SCR-15`).
**Leads to:** returns the edited text to the caller.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Description                  [OK] |
|  [ B ] [ I ] [ U ] [ S ] [ link ]    |  formatting toolbar (the five BBCode tags)
|  +------------------------------+    |
|  | The text being edited, with  |    |  multi-line editor
|  | [b]bold[/b] applied via the  |    |
|  | toolbar buttons…             |    |
|  +------------------------------+    |
+--------------------------------------+
```

## Components & data shown
- A multi-line text editor seeded with the existing text.
- A **formatting toolbar** with a button per supported tag. The set is exactly five — **bold,
  italic, underline, strikethrough, link** — and no others; there is no quote, list, image or
  colour tag. Buttons wrap the current selection (or insert at the caret).
  - **Link has a wrinkle worth knowing:** the platform ignores links from accounts that haven't yet
    cleared its anti-spam threshold, and offers no way for the app to tell whether a given account
    has. So the button is always shown; for a very new account the link markup simply won't take
    effect when the text is saved. Not worth designing around.
- **OK** (apply) and back/cancel.

## States
- **Editing** — normal.
- **Discard guard** — backing out with unsaved changes prompts a discard confirmation.

## Actions & rules
- **Toolbar button** → insert/wrap the corresponding BBCode around the selection.
- **OK / back** → return the edited text to the caller; cancel discards (with confirmation if
  changed).
- BBCode is retained as the storage format (decided); the toolbar is the primary way users apply
  it. No API calls — the caller persists the text.

## API touchpoints
None directly. The text is saved by the calling screen (entry publish/edit, or
`user/settings` for biography — see [endpoints.md](../api-appendix/endpoints.md)).

## Acceptance criteria
- [ ] Given existing text, it loads into the editor.
- [ ] Given a selection and a toolbar button, the matching BBCode is applied around the selection.
- [ ] Given OK, the edited text is returned to the caller; given cancel with changes, a discard
      confirmation is shown.
