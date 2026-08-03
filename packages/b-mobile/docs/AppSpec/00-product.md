# Product overview

## What Blipfoto is

Blipfoto is a **photo-journal social network**. Every member keeps a personal **journal** to
which they may publish **at most one dated photo "entry" per day**. The one-entry-per-day rule
is the defining constraint of the product — it is enforced by the server and the app must
respect it.

Members and visitors:

- **Browse** feeds of entries (recent, popular, from people they follow, nearby, their own).
- **View** a single entry: its photo, title, description, tags, view/star/favourite counts,
  and a thread of comments and replies.
- **React** to entries by **starring** (rating) and **favouriting** them.
- **Comment** on entries, with threaded replies.
- **Follow** ("subscribe to") other members' journals.
- **Search** entries and people; view geotagged entries on a **map**.
- **Earn awards** (badges) for activity and milestones.

Accounts can be **public** or **privacy-protected** (a protected account must approve follow
requests before a follower can see its entries). There is a paid **membership** tier that
unlocks extras (e.g. square thumbnail cropping); the app reads membership status but does not
sell it.

## Target users

- **Daily journallers** — the core audience: people who post one considered photo a day and
  value the constraint and the community around it.
- **Browsers / community members** — follow others, react, and comment, and may post less
  regularly.
- **Visitors (logged-out)** — can browse public content (recent / popular / nearby feeds, public
  profiles and entries) before being asked to sign in for any action that needs an account.

## Product principles

- **The daily entry is sacred.** Composing and publishing the day's entry is the headline flow;
  it must be fast, forgiving, and reliable (uploads continue in the background and recover from
  network failure).
- **Read first, gate late.** Anyone can browse public content; the app only asks for sign-in at
  the moment an account is actually required (posting, reacting, commenting, following).
- **Responsive and optimistic.** Reactions and social actions update the UI immediately and
  reconcile with the server afterward.
- **Respect privacy and safety.** Protected journals, follow-request approval, entry reporting,
  and two distinct controls — **hiding** a member so you don't see them, and **refusing** a
  follower so they don't see you — are first-class, not afterthoughts.
- **Resilient to a quirky backend.** The Blipfoto API always returns HTTP 200 and signals
  problems in an error code; the app reads the code, not the HTTP status, and handles the
  special cases (notably forced logout). See [rules.md](rules.md).

## Core domain rules (summary)

These are spelled out in [rules.md](rules.md) and the [glossary](glossary.md); the essentials:

1. **One entry per day** — publish eligibility for a given date is checked before composing.
2. **A credential is always required** — even logged-out browsing uses an app-level bearer; the
   API rejects calls with no authorization.
3. **Privacy & membership gating** — protected accounts require follow approval; some features
   (e.g. thumbnail crop) are members-only; some UI is hidden based on account state.
4. **Optimistic UI** — star/favourite, follow/unfollow, approve/refuse update immediately; errors
   surface a message but generally do not revert.
5. **Forced logout** — a specific backend error means a *token* is invalid. The app clears only
   that token, never every stored account; the user is returned to a logged-out state only if it
   was the last usable one.

## Two defining architectural choices

- **Sign-in is OAuth-only, with a read-only option and multiple accounts.** There is no in-app
  email/password login and no in-app registration; a "create account" affordance opens Blipfoto's
  registration page in the browser. Every account is signed in **read-only** (browse and read
  only — no posting or reacting) or **read-write**, and the app can hold several signed-in
  accounts at once, switching between them freely. See
  [api-appendix/auth.md](api-appendix/auth.md).
- **Notifications come from a cloud service.** Blipfoto's own push mechanism is not available to
  this app, so a separate backend service detects new activity (comments, stars, favourites,
  follows, etc.) and delivers pushes. In-app inboxes read recent activity directly. See
  [02-notifications.md](02-notifications.md).

## Visual language

This spec is deliberately silent on framework and component choices (see
[README.md](README.md)), but not on visual starting point: `b-view`, an existing Blipfoto content
browser built as part of the same wider project, is the reference for this app's look and feel.
Its colour palette, and its grid → detail navigation pattern (thumbnail grid, zoom, entry detail,
calendar date-jump) are the intended starting point for whoever designs the actual screens —
adapted for a mobile UI, not a redesign from scratch.
