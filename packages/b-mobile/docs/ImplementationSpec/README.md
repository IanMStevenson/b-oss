# Blipfoto App — Implementation Specification

The **technology-specific** counterpart to [`AppSpec/`](../AppSpec/).

`AppSpec/` describes *what the app does* and is deliberately silent on frameworks, hosting and
architecture. This folder is where that silence is broken: platform choice, package reuse, and the
design of the one backend component the app depends on.

Read `AppSpec/` first. Nothing here restates behaviour — where behaviour matters, these documents
cross-reference the screen, flow or rule that defines it.

---

## Contents

| Document | What it settles | Status |
|---|---|---|
| [`app-architecture.md`](app-architecture.md) | **How the app itself is built** — package layout in `b-oss`, runtime stack, navigation, state, networking, secure token storage, the upload queue, the image cache, push, maps, BBCode, background scheduling, and the Android project | v1.3; build-ready, **no open questions** |
| [`platform-and-reuse.md`](platform-and-reuse.md) | Capacitor as the platform; what is reused from `b-api` and `b-view`, and the changes each needs first | Decided; **partly superseded** by `app-architecture.md` — see below |
| [`notification-service.md`](notification-service.md) | The cloud notification service: hosting, data model, polling design, registration contract, failure handling | Build-ready, **no open questions**. Polling rebuilt 2026-08-03 around counts only, since every content-returning endpoint marks it read; token-at-rest encryption also decided 2026-08-03 (single Worker secret, AES-256-GCM) |
| [`b-api-updates.md`](b-api-updates.md) | Corrections `b-api`'s published docs need, so its docs and this spec stop disagreeing | Checklist; not blocking |

## Reading order

`app-architecture.md` is the entry point for anyone building the app; `platform-and-reuse.md` is
best read as the decision record that precedes it. Where the two disagree, **`app-architecture.md`
wins** — it supersedes that document's "what this does not cover" section, its multipart-spike
preference order, and its deferral of a shared design-tokens package.

`app-architecture.md` §21 lists everything its decisions change elsewhere, in `b-oss` code, in this
folder, and in `AppSpec/`. That list is the outstanding work; none of it has been applied.

## Relationship to `AppSpec/`

- Anything naming a framework, library, hosting provider, or wire-level mechanism belongs **here**.
- Anything describing screens, flows, states, rules or user-facing behaviour belongs in
  **`AppSpec/`**.
- Where the two touch — the notification service's contract and the app flows that call it — the
  service contract is defined here and the app-side obligations are defined in
  [`AppSpec/02-notifications.md`](../AppSpec/02-notifications.md), each pointing at the other.
