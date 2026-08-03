# FLW-11 — Report an entry   [Must]

**Trigger:** `SCR-06 Entry Detail` overflow → Report (the entry); or the **Report** action on an
individual comment (`SCR-06`, `SCR-24`).
**Screens:** `SCR-06` / `SCR-24` → `SCR-16 Report Entry` → back.

> Entries and comments are reported through the **same** mechanism — `entry/report`, with the
> comment identified in the note. Reporting escalates to Blipfoto's moderators and acts for
> everyone; hiding (`FLW-10`) is personal and affects only you.

## Diagram
```mermaid
flowchart TD
  A[Overflow -> Report] --> S{Signed in?}
  S -- no --> S2[FLW-01 Sign in read-write, then resume]
  S2 --> RW
  S -- yes --> RW{Read-write?}
  RW -- no --> RW2[Upgrade prompt, per rules.md]
  RW -- yes --> B[SCR-16 select reasons + optional comment]
  B -->|Send, no reason| C[Show "select a reason", stay]
  B -->|Send, >=1 reason| D[Submit report]
  D --> E[Return to entry]
  B -->|Cancel| E
```

## Steps, branches & rules
1. **Account-gated, then read-write-gated**, in that order and for the same reason as every other
   write flow: an anonymous user goes to `FLW-01` (which always signs in read-write) and resumes
   here — they must never be shown the read-only upgrade prompt, which offers to repair an account
   they don't have. A signed-in but read-only account sees the upgrade prompt (`rules.md`) instead
   of `SCR-16` opening; reporting is a write (`entry/report`).
2. Open `SCR-16`; choose ≥1 reason from the five server-defined reasons (explicit content /
   inappropriate content / copyright / promotional / incorrect date) and an optional comment.
3. **Send** requires at least one reason; otherwise prompt and stay.
4. On send, submit the report (fire-and-forget) and return to the caller.
5. **Reporting a comment** takes the same path, with the note pre-seeded to identify the comment.
6. After a successful report, offer **Hide** as a separate action — reporting someone and wanting
   to stop seeing them usually go together, but they are different decisions.
7. On one's **own** entry, an unwanted comment can simply be **deleted** (`SCR-06`) — immediate,
   and no moderator involvement. Reporting remains available for anything warranting wider
   action.

## Acceptance criteria
- [ ] Send is blocked with no reason selected.
- [ ] With ≥1 reason, the report submits and the user returns to the entry.
- [ ] An optional note is included when provided.
- [ ] A comment can be reported, and the resulting report identifies which comment.
- [ ] After a successful report, Hide is offered as a separate action.
- [ ] An anonymous user is routed through sign-in first, not to the read-only upgrade prompt.
- [ ] A signed-in, read-only account sees the upgrade prompt instead of `SCR-16` ever opening.
