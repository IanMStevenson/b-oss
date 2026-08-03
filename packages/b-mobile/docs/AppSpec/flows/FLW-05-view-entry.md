# FLW-05 — View an entry   [Must]

**Trigger:** Tap an entry anywhere (feed, search, tag, map, inbox, profile), a deep link, or a push.
**Screens:** `SCR-06 Entry Detail` (+ branches to `SCR-07`, `SCR-08`, `SCR-05`, `SCR-18`).

## Diagram
```mermaid
flowchart TD
  A[Open entry] --> B[Load entry: details, comments, actions…]
  B -->|error: protected| P[Show "protected" + close]
  B -->|error: other| Q[Show message + close]
  B -->|ok| C[Render photo, title, counts, description, tags, comments]
  C -->|swipe / arrows| D[Load prev/next entry]
  D --> C
  C -->|tap photo| E[SCR-07 Full-screen]
  C -->|tap tag| F[SCR-05 Tag Entries]
  C -->|tap author| G[SCR-18 Profile]
  C -->|overflow: metadata| H[SCR-08 Metadata]
  C -->|actions| I[FLW-06 / FLW-07 / FLW-08 / FLW-11 / FLW-13]
```

## Steps, branches & rules
1. Load the entry with all sub-sections. **Protected** (104) → message + close; other errors →
   message + close (see [error-codes.md](../api-appendix/error-codes.md)).
2. Render the full entry (photo, counts, rich description, tags, comments + replies, action bar).
3. **Prev/next** within the journal lazy-loads neighbours.
4. Branches: full-screen photo (`SCR-07`), metadata (`SCR-08`), tag (`SCR-05`), author profile
   (`SCR-18`); reactions/comment/follow/report/edit continue in their own flows.
5. Anonymous users tapping a gated action are routed via `FLW-01`.

## Acceptance criteria
- [ ] A public entry renders fully; a protected entry shows a message and closes.
- [ ] Prev/next loads adjacent entries.
- [ ] Photo/tag/author/metadata branches open the correct screens.
- [ ] Gated actions by anonymous users route through sign-in.
