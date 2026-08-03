# SCR-13 — Edit Entry   [Must]

**Purpose:** Modify an existing entry the user owns — its details
(title/tags/description/location) or its photo — and delete the entry. A small family of related
editors sharing one screen ID.

**Reached from:** `SCR-06 Entry Detail` overflow menu (owner only, per the entry's action flags).
**Leads to:** back to `SCR-06` (which reloads to reflect the change). Uses the same durable
background upload as compose (`FLW-13`).

## Modes
1. **Edit details** — title, tags, description (→ `SCR-11`), location (→ `SCR-12`).
2. **Replace photo** — pick/take a new photo for the entry.
3. **Delete entry** — remove the entry entirely (invoked from `SCR-06`; confirm required).

> There is no "manage additional photos" mode. Additional photos are unavailable to this app —
> see [api-appendix/endpoints.md](../api-appendix/endpoints.md).

## Layout (ASCII wireframe)
```
Edit details
+----------------------------+
| <  Edit details   [Save]   |
|  Title [______________]    |
|  Tags  [______________]    |
|  Description [ … ]     ✎    |
|  [x] Location         ▸map  |
+----------------------------+
```

## Components & data shown
- **Edit details:** form pre-filled from the entry (title, tags, description preview, location
  toggle). Save commits.
- **Replace photo:** take/choose a new photo; confirm replaces the entry's photo.

## States
- **Loading** — fetching the entry to pre-fill (details mode).
- **Ready / Submitting** — as compose; edits are enqueued as durable background uploads.
- **Error** — surfaced per [error-codes.md](../api-appendix/error-codes.md).
- **Discard guard** — unsaved edits prompt a discard confirmation.

## Actions & rules
- **Save details / Replace photo** → enqueue a durable background upload (survives leaving the
  screen, retries on network failure — [rules.md](../rules.md)).
- **Delete entry** (from `SCR-06`) → confirm → on success close the entry.
- Only offered for entries the viewer owns (per action flags) **and only read-write** — a
  read-only owner sees the upgrade prompt (`rules.md`, `FLW-13`) instead of this screen ever
  opening; never expose edit/delete otherwise.
- On return, `SCR-06` reloads to reflect changes.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- Load: `entry` (details / actions).
- Save details / replace photo: `entry` (PUT).
- Delete entry: `entry` (DELETE).

## Acceptance criteria
- [ ] Given the owner edits details, the form pre-fills and Save updates the entry (visible on
      return).
- [ ] Given replace-photo, the new image replaces the entry's photo via a background upload.
- [ ] Given delete entry with confirmation, the entry is removed and `SCR-06` closes.
- [ ] Edit/delete are unavailable to non-owners.
- [ ] A read-only owner sees the upgrade prompt instead of this screen ever opening.
