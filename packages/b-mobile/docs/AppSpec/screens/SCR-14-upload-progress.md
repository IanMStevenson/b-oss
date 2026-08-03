# SCR-14 — Upload Progress   [Should]

**Purpose:** Show the status of the durable upload queue — what's queued, uploading, done, or
failed — and let the user jump to a finished entry.

**Reached from:** the upload notification/indicator; optionally from compose after publishing.
**Leads to:** `SCR-06 Entry Detail` (tap a successful upload).

> May be folded into a persistent notification + in-feed state rather than a dedicated screen —
> the *behaviour* below is what matters (see [rules.md](../rules.md)).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Uploads                           |
|  [img] Sunrise        ✔ Uploaded     |  tap -> SCR-06
|  [img] Harbour        ⟳ Uploading…   |
|  [img] Cat            ⏳ Waiting      |
|  [img] Blurry         ✖ Failed — …   |  shows error reason
+--------------------------------------+
```

## Components & data shown
- A list combining the live queue and recently-finished uploads, each with thumbnail, title, and a
  status (waiting / uploading / uploaded / failed), colour-coded; failures show their reason.

## States
- **Empty** — nothing queued or recent.
- **Active** — items uploading/waiting; the list updates live.
- **Done / Failed** — terminal per item; failed items show the error message.

## Actions & rules
- **Tap a successful item** → open its entry (`SCR-06`).
- Failed items show why; (optional) offer retry. Network failures retry automatically in the
  background — see [rules.md](../rules.md); application errors stop and surface here.
- The list reflects the durable queue, so it is correct even after leaving and returning.

## API touchpoints
None directly — reads upload state. The actual `entry` calls are made by the
background upload (see `FLW-12`, `FLW-13`).

## Acceptance criteria
- [ ] Given queued/active uploads, their statuses display and update live.
- [ ] Given a completed upload, tapping it opens the new entry.
- [ ] Given a failed upload, the failure reason is shown.
- [ ] The list is correct after navigating away and back (reflects the durable queue).
