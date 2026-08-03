# SCR-07 — Full-screen Photo   [Must]

**Purpose:** View an entry's photo full-screen, at the best resolution available to this app.

> **Standard resolution is the ceiling.** Higher-resolution and original images exist on the
> platform but are restricted to trusted first-party apps and are not served to this one — the same
> restriction that puts additional photos out of reach (see
> [api-appendix/endpoints.md](../api-appendix/endpoints.md)). This screen must not offer a "view
> original" affordance or otherwise imply a larger image is obtainable.

**Reached from:** tapping the photo on `SCR-06 Entry Detail`.
**Leads to:** back to `SCR-06`.

## Layout (ASCII wireframe)
```
+--------------------------------------+
|                                  [X] |  dismiss
|                                      |
|         [        photo        ]      |  full-bleed image
|              (pinch to zoom)          |
|                                      |
+--------------------------------------+
```

## Components & data shown
- The photo, displayed full-screen (immersive; chrome minimal/auto-hiding).
- Loaded at standard resolution — the largest this app is served.
- **Pinch-to-zoom and pan.** Zooming past the image's native resolution is allowed (it's how people
  inspect detail) but there is no higher-resolution fetch behind it.

## States
- **Loading** — image fetching (placeholder).
- **Loaded** — image shown.
- **Error** — image failed to load; show a retry/placeholder.

## Actions & rules
- **Pinch/double-tap** → zoom; **drag** → pan.
- **Dismiss** (back / close / swipe-down) → return to `SCR-06`.
- No API calls — the image is fetched from its (CDN) URL supplied by the entry.

## API touchpoints
None directly; uses image URLs from the entry (see
[data-model.md](../api-appendix/data-model.md)).

## Acceptance criteria
- [ ] Given an entry photo, it opens full-screen at standard resolution, with no "view original"
      or higher-resolution affordance offered.
- [ ] The user can pinch/double-tap to zoom and pan, and dismiss back to the entry.
- [ ] Given an image fails to load, a placeholder/retry is shown rather than a blank screen.
