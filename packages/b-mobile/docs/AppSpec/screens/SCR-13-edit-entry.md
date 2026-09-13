# SCR-13 — Edit Entry   [Must]

**Purpose:** Modify an existing entry the user owns — its details
(title/tags/description/location), its photo, and/or delete the entry — all from one screen.

**Reached from:** `SCR-06 Entry Detail`'s single Edit affordance (nav-header icon, owner only, per
the entry's action flags). **Leads to:** back to `SCR-06` (which reloads to reflect the change).
Uses the same durable background upload as compose (`FLW-13`).

## Sections (one screen, not separate modes)
2026-09 feedback round: previously two separate "modes" reached via two separate overflow-menu
items, with Delete implemented on `SCR-06` itself instead. Now all three live together here:
1. **Details** — title, tags, description (→ `SCR-11`), location (→ `SCR-12`).
2. **Replace photo** — pick/take a new photo for the entry.
3. **Delete entry** — remove the entry entirely (confirm required).

> There is no "manage additional photos" section. Additional photos are unavailable to this app —
> see [api-appendix/endpoints.md](../api-appendix/endpoints.md).

## Layout (ASCII wireframe)
```
+----------------------------+
| <  Edit entry      [Save]  |
|  Title [______________]    |
|  Tags  [______________]    |
|  Description [ … ]     ✎    |
|  [x] Location         ▸map  |
|  Photo [preview]            |
|  [Take a photo] [Choose…]   |
|  [        Save        ]     |
|  [    Delete entry    ]     |
+----------------------------+
```

## Components & data shown
- **Details:** form pre-filled from the entry (title, tags, description preview, location
  toggle).
- **Replace photo:** take/choose a new photo; shown inline alongside the details form, not a
  separate mode.
- **Delete entry:** a destructive action at the bottom of the screen, always visible alongside
  Save.

## States
- **Loading** — fetching the entry to pre-fill.
- **Ready / Submitting** — as compose; Save enqueues a durable background upload.
- **Deleting** — Delete entry is a direct, immediate call, not a queued upload.
- **Error** — surfaced per [error-codes.md](../api-appendix/error-codes.md).
- **Discard guard** — unsaved edits prompt a discard confirmation.

## Actions & rules
- **Save** → enqueue a durable background upload of whatever changed (details and/or photo;
  survives leaving the screen, retries on network failure — [rules.md](../rules.md)).
- **Delete entry** → confirm → on success, navigate straight to `SCR-02 Browse` (this screen, not
  `SCR-06`, owns delete now).
- Only offered for entries the viewer owns (per action flags) **and only read-write** — a
  read-only owner sees the upgrade prompt (`rules.md`, `FLW-13`) instead of this screen ever
  opening; never expose edit/delete otherwise.
- On return from Save, `SCR-06` reloads to reflect changes.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- Load: `entry` (details / actions).
- Save details / replace photo: `entry` (PUT).
- Delete entry: `entry` (DELETE).

## Acceptance criteria
- [ ] Given the owner edits details, the form pre-fills and Save updates the entry (visible on
      return).
- [ ] Given replace-photo, the new image replaces the entry's photo via a background upload.
- [ ] Given delete entry with confirmation, the entry is removed and the app navigates to
      `SCR-02 Browse`.
- [ ] Edit/delete are unavailable to non-owners.
- [ ] A read-only owner sees the upgrade prompt instead of this screen ever opening.
