# SCR-20 — Pending Requests   [Must]

**Purpose:** For a protected journal, approve or refuse follow requests — deciding who may see
the journal.

> Refusing stops **them** seeing **you**. It is separate from hiding a member (`SCR-31`), which
> stops **you** seeing **them**. See [rules.md](../rules.md).

**Reached from:** `SCR-17 My Profile` → Followers (when the account is protected); a follow-request
push target.
**Leads to:** `SCR-18 User Profile` (tap a requester). Account-gated.

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Follow requests                   |
|  [av]  alice    [Approve] [Refuse]   |
|  [av]  bob      [Approve] [Refuse]   |
|             (load more on scroll)     |
+--------------------------------------+
```

## Components & data shown
- A list of requesters (avatar + username), each with **Approve** and **Refuse** actions. Paged.

## States
- **Loading / Loaded / Empty** ("No pending requests") **/ Error** (per [rules.md](../rules.md)).

## Actions & rules
- **Approve and Refuse are writes, gated on read-write** — a read-only account sees the upgrade
  prompt (`rules.md`, `FLW-09`) instead of either action; the list and viewing a requester's
  profile stay available read-only.
- **Approve** → optimistic removal from the list; the requester becomes a follower.
- **Refuse** → confirm, then optimistic removal. They lose access to the journal and cannot simply
  request again. The confirmation states both halves: *they won't be able to see your journal* /
  *this doesn't hide their entries from you*. Reversible from `SCR-21 Refused Followers`.
- **After refusing, offer Hide** as a separate action (`FLW-10`) — refusing alone does not stop
  the user seeing that member's entries.
- Errors show a message.
- **Tap a requester** → `SCR-18`.
- Only relevant for protected journals (a public journal has no pending requests).

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `users/requests/pending` (GET list; PUT approve; DELETE refuse).

## Acceptance criteria
- [ ] Given pending requests, they list with Approve/Refuse actions.
- [ ] Given Approve, the row is removed and the requester becomes a follower.
- [ ] Given Refuse, the row is removed after a confirmation stating both effect and non-effect,
      and the member appears in `SCR-21 Refused Followers`.
- [ ] Given Refuse, Hide is offered afterwards as a separate action, never applied automatically.
- [ ] Given no requests, an empty state is shown.
- [ ] Given a tap on a requester, their profile opens.
- [ ] Given a signed-in, read-only account, Approve/Refuse show the upgrade prompt instead of
      acting; the list and profile navigation remain available.
