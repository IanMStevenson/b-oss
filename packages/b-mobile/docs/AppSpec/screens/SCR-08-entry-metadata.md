# SCR-08 — Entry Metadata   [Should]

**Purpose:** Show an entry's camera/EXIF metadata, read-only.

**Reached from:** `SCR-06 Entry Detail` overflow → Metadata (shown only when the entry has
metadata).
**Leads to:** back to `SCR-06`.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Camera info — "Title"             |
+--------------------------------------+
|  Camera        Leica Q2              |
|  Exposure      1/250 s              |
|  Aperture      f/2.8               |
|  Focal length  28 mm               |
|  ISO           200                 |
+--------------------------------------+
```

## Components & data shown
- Labelled, read-only fields: camera make/model, exposure time, f-number (aperture), focal
  length, ISO. Fields with no value are omitted.

## States
- **Loaded** — the metadata that exists is shown (data is carried from the entry; no fetch).
- **Empty** — not reachable in practice (the entry point only appears when metadata exists), but
  if all fields are blank, show "No camera information".

## Actions & rules
- Read-only; back returns to the entry. No API calls.

## API touchpoints
None directly; metadata comes from the entry already loaded on `SCR-06` (see
[data-model.md](../api-appendix/data-model.md)).

## Acceptance criteria
- [ ] Given an entry with metadata, the available fields render with labels; blank fields are
      omitted.
- [ ] The screen makes no network request.
- [ ] Back returns to the entry.
