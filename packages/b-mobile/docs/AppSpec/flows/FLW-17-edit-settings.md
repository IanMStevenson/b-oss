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
4. **Notifications**: feed + push toggles; push toggles govern what the cloud service may push. A
   successful save of this section also pings the notification service to refresh its cached
   preferences immediately, so an in-app change takes effect without waiting for the service's own
   periodic refresh — see [`../../ImplementationSpec/notification-service.md`](../../ImplementationSpec/notification-service.md).
5. **Reminders / Misc**: local only; saving Reminders (re)schedules the daily reminder (`FLW-18`).
6. Errors keep edits and show a message; backing out with unsaved edits confirms discard.

## Acceptance criteria
- [ ] Server-backed sections load, save, and discard correctly; success refreshes dependent cached
      state.
- [ ] Enabling privacy surfaces pending-request approval and Refused followers; Hidden members
      is present either way.
- [ ] Avatar upload (with crop) and delete work.
- [ ] Notification toggles save; push toggles bound what the cloud service pushes.
- [ ] Saving Notifications pings the service to refresh its cached preferences immediately.
- [ ] Reminders/Misc persist locally; saving Reminders (re)schedules the reminder.
