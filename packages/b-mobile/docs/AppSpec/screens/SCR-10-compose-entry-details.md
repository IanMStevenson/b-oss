# SCR-10 — Compose Entry Details   [Must]

**Purpose:** Compose the new entry — title, tags, description, date, optional location, optional
crop — then publish. Enforces the one-entry-per-day rule for the chosen date.

**Reached from:** `SCR-09 New Entry`; Share-to-Blipfoto (with the shared photo, account- and
read-write-gated — a read-only account sees the upgrade prompt before this screen opens, per
`FLW-12`/`rules.md`).
**Leads to:** `SCR-11 Description Editor`, `SCR-12 Location Picker`, and on publish
`SCR-14 Upload Progress` / back to the feed. Part of `FLW-12`.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  New entry                [Upload] |
|        [   photo thumbnail   ]  ✎    |  tap ✎ to crop (members only)
|  Title  [____________________]       |
|  Tags   [____________________]       |  comma-separated
|  Description  [ preview… ]      ✎     |  ✎ -> SCR-11
|  Date   [ Mon 14 Jun 2026 ▾ ]        |  date picker
|  [ ] Add location              ▸ map |  checkbox -> SCR-12
|                                      |
|  ⚠ You already have an entry for     |  publish-eligibility message
|     that day                         |  (only when date ineligible)
+--------------------------------------+
```

## Components & data shown
- **Photo thumbnail** — the chosen photo; tapping offers **square crop** (members only —
  membership read from account state).
- **Title** (warn approaching the **50-character** limit), **Tags** (comma-separated, **255-character**
  limit across the whole field), **Description** preview with an edit affordance → `SCR-11`
  (no length limit on description).
- **Date** picker (defaults from photo EXIF date, else today). Days already used, or otherwise
  ineligible, are shown as unselectable — the picker loads a month's eligibility at once rather
  than checking one date at a time.
- **Add location** toggle; enabling with no location opens `SCR-12` (location pre-filled from EXIF
  or device location when available).
- **Upload** action.
- **Publish-eligibility message** — shown when the selected date can't be published, with the
  reason. The eligibility query returns a **state**, and each state maps to a message. Use
  Blipfoto's own wording, so the app and the website say the same thing about the same date:

  | State | Message |
  |---|---|
  | Date is free | *(no message — the date is selectable)* |
  | Already an entry that day | "You already have an entry for that day." |
  | Entry suspended | Same message as "already an entry". **Deliberate** — the website does not reveal suspension here, and the app must not either. |
  | Date is in the future | "That date is in the future." |
  | Date is too far in the past | "That date is too far in the past." |
  | Entry blocked | No message is defined for this state anywhere. Treat as ineligible, block Upload, and show a neutral "You can't publish an entry for that date." rather than inventing a reason. |

  Only the "already an entry" case is worth a specific affordance (jumping to that entry); the rest
  simply block Upload.

## States
- **Preparing** — reading the photo (EXIF, dimensions, thumbnail) on entry.
- **Ready** — form editable.
- **Unusable photo** — unsupported type or too small → message and abort back to `SCR-09`.
- **Date ineligible** — eligibility check failed for the date; show the reason and block upload
  until a publishable date is chosen.
- **Submitting** — on Upload, the entry is enqueued and the screen closes (upload continues in the
  background — see `SCR-14` / [rules.md](../rules.md)).
- **Discard guard** — backing out with unsaved input prompts a discard confirmation.

## Actions & rules
- **Pick date** → confirm publish eligibility for the chosen date (one-per-day rule); update the
  message and enable/disable Upload accordingly. Fetch the surrounding **month's** eligibility to
  drive the picker, so changing date doesn't cost a request each time (see
  [endpoints.md](../api-appendix/endpoints.md), rate limiting).
- **Edit description** → `SCR-11` (returns the edited text).
- **Add location** → `SCR-12` (returns lat/lng) or clear it.
- **Crop** → square crop, members only.
- **Upload** → only when the photo is ready and the date is eligible; build the entry and **enqueue
  a durable background upload** (it survives leaving this screen, retries on network failure — see
  [rules.md](../rules.md)), then close.
- Respect the "upload full size" preference (`SCR-25` Misc) when deciding whether to downscale.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `journal/month` — eligibility across the visible month, to drive the date picker.
- `journal/day` — confirm eligibility for the specific chosen date.
- `entry` (POST) — publish (performed by the background upload; see `FLW-12`).

## Acceptance criteria
- [ ] Given a chosen photo, the form prepares (date pre-filled from EXIF/today; thumbnail shown).
- [ ] Given a date with an existing entry (or otherwise ineligible), the reason is shown and Upload
      is blocked until a publishable date is chosen.
- [ ] Ineligible days are visibly unselectable in the picker, without one request per date change.
- [ ] Given crop, it is offered only to members.
- [ ] Given Upload on a valid entry, it is enqueued and continues in the background after the screen
      closes.
- [ ] Given an unsupported/too-small photo, the user is told and returned to `SCR-09`.
- [ ] Given the user backs out with edits, a discard confirmation is shown.
