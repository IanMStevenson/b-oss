# b-notify-core

The small, pure part of "tell the user their unread counts rose" that more than one shell needs
(b-oss#610). Depends on `@b-oss/b-api` only; no Node, Electron, Capacitor or DOM-only APIs, so it runs
in an Electron main process and on a Cloudflare Worker alike.

- `fetchUnreadTotals(token)`: one `messages/totals/unread` call. Counts only. Nothing here may call an
  endpoint that returns recent comments or notifications, because those mark what they return as read.
  A rejected token (Blipfoto codes 50/51) throws `TokenInvalidError`; code 52 stays a plain
  `BlipfotoError` (it points at the client, not the one token).
- `decideNotifications({ totals, lastSeen, streams })`: the count-diff rule. A stream notifies when its
  total rose and the user left it on; every stream's new total is stored either way, so a switched-off
  stream never causes a catch-up burst later.
- `settle(decision, lastSeen, deliver)`: delivers in order, stops at the first failure, and returns the
  totals that are safe to store: a failed stream (and any after it) keeps its old total so the next poll
  tries again.

b-push applies the same rule to its D1 rows with its own copy; moving it onto this package is a
separate follow-up and b-push is unchanged by this package.
