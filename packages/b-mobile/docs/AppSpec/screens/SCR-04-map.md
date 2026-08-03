# SCR-04 — Map   [Should]

**Purpose:** Browse geotagged entries on a map. Works as a general browsable map, or focused on a
single entry's location.

**Reached from:** primary navigation (general map); `SCR-06 Entry Detail` overflow → Map (focused
on that entry, when geotagged).
**Leads to:** `SCR-06 Entry Detail` (tap a marker's info window).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Map                    (av)  [⌖]  |  back, account, my-location
|        .  o        o                 |
|     o      [i] "Title — alice"       |  marker + info window
|         o      o          o          |  markers for entries in view
|   o          o                       |
|                 o      o             |
+--------------------------------------+
```

## Components & data shown
- A map with **markers** for entries in the current viewport. Entries by **hidden** members have
  no marker at all — a placeholder pin would be noise ([rules.md](../rules.md)).
- **Marker info window** showing the entry's title and author username.
- **My-location** control (requires location permission).
- **General mode:** opens at a sensible default region/zoom.
- **Focused mode:** opens centred on the passed entry at close zoom with its marker's info window
  open.

## States
- **Loading region** — fetching entries for the current bounds.
- **Loaded** — markers shown.
- **Empty region** — no geotagged entries in view (no markers; no error).
- **Error** — fetch failed; non-blocking message, retry on next pan.
- **Maps/location unavailable** — if the map service or location is unavailable, show a clear
  message rather than a blank screen.

## Actions & rules
- **Pan / zoom** → fetch entries for the new visible bounds (cancel any in-flight fetch); add
  markers for entries not already shown.
- **Tap info window** → open that entry (`SCR-06`).
- **My-location** → recentre on the device location (prompt for permission if needed).
- Be economical: debounce/cancel region fetches to respect rate limits ([rules.md](../rules.md)).

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `entries/search` with a bounding-box (the visible region).

## Acceptance criteria
- [ ] Given the general map, panning/zooming loads markers for the visible region.
- [ ] Given a focused entry, the map centres on it with its info window open.
- [ ] Given a region with no geotagged entries, no markers appear and no error is shown.
- [ ] Given a tap on a marker's info window, that entry opens in `SCR-06`.
- [ ] Given location permission is absent, my-location prompts for it and the map still works
      without it.
