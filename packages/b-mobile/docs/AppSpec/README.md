# Blipfoto App — Specification

A **technology-agnostic** specification for a new Blipfoto mobile app. It describes *what* the
app does — screens, user flows, states, and rules — without prescribing *how* it is built. The
only technology it names deliberately is the **Blipfoto API** (endpoints, data model, auth,
error codes), which any implementation must talk to.

It describes the app as it is intended to be, not by reference to anything that came before.

> Status: **v1.8** — foundation docs, the API appendix, 28 screen specs (`screens/`), and 21 flow
> specs (`flows/`) are authored, including the read-only/read-write sign-in modes and
> multi-account support. Ready for review and refinement, and as input for Claude Design /
> Claude Code. (Screen IDs SCR-26/27/28 and FLW-19 are intentionally unused; the numbering gaps
> are deliberate, not omissions.) v1.3 (2026-08-02) added non-functional requirements
> (accessibility, localisation, platform support, image/performance, crash reporting, analytics,
> privacy policy, token backup) to [rules.md](rules.md), [api-appendix/auth.md](api-appendix/auth.md),
> and [screens/SCR-25-settings.md](screens/SCR-25-settings.md). v1.4 (2026-08-02) separated
> **hiding a member** (`SCR-31`, device-local — you stop seeing them) from **refusing a follower**
> (`SCR-21`, server-side — they stop seeing you), and added screen-size, orientation and
> cross-platform requirements. v1.5 (2026-08-02) resolved the caching design task: only images
> are cached (app-wide, 15 minutes, disk-persisted); all data is always fetched fresh — see
> [rules.md](rules.md). v1.6 (2026-08-02) applied the `0208review.md` findings: removing a follower
> is now correctly distinguished from refusing a follow request, the inboxes follow the caching
> rule, comment editing is reinstated, and the token model, error codes, permissions and reminders
> are corrected — see that review for the full list. **v1.7 (2026-08-03)** reworked notifications
> around a platform constraint established late: every Blipfoto call that returns notification or
> comment content also marks it read, so the cloud service can poll counts only. A push now reports
> which unread total rose rather than what happened, tapping one opens an inbox rather than an item,
> and hidden-member suppression on push is recorded as an accepted limitation — exact in the
> comments inbox, best-effort in the notifications inbox, and unnecessary on a push, which names
> nobody. The hidden list stays entirely device-local. Also: notification text is supplied
> pre-composed and is no longer the app's to write, `SCR-06` clears comment-unread, `SCR-11`'s tag
> set is corrected to the five that exist, and the minimum platform version is pinned. See
> [rules.md](rules.md), [glossary.md](glossary.md), [02-notifications.md](02-notifications.md),
> `FLW-10`, `FLW-15`, `FLW-16`, `SCR-06`, `SCR-11`, `SCR-23`, `SCR-24`, and the API appendix.
>
> **No behaviour in this spec is left as an open design task.** The consolidated copy deck is done
> — [`TextStrings.csv`](TextStrings.csv), reviewed and accepted as a first pass 2026-08-03; see the
> workspace `README.md` and `DECISIONS-LOG.md` (TODO F). The app's implementation architecture is
> now specified —
> [`../ImplementationSpec/app-architecture.md`](../ImplementationSpec/app-architecture.md).
>
> **v1.8 (2026-08-03)** applied the `0308review.md` findings: `SCR-31`'s "offer Refuse" corrected to
> "Remove them as a follower" (`SCR-19` has no pending request there to refuse); `SCR-21`'s restore-
> access action settled as an immediate toast rather than the copy deck's contradicting confirm
> dialog; and a **Delete my account** link added to `SCR-29`, explicit that it is device-level and
> not scoped to any stored account, with the multi-account consequence of web-side deletion (a stale
> account fails like an ordinary forced logout, with no dedicated "deleted" signal) recorded in
> `rules.md`. See [rules.md](rules.md), [`screens/SCR-31-hidden-members.md`](screens/SCR-31-hidden-members.md),
> [`screens/SCR-21-refused-followers.md`](screens/SCR-21-refused-followers.md),
> [`screens/SCR-29-help-and-info.md`](screens/SCR-29-help-and-info.md), and `TextStrings.csv`.

---

## How to read this spec

Read in this order:

1. **[00-product.md](00-product.md)** — what Blipfoto is, who it's for, the core rules.
2. **[01-information-architecture.md](01-information-architecture.md)** — the navigation map and
   the complete, ID'd inventory of screens and flows with priority.
3. **[02-notifications.md](02-notifications.md)** — how notifications work, and why they involve
   a service outside Blipfoto.
4. **[glossary.md](glossary.md)** — domain vocabulary (Entry, Journal, Comment, Profile…).
5. **[rules.md](rules.md)** — cross-cutting behaviour every screen/flow inherits.
6. **[screens/](screens/)** — one file per screen (`SCR-NN-*.md`).
7. **[flows/](flows/)** — one file per user journey (`FLW-NN-*.md`).
8. **[api-appendix/](api-appendix/)** — the one place wire/technology detail lives.
9. **[TextStrings.csv](TextStrings.csv)** — the copy deck: every user-facing string (empty/error
   states, confirmations, validation messages, the upgrade prompt, push/reminder text), one row
   per string with a stable key, its screen/flow, the triggering situation, constraints, and a
   best-first-guess draft. First pass — for review, not final; see the workspace `README.md`
   (TODO F).

## How to use this spec as a build/design input

- Each **screen** and **flow** has a stable ID (`SCR-06`, `FLW-12`) and is self-contained:
  purpose, layout, components, data, states, actions, navigation, API touchpoints, and
  acceptance criteria. Hand a single file to Claude Design or Claude Code and it should be
  actionable without further questions.
- Cross-references use IDs, so "from `SCR-06 Entry Detail`, tapping a tag opens
  `SCR-05 Tag Entries`" always resolves.
- Behaviour is described in product terms. Implementation nouns (frameworks, threading,
  storage, push transport) appear **only** in `api-appendix/`.

## Conventions

**Priority** (MoSCoW) — every screen and flow carries one:

| Tag | Meaning |
|---|---|
| `[Must]` | Core; the app is pointless without it. |
| `[Should]` | Valuable, but the app still works without it. |
| `[Could]` | Marginal; include only if cheap. |

These are **informational, not a build boundary.** The current plan is to build the whole app in
one pass rather than in priority-ordered milestones, so the tags express relative importance
rather than a shipping sequence. Treat them as a guide to what to get right first, not as
permission to omit anything.

## Out of scope

- The **cloud notification service** that polls Blipfoto and pushes to the app — specified in
  [`../ImplementationSpec/notification-service.md`](../ImplementationSpec/notification-service.md);
  referenced here only as a dependency.
- Framework / UI-library choices, component design, visual styling, and the app's implementation
  architecture — see [`../ImplementationSpec/`](../ImplementationSpec/).
- *Answering* the open API questions — they are **captured** in
  [api-appendix/open-questions.md](api-appendix/open-questions.md), not resolved here.
