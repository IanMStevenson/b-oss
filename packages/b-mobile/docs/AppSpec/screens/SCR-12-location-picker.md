# SCR-12 — Location Picker   [Should]

**Purpose:** Place, move, or clear a geotag for an entry on a map during compose/edit.

**Reached from:** `SCR-10 Compose Entry Details` and `SCR-13 Edit Entry` (the "Add location"
affordance).
**Leads to:** returns the chosen location (or "cleared") to the caller.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Pick location      [Clear] [Done] |
|                                      |
|                  [📍]                 |  tap map to place/move marker
|         (map; my-location enabled)    |
|                                      |
+--------------------------------------+
```

## Components & data shown
- A map, opening at the passed location (if any) or a sensible default; my-location available.
- A single **marker** the user places/moves by tapping.
- **Clear** (remove the marker) and **Done** (confirm) actions.

## States
- **No selection** — no marker yet (Done returns "no location").
- **Selected** — a marker is placed (Done returns its coordinates).
- **Maps/location unavailable** — show a clear message rather than a blank map.

## Actions & rules
- **Tap map** → place or move the single marker.
- **Clear** → remove the marker/selection.
- **Done** → return the marker's coordinates and a "has location" result, or a "cleared/none"
  result. Selection survives rotation.
- No Blipfoto API calls.

## API touchpoints
None directly; the coordinates are attached to the entry by the caller on publish/edit
(`entry` POST/PUT — see [endpoints.md](../api-appendix/endpoints.md)).

## Acceptance criteria
- [ ] Given an existing location, the map opens centred on it with the marker placed.
- [ ] Given a tap, a single marker is placed/moved.
- [ ] Given Clear then Done, the caller receives a "no location" result.
- [ ] Given a placed marker then Done, the caller receives its coordinates.
