# SCR-22 — Awards   [Should]

**Purpose:** Show the badges a member has earned. Often paired with an icon guide explaining what
each badge means.

**Reached from:** the Awards tab of `SCR-17 My Profile` / `SCR-18 User Profile`; an award push
target; `SCR-29 Help & Info` (icon guide).
**Leads to:** the icon guide (`SCR-29`).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Awards                            |
|  🏅 🏅 🏅 🏅 🏅 🏅                    |  earned badges grid
|  🏅 🏅 🏅                             |
|  (tap a badge for its meaning)        |
+--------------------------------------+
```

## Components & data shown
- A grid of earned badge icons. Tapping a badge shows its name/meaning (or links to the icon
  guide). Secret badges appear only once earned.

## States
- **Loading / Loaded / Empty** ("No awards yet") **/ Error** (per [rules.md](../rules.md)).

## Actions & rules
- **Tap a badge** → show its meaning / open the icon guide (`SCR-29`).
- Read-only.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md): `user/awards`.

## Acceptance criteria
- [ ] Given earned awards, they render as a badge grid.
- [ ] Given a tap on a badge, its meaning is shown (or the icon guide opens).
- [ ] Given no awards, an empty state is shown.
