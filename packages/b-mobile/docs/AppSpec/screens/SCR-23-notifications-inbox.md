# SCR-23 — Notifications Inbox   [Must]

**Purpose:** Show recent notifications (follows, follow-requests, stars, favourites, milestones,
awards, etc.) with an unread count.

**Reached from:** primary navigation / app-bar (with an unread badge); a push notification.
**Leads to:** `SCR-06 Entry Detail`, `SCR-18 User Profile`, or `SCR-20 Pending Requests`,
depending on the notification's target. Account-gated.

> Notifications are **delivered** by the cloud service; the inbox **content** is recent activity
> read from the Blipfoto `messages` endpoints. See
> [02-notifications.md](../02-notifications.md).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  Notifications                (av) |
|  [img] alice started following you   |  tap -> profile / request
|  [img] your entry hit 50 stars       |  tap -> entry
|  [img] you earned the "100 days" …   |  tap -> awards
|        (pull to refresh)              |
+--------------------------------------+
```

## Components & data shown
- A list of notifications, each with its **server-rendered text**, optional image, and a tap target.
  The text arrives already composed and formatted — the app displays it rather than assembling a
  sentence from parts, so notification wording is not the app's to write.
- **No per-item timestamps and no per-item read/unread marking.** The platform supplies neither;
  items arrive newest-first and that ordering is all there is. Don't design a UI that implies more.
- **Notifications caused by a hidden member are not listed, as far as they can be recognised** —
  see below, and [rules.md](../rules.md). The unread total is a server figure and is not
  recalculated to match; a brief discrepancy between badge and visible items is accepted rather
  than papered over.
- An unread count, shown as a badge on the inbox entry point.

### Hidden-member suppression here is best-effort
A notification does not say who caused it. It is a block of pre-rendered text, and the member
responsible appears only *within* that text, as a link to their profile. So the app recognises them
from the text — reliable in the ordinary case, and not guaranteeable:
- Where the wording or its links change, recognition can fail **silently**, and nothing in the app
  would detect that.
- Notifications with no member behind them at all (awards, milestones, platform announcements) are
  never suppressed, correctly — there is nobody to suppress.

This is deliberately weaker than the guarantee everywhere else, and it is the right trade: the
alternative is hiding working on every surface except this one. What leaks in the failure case is a
line of text, never a hidden member's photograph or comment. See `SCR-24`, where the same feature
works exactly.

### Not everything here is someone's activity
Blipfoto's own announcements and bulk messages arrive in this same list, and **carry nothing that
distinguishes them** from a follow or a star. They render as ordinary notifications. Attempting to
detect and restyle them would rest on guesswork, so the app doesn't try.

## States
- **Loading / Loaded / Empty** ("No notifications yet") **/ Error** (per [rules.md](../rules.md)).
  Items older than roughly **two weeks** no longer exist, so the list has a natural floor and
  paging back beyond it returns nothing — not an error state, just the end.
  The list is **fetched fresh on every visit** — no cached items are shown, per the caching rule in
  [rules.md](../rules.md), so the inbox opens in its loading state.

## Actions & rules
- **Open inbox** → fetch recent notifications. **Fetching is itself what marks them read** — there
  is no separate call to make, and no way to read the list without clearing. Clear the badge
  locally at the same time so the two agree.
- **Pull-to-refresh** → fetch the latest (use a real cursor so only new items are fetched).
- **Tap a notification** → open its target. Three cases, in order:
  - an **entry** or a **profile** — the common ones, both reliably identifiable;
  - a **follow request** — a special case worth stating, because such a notification points at the
    *requester's profile*, not at the requests screen. The app should send it to `SCR-20 Pending
    Requests` instead, which is where the user can act on it;
  - **anything else** (awards, announcements) — open the notification's link in the device browser.
    Not a no-op: a tapped notification that appears to do nothing reads as broken.
- A new push refreshes the unread count.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `messages/notifications/recent` (with a `since_id` cursor) — **this call is also what marks the
  returned items read**; there is no separate call to make.
- `messages/totals/unread` (unread count).

## Acceptance criteria
- [ ] Opening the inbox fetches fresh, showing a loading state rather than a stale list.
- [ ] Given the inbox is opened, the unread badge clears and stays cleared after a refresh
      (the read state persisted server-side).
- [ ] Given a notification about an entry or a profile, tapping it opens that entry or profile.
- [ ] Given a follow-request notification, tapping it opens `SCR-20`, not the requester's profile.
- [ ] Given a notification whose target can't be determined, tapping it opens its link in the
      device browser rather than doing nothing.
- [ ] Given none, an empty state is shown.
- [ ] Given a hidden member, notifications caused by them are suppressed wherever they can be
      recognised, and their non-suppression in an unrecognised case is a known limitation rather
      than a defect.
- [ ] Notification text is displayed as supplied, not reassembled by the app.
- [ ] Given a new push arrives, the unread count updates.
