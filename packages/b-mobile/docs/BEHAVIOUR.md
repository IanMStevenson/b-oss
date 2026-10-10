# b-mobile — current behaviour

What the app does today, derived from reading `packages/b-mobile/src` as of 2026-10-08, to help
agents fix and maintain the working app. If this file and the code disagree, the code wins: fix
this file. Design: [ImplementationSpec/app-architecture.md](ImplementationSpec/app-architecture.md).
Known Blipfoto API limits: [AppLimitations.md](AppLimitations.md). Paths are relative to `src/`.

## Navigation shell (`app/AppShell.tsx`, `app/routes/AppRoutes.tsx`)

- One `IonMenu` (header button only; edge-swipe off) and one router outlet; in-screen tabs are
  component state, not routes. `/` redirects to `/browse`; launch lands on Browse unless a deep
  link, share or push tap routes elsewhere.
- Menu: account block (→ Accounts) · New entry (read-write only) · Browse · Search · Map · My
  profile, Notifications, Comments (signed in; inboxes show unread badges) · Settings · Help &
  about · Accounts · Hidden members (signed in) · Sign in (signed out).
- No view stack: leaving a screen unmounts it and Back rebuilds it. `data/resumeCache.ts` (memory,
  10-minute TTL) restores Browse's tab and grid page; `useScrollResume` restores entry scroll.
- The route table is keyed by the active account id: switching account rebuilds the current screen.
- Android Back on `/browse` does nothing (no exit); an open menu or overlay closes first
  (`app/hardwareBack.ts`).
- Header account indicator: only with 2+ stored accounts. Tap opens the switcher overlay
  (`app/AccountSwitcherOverlay.tsx`): tap to switch instantly; a needs-sign-in account (red) goes to
  `/accounts?reauth=<id>`; Manage accounts row.

## Screens

- **Browse**: 7 tabs — Recent, Following\*, Me\*, Popular, Milestones, New Blippers, Nearby
  (\*signed in). Only the active tab is mounted; choosing a tab starts it at page 1. Recent has a
  fixed 900-entry total; Me shows a calendar and the profile's entry total; Nearby needs location
  ("Allow location" button if refused or no fix).
- **Search**: Entries and People tabs, debounced. **Tag entries**: one paged grid. **Map**
  (MapLibre, lazy): one page per debounced viewport; `?entry=` opens its popup; my-location button.
- **Entry**: b-view `EntryDetail` plus app slots. Prev/next replaces the route. Star and Favourite
  are one-way (no unstar). Inline comment/reply/edit composers, with unsent text kept in memory per
  target (`data/commentDrafts.ts`). Reply/Edit/Delete per comment follow the API's `actions` flags;
  Report on others' comments. Author block with Follow/Following/Requested. Others' entries: Report
  and Hide. Own entries: Download photo (read-only too; own journal only, `flows/downloadFlow.ts`),
  Edit and Delete (read-write). Tags → `/tag`, location → `/map?entry=`, fullscreen button or
  double-tap → `/photo`. Calendar and ±1-year history need a signed-in account.
- **Photo**: b-view Lightbox, zoom/pan, retry on image error. **New entry**: Take / Choose photo, or a shared photo.
- **Compose details**, **Location picker**: see Compose. **Edit entry**: title, description, tags,
  location, replace photo, Delete entry; no date field; Save enqueues and returns to the entry.
- **Biography editor** (`/compose/description`, despite the path): from Settings → Profile.
- **Uploads**: Waiting / Uploading… / Uploaded / Failed (+ error); indeterminate bar while
  uploading; tap an uploaded item to open it. A failed item has Retry (back to Waiting, fresh
  attempt count) and Remove (asks first; drops it and its copied photo).
- **Report**: five reasons (at least one required) plus note. A comment report uses the same
  endpoint with a prefilled note `<user>'s comment: "<excerpt>"`. Afterwards offers to hide.
- **Profile** (`/me`, `/user/:u`, one component): tabs About, Entries, Faves, Followers, Following.
  Stat row: entries; Follow/Following/Request sent (others) or Pending requests (own, protected
  journal); Awards. Hide/Unhide for others.
- **Followers/Following**: people list; Remove follower on your own followers. **Pending
  requests**: Approve/Refuse, then offers to hide. **Refused followers**: Allow, immediate.
- **Awards**: whole catalogue from the API; earned = `added_stamp !== null`; `secret` → "Secret".
- **Settings**: hub reachable signed out. Blipfoto account settings: General, Journal, Profile,
  Notifications (all disabled signed out), Refused followers (protected journal only). App
  settings: Accounts, General (daily reminder, confirm-account toggle, account picture style, open
  blipfoto.com links in app), Hidden members, Browsing (zoom bar, pagination, margins, photo size).
  Server-backed sections use Save/Cancel; device settings apply at once.
- **Help & about**: static (icon guide, safety & privacy, licences). **Hidden members**: Unhide.
- **Accounts**: list, tap to switch, Add account (→ `/sign-in`); row menu: switch read-only/
  read-write, Disconnect account, Delete account (explains, then opens blipfoto.com settings —
  there is no delete API). Rows show mode and notification status (on / off / needs sign-in).

## Read-only mode and write gating

- The only write test is `useCanWrite()`: the active account's granted scope is `read,write`
  (`state/accountsStore.ts`). The scope comes from `GET oauth/token`, never the requested scope.
- `WriteGuardRoute` wraps `/compose`, `/entry/:id/edit`, `/entry/:id/report`. Signed out: runs a
  read-write sign-in, then shows the screen (cancel → Back). Read-only: upgrade prompt "This
  account is read-only" — Switch to read-write goes to `/accounts`, Not now goes Back.
- Entry page: star, favourite, comment, follow, Edit and Delete are hidden for a read-only
  account. Signed out, tapping one signs in read-write and then completes the action.
- Profile Follow, request/refused actions and Remove follower show for read-only accounts but
  open the upgrade prompt. Settings sections show values disabled: "This account is read-only."
- `/compose/details`, `/compose/location`, `/compose/description` are not route-guarded.
- Optional "Confirm account before star, favourite or comment" (off by default; needs 2+
  accounts) shows an account picker before those three actions (`flows/useAccountConfirmGate.tsx`).
- Comments off on a journal (`actions.comment === 0`): "Comments are turned off for this journal."

## Hidden members (`state/hiddenMembersStore.ts`)

- Device-local, per account, keyed by username; never sent anywhere; none when signed out.
- Grids: placeholder tile (no title, user or image). Entry: "You've hidden this member." + Unhide.
  Their comments and reply subtrees are removed. Comments inbox: exact filter. Notifications inbox:
  best-effort, from profile links in `content_html`. Map: no marker. People lists: "(Hidden)".

## Compose and upload (`flows/composeFlow.ts`, `flows/uploadQueueRunner.ts`)

- Photo check (`data/photoValidation.ts`): JPEG or PNG, one edge ≥ 600 px, 1 KB–20 MB. Avatars:
  one edge ≥ 300 px, picked file ≤ 40 MB (cropped and re-encoded before upload).
- Date defaults to the photo's creation date, else today. Publish is enabled only when
  `journal/day` says the date is free; otherwise "You already have an entry for that day." (with
  View that entry), "That date is in the future.", "That date is too far in the past." or "You
  can't publish an entry for that date." (`data/journal.ts`).
- Title max 50, tags max 255, inline BBCode description. Crop only for members
  (`details.member === 1`), sent as `thumbnail_crop`. "Add to map" opens the location picker.
  Back with changes asks "Discard this entry?". Publish enqueues and goes to `/uploads`.
- Enqueue copies the photo into app storage. The runner does one item at a time with that item's
  own account token. Transport errors retry after 5s, 15s, 45s, 2m, 5m and fail after 6 attempts;
  token invalid → app-token forced logout, item failed "Signed out — please sign in again and
  retry."; other errors fail with the mapped message. Success deletes the copy and reschedules the
  account's reminder. The queue is saved to prefs; at launch `AppShell` loads it, then starts the
  runner, which resets items stuck `uploading` to `waiting` and resumes them.
- Share intent (`platform/shareIntent.ts`): `AppShell` reads the shared image once, caches it and
  opens `/compose`; New entry starts a draft from it once the write gate has passed.

## Sign-in and accounts (`flows/accountsFlow.ts`, `flows/oauthRound.ts`)

- OAuth implicit grant to `bmobile://oauth/`, fresh `state` per round (mismatch = silent cancel).
- Gated sign-in: read-write, no notifications, system browser. `/sign-in`: Read-write (default)
  or Read-only; Get notifications (disabled without push support); Use browser to sign in (on for
  the first account, off once one exists; off = in-app WebView with cookies cleared, which always
  asks for a password). First-run explainer shown once.
- Read-write + notifications needs a second, read-only round, preceded by an explainer; skipping
  or cancelling leaves the account signed in without notifications. Read-only reuses one token.
- Every round for an existing account must return the same username (case-insensitive). Otherwise
  the token is revoked (unless already held), nothing is stored, and a mismatch alert offers a retry
  in the in-app browser. Later rounds for an account default to the in-app browser if it has ever
  signed in through it (`usesInAppBrowser`, b-oss#375), or if there are 2+ accounts.
- Switching is local and instant; an account without an app token goes to reauth instead.
  Disconnect revokes tokens, deregisters push, cancels its reminder and queued uploads; the first
  remaining account (or anonymous) becomes active.
- Forced logout clears one token, never the account. Code 50/51 on any app-token call triggers it
  (`data/client.ts`); if the active account becomes unusable, the next usable one (or anonymous)
  becomes active. Sign in again (`reauthorizeAccount`) checks the app token, re-runs the app round
  at the remembered scope, then the notifications round if they were on.

## Notifications (`flows/pushFlow.ts`, `flows/reminderFlow.ts`)

- b-push, per account, two streams (New comments, New notifications) in Settings → Notifications;
  no master switch. Turning the first on: permission check (before any OAuth), read round if
  read-write, registration. Changing one while the other is on is a PATCH; turning the last off
  deregisters (confirm first for read-write). Blipfoto's six `feed_*` settings save separately; its
  `push_*` settings are never read or written (not available to our app type). The check-interval
  control is hidden (`SHOW_POLLING_INTERVAL = false`).
- On launch and every resume, per account with notifications: OS permission not granted → turned
  off; b-push status `read-token-invalid` → service token forced out ("needs sign-in"). FCM token
  rotation is sent to every registration.
- Foreground push refreshes unread counts; `reauth-required` forces out the service token. Tap:
  switch to that account, open `/comments` or `/notifications`; unknown or needs-reauth account →
  `/accounts`; `reauth-required` → `/accounts?reauth=<id>`. Unread counts are memory only,
  refreshed on launch, account switch and push, and zeroed on opening an inbox.
- Inboxes: the API marks items read when fetched (comments: all of them), so "new" rows come from
  the first response only; pull-to-refresh fetches newer items only. Notification tap → entry,
  profile, follow requests, or external link. Comment rows: Reply (opens the entry with the reply
  composer open) and a menu with Delete (if allowed), Report, Hide this member.
- Daily reminder: local notification per read-write account (on/off + time). A publish or edit
  through the queue skips today. Cancelled on removal or switch to read-only. Tap switches to that
  account if possible and opens `/compose`.

## Errors and network (`data/errors.ts`, `data/client.ts`)

- `mapApiError`: network → `transport`; HTTP error → "Blipfoto had a server error (N)…" /
  "…unexpected response (N)"; 50/51 → `forced-logout`; 11 → "Please wait a moment and try
  again."; 16 → upgrade-prompt text; 101, 102, 104, 202, 205, 240, 250–252, 303–306, 516/517,
  525–528 → copy-deck text (`strings/deck.ts` `ERR.*`); otherwise the API's own message.
- Star 221 / favourite 222 ("already") count as success; 223 → daily favourite limit. Optimistic
  star/favourite/follow roll back on failure. Entry load maps 104 and 202 to their own messages.
- Feeds show the raw error message plus Retry; no offline mode or banner. Upload failures add
  detail (HTTP status and body start, 413 "too large", network cause).
- Rate limit: public browsing (Recent, Popular, Milestones, New Blippers, Nearby, tag, entry and
  people search, map) retries once with the anonymous app credential; identity-bound calls don't.
- Images are cached on disk by URL for 15 minutes (`platform/imageCache.ts`); data is not cached.
- Deep links (`flows/deepLinkResolver.ts`): `bmobile://entry/<id>`, `bmobile://user/<name>`; and
  blipfoto.com entry, profile and follow-request URLs only when "Open blipfoto.com links in this
  app" is on (default off).

## ID index

Source comments cite these ids; the AppSpec that defined them has been removed.

| SCR | Screen, route                                          | SCR   | Screen, route                                          |
| --- | ------------------------------------------------------ | ----- | ------------------------------------------------------ |
| 01  | Sign in `/sign-in`                                     | 16    | Report entry/comment `/entry/:id/report`               |
| 02  | Browse `/browse`                                       | 17/18 | My / user profile `/me`, `/user/:username`             |
| 03  | Search `/search`                                       | 19    | Followers/Following `/user/:u/followers`, `/following` |
| 04  | Map `/map`                                             | 20    | Pending requests `/me/requests`                        |
| 05  | Tag entries `/tag/:tag`                                | 21    | Refused followers `/me/refused`                        |
| 06  | Entry detail `/entry/:id`                              | 22    | Awards `/me/awards`, `/user/:u/awards`                 |
| 07  | Full-screen photo `/entry/:id/photo`                   | 23    | Notifications inbox `/notifications`                   |
| 08  | Retired (was Entry metadata; EXIF is inline on SCR-06) | 24    | Comments inbox `/comments`                             |
| 09  | New entry `/compose`                                   | 25    | Settings `/settings[/:section]`                        |
| 10  | Compose details `/compose/details`                     | 29    | Help & about `/help[/:section]`                        |
| 11  | Biography editor `/compose/description`                | 30    | Accounts `/accounts`                                   |
| 12  | Location picker `/compose/location`                    | 31    | Hidden members `/hidden`                               |
| 13  | Edit entry `/entry/:id/edit`                           | 15    | Retired (was New comment; now inline on SCR-06)        |
| 14  | Upload progress `/uploads`                             | 26–28 | Do not exist                                           |

| FLW | Flow — main code                                                            | FLW | Flow — main code                                                     |
| --- | --------------------------------------------------------------------------- | --- | -------------------------------------------------------------------- |
| 01  | Gated sign-in — `signInGated`, `WriteGuardRoute`                            | 12  | Compose/publish — `composeFlow.ts`, `uploadQueueRunner.ts`           |
| 02  | Remove account / forced logout — `handleForcedLogout`, `reauthorizeAccount` | 13  | Edit/delete entry — `SCR-13-edit-entry`, `entries.ts` `deleteEntry`  |
| 04  | Search — `SCR-03-search`                                                    | 14  | Browse map — `SCR-04-map`, `data/map.ts`                             |
| 05  | View entry — `SCR-06-entry-detail`                                          | 15  | Inboxes — `SCR-23`, `SCR-24`, `data/notifications.ts`                |
| 06  | Star/favourite — `reactionsFlow.ts`                                         | 16  | Receive push — `pushFlow.ts`, `AppShell` `PushListener`              |
| 07  | Comment/reply — `commentsFlow.ts`, `useCommentComposers.ts`                 | 17  | Edit settings — `SCR-25-settings/sections/*`, `data/settings.ts`     |
| 08  | Follow/unfollow — `reactionsFlow.ts`                                        | 18  | Daily reminder — `reminderFlow.ts`, `platform/localNotifications.ts` |
| 09  | Approve/refuse requests, restore access — `connectionsFlow.ts`              | 20  | Add account — `signInDeliberate`, `SCR-01`                           |
| 10  | Hide/unhide — `hiddenMembersStore.ts`                                       | 21  | Switch account — `switchAccount`, `AccountSwitcherOverlay.tsx`       |
| 11  | Report — `reactionsFlow.ts` `reportEntry`, `SCR-16`                         | 22  | Change mode / remove — `changeAccountMode`, `removeAccount`          |

Account functions above are in `flows/accountsFlow.ts`. FLW-03 and FLW-19 are not referenced in code.
