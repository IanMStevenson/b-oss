# Notifications architecture

Notifications are the one part of the app that does not talk only to Blipfoto. This document
states the arrangement once; screens and flows that touch notifications reference it rather than
re-explaining.

> **Design status:** settled, 2026-08-02 — architecture, contract, and app-side UX are all
> specified. See [`../ImplementationSpec/notification-service.md`](../ImplementationSpec/notification-service.md)
> for the service; this document and the flows/screens it cross-references for the app.

---

## The arrangement

Blipfoto's own push mechanism is not available to this app. Notifications are therefore delivered
by a **separate cloud service**, out of scope for this spec — see
[`../ImplementationSpec/notification-service.md`](../ImplementationSpec/notification-service.md) for its architecture and contract:

- The service holds a **read-only** Blipfoto token for the user, granted explicitly at sign-in
  (see [api-appendix/auth.md](api-appendix/auth.md) — this is why "notifications on" is part of
  the sign-in mode, and why a read-write account wanting notifications needs a second,
  separately-visible authorization).
- The service **polls Blipfoto** for new activity on the user's behalf, using that token.
- The service **delivers a push to the device**. The app registers for push **with the service**,
  never with Blipfoto.

The read token is the security boundary: a service that polls on the user's behalf must never be
able to post, delete, follow, or change anything. That constraint drives the whole two-token
model.

## What the app is responsible for

- **Registering** with the cloud service when an account enables notifications, handing over the
  read token, device token, and platform (`FLW-20`).
- **Deregistering** when notifications are turned off or the account is removed (`FLW-22`,
  `FLW-02`) — a real `DELETE` against the service, not just a local token drop. See
  [`../ImplementationSpec/notification-service.md`](../ImplementationSpec/notification-service.md) for the call.
- **Re-registering the device token** whenever the OS issues a new one (FCM token rotation) —
  otherwise pushes silently stop reaching the device. Not tied to any existing flow; a new
  responsibility, see `../ImplementationSpec/notification-service.md`.
- **Pinging the service to refresh preferences** after a successful Notifications-section save in
  `SCR-25`/`FLW-17`, so an in-app preference change takes effect immediately rather than waiting
  for the service's own periodic refresh.
- **Settling the OS notification permission** before authorizing a read token when notifications are
  enabled (`FLW-20`), and **checking it, plus the service's registration health, on every app
  launch** (`FLW-16`) — either failing is resolved the same way the corresponding push/decision
  would be, with nothing remembered about a prior preference.
- **Receiving** pushes and routing them to the right screen, including the service's
  `reauth-required` system alert (`FLW-16`, `FLW-02`).
- **Displaying** recent activity and unread counts in the in-app inboxes (`SCR-23`, `SCR-24`),
  which read Blipfoto's `messages/*` endpoints directly — see
  [api-appendix/endpoints.md](api-appendix/endpoints.md).

## Behaviour the app must provide

- The user receives a push when someone comments on, stars, or favourites their entry, follows
  them or requests to follow, or when they hit a milestone or earn an award — subject to their
  notification preferences (`SCR-25`, Notifications section).
- Tapping a push opens the relevant target: an entry (`SCR-06`), a profile (`SCR-18`), the
  pending-requests screen (`SCR-20`), or awards (`SCR-22`).
- Unread counts appear as badges, clear when the relevant inbox is opened, and refresh when a push
  arrives.
- Notifications degrade safely: an unrecognised push target is a no-op, and the app remains fully
  usable with notifications off or the service unreachable.

## Design questions — all resolved 2026-08-02

Kept here as a record of what was open and where each landed, rather than as a live list —
nothing below is still pending.

1. **The service contract** — register, update, refresh-preferences, deregister, all specified in
   [`../ImplementationSpec/notification-service.md`](../ImplementationSpec/notification-service.md).
2. **What a push can carry** — **revised 2026-08-03.** This was resolved as "type + target +
   causing member", on the assumption that the service could poll for that detail. It cannot: every
   Blipfoto call returning notification or comment content also marks it read, so a service that
   fetched detail would clear the user's badge before they saw it, here and on the website. **A push
   therefore reports only which unread total rose and by how much**, and tapping it opens that
   inbox. See [api-appendix/data-model.md](api-appendix/data-model.md) (Notification),
   [api-appendix/endpoints.md](api-appendix/endpoints.md) and `FLW-16`.
3. **Who owns preferences** — the service reads Blipfoto's preferences itself (app-triggered
   immediate refresh on an in-app change; hourly batch refresh otherwise, up to ~59 minutes stale
   for a change made elsewhere). The app never pushes preference values to the service.
4. **Stale-token visibility** — the service's `reauth-required` push, plus an app-launch backstop
   check, both feed `FLW-02`'s existing scoped re-auth handling; surfaced on `SCR-30` with a
   reason label. Never narrows write access (`rules.md`).
5. **`SCR-25`'s notifications display** — an active master switch; the push toggle group only
   renders when it's on.
6. **The OS notification permission** — settled *before* the read-token authorization when enabling
   notifications (`FLW-20`); refused, or found missing on a later launch check, is treated
   identically to the user turning the master switch off (`FLW-22`) — no separate "blocked" state,
   nothing remembered. Where the platform will no longer prompt, the app offers system settings
   instead of requesting into silence (`rules.md`).
7. **Polling interval** — user-facing, an "Advanced" control on `SCR-25`, floor of 5 minutes
   enforced server-side.

**Affected items:** `SCR-23`, `SCR-25` (Notifications), `SCR-30`, `FLW-02`, `FLW-15`, `FLW-16`,
`FLW-17`, `FLW-20`, `FLW-22`, and [api-appendix/auth.md](api-appendix/auth.md).
