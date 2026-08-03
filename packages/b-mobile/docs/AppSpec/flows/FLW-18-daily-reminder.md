# FLW-18 — Daily publish reminder   [Should]

**Trigger:** A local scheduled reminder at the user's chosen time (when enabled in `SCR-25`).
**Screens:** system notification → `SCR-09 New Entry`.

## Diagram
```mermaid
flowchart TD
  A[Reminder enabled w/ time, for a read-write account] --> B[Schedule local reminder for that account]
  B --> C[At the chosen time]
  C --> D{Has this account published via the app today?}
  D -- yes --> E[Suppress reminder]
  D -- no --> F[Show "post your blip" notification, naming the account]
  F -->|tap| G[Switch to that account if needed, then SCR-09]
  H[Settings changed] -.-> B
  I[Account removed or downgraded to read-only] -.-> J[Cancel its reminder]
```

## Steps, branches & rules
1. **Reminders are per account, and only for read-write accounts.** A read-only account cannot
   publish, so it is never offered a reminder — the Reminders section is hidden for it, and any
   reminder it had is cancelled if its mode changes (`FLW-22`) or it is removed (`FLW-02`).
   Each read-write account keeps its own on/off state and time, so someone running two journals
   gets two reminders.
2. When enabled, schedule a **local** daily reminder at the chosen time. **No server involvement,
   and no network call at fire time** — reminders must work offline and must never depend on a
   token still being valid.
3. **Suppression is based on what the app itself has published.** At fire time, suppress the
   reminder if that account has published through this app today; otherwise show a "post your daily
   blip" notification. The app deliberately does **not** query publish eligibility to check: it is
   a network call from a background alarm, and it would fail exactly when connectivity is worst.
   - **Accepted limitation:** an entry posted from the website, or from another device, is not
     visible to this check, so the reminder can fire for a day the user has already covered. This
     is a minor annoyance rather than a correctness problem, and the user can turn reminders off.
     Do not paper over it with a speculative network call.
4. **The notification names the account** it is for, since several may be active. Tapping it
   switches to that account if it isn't the active one (`FLW-21`), then opens `SCR-09`.
5. Use a scheduling mechanism reliable enough that reminders fire without the app having been
   opened that day — re-arming only on launch is not sufficient.

## Acceptance criteria
- [ ] With reminders enabled, a local notification fires at the chosen time, with no network call.
- [ ] Reminders are offered only for read-write accounts, and each account has its own setting.
- [ ] Changing an account to read-only, or removing it, cancels its reminder.
- [ ] The reminder is suppressed if that account published through the app that day.
- [ ] Tapping the reminder switches to the named account if needed, then opens the new-entry flow.
- [ ] Reminders fire reliably without requiring the app to have been opened that day, and work
      with no connectivity.
