# SCR-05 — Tag Entries   [Should]

**Purpose:** Show a grid of entries that carry a given tag.

**Reached from:** tapping a tag chip on `SCR-06 Entry Detail`.
**Leads to:** `SCR-06 Entry Detail`.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  #sunrise                          |  title = the tag
+--------------------------------------+
|  +------+ +------+ +------+           |  grid of thumbnails
|  | img  | | img  | | img  |           |  (pull to refresh)
|  +------+ +------+ +------+           |
|  +------+ +------+ +------+           |
|  | img  | | img  | | img  |           |
|  +------+ +------+ +------+           |
|             (load more on scroll)     |
+--------------------------------------+
```

## Components & data shown
- Title = the tag.
- Grid of entry thumbnails for that tag; entries by hidden members appear as hidden placeholders
  ([rules.md](../rules.md)).
- Pull-to-refresh; infinite scroll (real pagination).

## States
- **Loading / Loaded / Empty** ("No entries tagged '<tag>'") **/ Error** (per
  [rules.md](../rules.md)).

## Actions & rules
- **Tap thumbnail** → `SCR-06`.
- **Pull-to-refresh** → reload first page.
- **Scroll to end** → next page until exhausted.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md): `entries/search` with the tag as the query.

## Acceptance criteria
- [ ] Given a tag, the grid shows entries carrying it, paged on scroll.
- [ ] Given no entries for the tag, an empty state names the tag.
- [ ] Given a tap on a thumbnail, the entry opens in `SCR-06`.
