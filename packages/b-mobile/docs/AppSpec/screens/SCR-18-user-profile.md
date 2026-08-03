# SCR-18 — User Profile   [Must]

**Purpose:** Another member's public profile, with follow/unfollow.

**Reached from:** a username/avatar tapped almost anywhere (entry author, comments, followers/
following lists, search results, notifications).
**Leads to:** `SCR-06 Entry Detail`, `SCR-19 Followers/Following`, `SCR-22 Awards`. Not
account-gated (public profiles viewable logged-out).

## Layout (ASCII wireframe)
```
+--------------------------------------+
| <  alice's journal                   |
|  [avatar]  alice   ★member  🏅       |  header: avatar, name, badge icons
|  Journal title · 320 entries         |
|  Bio…                                |
| About | Entries | Faves | Followers… |  tabs (5)
|                                      |
|            [ + Follow ]              |  follow / unfollow per relationship
+--------------------------------------+
```

## Components & data shown
- **Header:** avatar, username, journal title, member/award icons, biography (rendered), entry
  count.
- **Tabs:** About, Entries, Favourites, Followers, Following.
- **Follow / Unfollow** button — shown per the viewer's relationship action flags.
- **Hide** — in the overflow menu, for any member other than the active account: stops you
  seeing their content. Also **Remove follower**, shown whenever they currently follow the active
  account, whatever that journal's privacy setting — on a protected journal it removes their
  access, on a public one it only ends the relationship (`SCR-19`). It does **not** refuse them.
  Two separate actions — see `FLW-10`, `FLW-09`, and [rules.md](../rules.md).

## States
- **Loading / Loaded / Error.**
- **Not found / unavailable** (error 103) → message and return.
- **Malformed username** (error 101) → the username was rejected as invalid rather than missing.
  Unlikely here, since profiles are normally reached by tapping a name rather than typing one, but
  handle it with the same "couldn't open that profile" message rather than falling through to the
  generic error. See [error-codes.md](../api-appendix/error-codes.md).
- **Protected account** — if the viewer isn't an approved follower, entries aren't visible;
  following may create a **pending request** rather than an immediate follow.
- **Anonymous viewer** — can view public profiles; tapping Follow routes through sign-in (`FLW-01`).
- **Read-only viewer** — can view public profiles same as anonymous; Follow/Unfollow and Remove
  follower are writes and show the upgrade prompt (`rules.md`, `FLW-08`/`FLW-09`) instead of being
  offered. **Hide is unaffected** — it's device-local, not a write (`rules.md`).
- **Hidden member** — the header (avatar, username) still renders so the member is identifiable,
  but **no content is shown**: the Entries and Favourites tabs are replaced by a "You've hidden
  this member" state carrying an **Unhide** action. Unhiding restores the profile in place,
  without leaving the screen. Follow/unfollow remains available — hiding says nothing about
  whether you follow them.
- **Refused member** — a member refused access to your journal (`SCR-21`) is shown normally: their
  content was never hidden from you. Where both states apply, show both.

## Actions & rules
- **Follow** → optimistic; for a protected account this becomes a pending request.
- **Unfollow** → confirm, then optimistic.
- **Hide** → confirm (stating effect and non-effect), then apply (`FLW-10`); the profile switches
  to its hidden state immediately. **Unhide** → restores the profile in place.
- **Remove follower** (they currently follow the active account) → confirm, then apply. On a
  protected journal they lose access but are **not** refused and do not appear on `SCR-21`; they
  may request to follow again. See `SCR-19`.
- Errors show a message; the relationship generally isn't rolled back (counts that changed do).
- **Tap entry** → `SCR-06`; **tap a user** in lists → another `SCR-18`; **followers/following** →
  `SCR-19`; **awards** → `SCR-22`.

## API touchpoints
See [endpoints.md](../api-appendix/endpoints.md).
- `user/profile` (by username — details/entries/badges/friendship).
- `entries/journal` / `entries/favorites` (by username).
- `users/followers`, `users/following`.
- `users/following` (POST follow / DELETE unfollow).

## Acceptance criteria
- [ ] Given a valid username, the profile header and tabs render.
- [ ] Given error 103, the user sees "not found" and is returned; error 101 is handled the same
      way rather than as a generic failure.
- [ ] Given the viewer can follow, Follow updates optimistically; Unfollow confirms first.
- [ ] Given a protected account, following creates a pending request and entries remain hidden
      until approved.
- [ ] Given an anonymous viewer taps Follow, sign-in is required first.
- [ ] Given a signed-in, read-only viewer, Follow/Unfollow and Remove follower show the upgrade
      prompt instead of acting; Hide remains available.
- [ ] Given any member other than the active account, Hide is available from the overflow menu.
- [ ] Given a hidden member, the profile shows an unhide state with no entries or favourites;
      unhiding restores it in place.
- [ ] Given a refused member who is not hidden, their content is shown normally.
