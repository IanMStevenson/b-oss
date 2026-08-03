# SCR-03 — Search   [Must]

**Purpose:** Find entries and people by text query, across two tabs.

**Reached from:** primary navigation; the search action on `SCR-02 Browse`.
**Leads to:** `SCR-06 Entry Detail` (entry result), `SCR-18 User Profile` (person result).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  [ search…              ] X   (av) |  query field (clear button)
| Entries        |        People        |  tabs
+--------------------------------------+
|  +------+ +------+ +------+           |  Entries tab: thumbnail grid
|  | img  | | img  | | img  |           |
|  +------+ +------+ +------+           |
|                                      |
|  -- or, People tab --                |
|  [av]  alice            >            |  People tab: user rows
|  [av]  alistair         >            |
+--------------------------------------+
```

## Components & data shown
- **Query field** with clear button; **debounced** live search (short idle delay) and an explicit
  search/submit action from the keyboard.
- **Entries tab** — grid of matching entry thumbnails; entries by hidden members appear as hidden
  placeholders, per [rules.md](../rules.md).
- **People tab** — list of matching users (avatar + username); a **hidden** member is still
  listed, marked as hidden, so they remain findable in order to unhide.
- Switching tabs runs the search for the current term on the newly shown tab if it has no results
  yet.

## States (per tab)
- **Idle** — no query entered: show a neutral prompt ("Search entries and people").
- **Loading** — query in flight.
- **Loaded** — results shown.
- **Empty** — query returned nothing: "No results for '<term>'".
- **Error** — request failed; message + retry.

## Actions & rules
- **Type** → after a short debounce, search the active tab (only when the trimmed term is
  non-empty).
- **Submit** (keyboard action) → search immediately, dismiss the keyboard.
- **Switch tab** → show that tab's already-loaded results if searched earlier this session for the
  same term, else search the new tab for the current term (in-session state, not the caching rule
  in [rules.md](../rules.md)).
- **Tap entry** → `SCR-06`; **tap person** → `SCR-18`.
- **Pagination** — results page on scroll; real pagination, with no fixed cap on how many pages
  can be loaded.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- Entries → `entries/search` (text query).
- People → `users/search`.

## Acceptance criteria
- [ ] Given a non-empty query, the active tab shows matching results after the debounce or on
      submit.
- [ ] Given an empty/whitespace query, no search runs and a neutral prompt is shown.
- [ ] Given results exist, scrolling loads further pages until exhausted.
- [ ] Given no matches, an empty state names the term.
- [ ] Given a tap on an entry or person result, the correct screen opens.
- [ ] Given the user switches tabs with a current term, the new tab searches if it has no results.
