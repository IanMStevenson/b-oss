# FLW-17 — Edit settings   [Must]

**Trigger:** Open Settings.
**Screens:** `SCR-25 Settings` (+ sections; biography → `SCR-11`; hidden members → `SCR-31`;
refused followers → `SCR-21`).

## Diagram
```mermaid
flowchart TD
  A[Open Settings] --> B[Choose a section]
  B -->|server-backed| C[Load current values]
  C --> D[Edit]
  D -->|Save| E[Commit]
  E -->|ok| F[Return; refresh cached account state]
  E -->|error| G[Show message; keep edits]
  D -->|Cancel| H[Discard]
  B -->|local: reminders / misc| I[Edit + save locally]
  I -->|reminders| J[(Re)schedule daily reminder FLW-18]
```

## Steps, branches & rules
1. **Server-backed sections** (general, journal, profile username/biography/picture, notifications):
   load current values → edit → **Save** (commit) / **Cancel** (discard). On success, refresh any
   locally cached state other screens depend on (e.g. privacy, journal title).
2. **Privacy** toggle is significant: enabling it surfaces follow-request approval (`SCR-20`) and
   the Refused followers entry (`SCR-21`). Hidden members (`SCR-31`) is always available and is
   unaffected by the privacy setting — the two are separate features, see [rules.md](../rules.md).
3. **Avatar**: take/choose (with crop) uploads; delete (confirm) removes it.
4. **Notifications** ([b-oss#244](https://github.com/IanMStevenson/b-oss/issues/244)): two parts. *Notifications from this app* — Push for new
   comments / Push for new notifications, held by the notification service and applied
   immediately (first on enables, a change is a `PATCH`, last off deregisters — `FLW-22`), plus
   the check interval. *Blipfoto feed settings* — the six `feed_*` toggles, Save/Cancel; only feed
   keys are sent, never `push_*`, and no refresh ping follows a save (the service no longer reads
   Blipfoto's settings). A feed type turned off is never created by Blipfoto, so a hint under
   *Push for new notifications* names any saved feed types that are off — see `SCR-25` and
   [`../../ImplementationSpec/notification-service.md`](../../ImplementationSpec/notification-service.md).
5. **Reminders / Misc**: local only; saving Reminders (re)schedules the daily reminder (`FLW-18`).
6. Errors keep edits and show a message; backing out with unsaved edits confirms discard.

## Acceptance criteria
- [ ] Server-backed sections load, save, and discard correctly; success refreshes dependent cached
      state.
- [ ] Enabling privacy surfaces pending-request approval and Refused followers; Hidden members
      is present either way.
- [ ] Avatar upload (with crop) and delete work.
- [ ] Push toggles bound what the cloud service pushes; feed toggles save only `feed_*` keys and
      trigger no call to the service.
- [ ] Reminders/Misc persist locally; saving Reminders (re)schedules the reminder.
