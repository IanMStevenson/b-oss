# Cross-cutting rules

Behaviour every screen and flow inherits. Individual specs reference these rather than repeating
them. These are **requirements**, not implementation; where a rule depends on the Blipfoto API,
the wire detail is in [api-appendix/](api-appendix/).

---

## Authentication & session

- **A credential is always required.** Every API call carries a bearer. When an account is
  active it is that account's token; otherwise it is an app-level credential. A call with no
  credential is rejected — the app must never make a credential-less request. (See
  [api-appendix/auth.md](api-appendix/auth.md).)
- **Read first, gate late.** Public content is browsable logged-out. The app prompts sign-in only
  when an action genuinely needs an account (publish, react, comment, follow, manage profile) —
  and such a prompt always signs in **read-write**, skipping mode choice (`FLW-01`).
- **Resume the pending action.** After a successful sign-in triggered by a gated action, the app
  completes the original action rather than dumping the user on a home screen (`FLW-01`).
- **Multiple accounts, one active.** The app may hold several signed-in accounts at once; exactly
  one is active and drives every account-specific screen. Adding, switching, changing mode, and
  removing accounts are first-class (`SCR-30`, `FLW-20`, `FLW-21`, `FLW-22`), not a hidden
  power-user feature.
- **Sign-in mode gates write access.** Every account is signed in **read-only** or
  **read-write**; a read-only account must never be offered a write action anywhere in the app —
  see Optimistic UI, below. Changing an account's mode, or removing it, follows the token
  lifecycle in [api-appendix/auth.md](api-appendix/auth.md): the user is told in advance whenever
  a change will need a new sign-in step or will revoke access (`FLW-22`).
- **The gate is live token possession, not a remembered mode label.** "Read-write" isn't a stored
  preference the app trusts blindly — every write-affordance check asks "does this account
  currently hold a valid write token?" This matters when a forced logout claims only one of an
  account's two tokens: an account that was `read-write + notifications` and just lost its write
  token (but kept its read token) immediately reads as read-only everywhere — hidden write
  affordances, needs-reauth badge on `SCR-30` — without waiting for the user to notice or visit
  `SCR-30`. `read-write` with no notifications has no backing read token, so losing its one token
  there is an ordinary forced logout, per `FLW-02`.
- **A blocked write path leads to an upgrade prompt, never a dead end.** Write affordances are
  hidden for a read-only account, so reaching one should be unreachable in normal use — but three
  routes bypass it: a deep link, an OS **Share-to-Blipfoto** intent, or stale UI. Wherever one of
  these lands a read-only account on a write action anyway, the app shows a short "this account is
  read-only" prompt offering to authorize write access **in place**, going straight into
  `FLW-22`'s re-authorization step for just the missing token — not a bare error, and not a silent
  failure. Declining returns the user to wherever they came from; a dedicated write screen (e.g.
  `SCR-09`, `SCR-13`, `SCR-15`, `SCR-16`) never opens in the first place — the prompt is shown
  instead of navigating to it. This is the app's **only** upgrade path outside Settings → Accounts
  → change mode — there is no persistent "you're read-only" banner elsewhere inviting a mode
  change unprompted. If the gate were somehow bypassed entirely and the server itself rejects a
  write for insufficient scope (error 16), that's a gating bug, not a normal path: surface a plain
  visible message rather than swallowing it (see
  [api-appendix/error-codes.md](api-appendix/error-codes.md)).
- **A single failing write never changes the account's mode.** A rejected or errored write
  (quota, validation, transport failure) leaves sign-in mode and held tokens untouched — only an
  explicit mode change (`FLW-22`) or a forced logout on a specific token (above) does.
- **Forced logout is per-token, not global.** When the backend signals an invalid session for a
  specific token (a specific error code — see
  [api-appendix/error-codes.md](api-appendix/error-codes.md)), the app clears **only that
  token**. If it was the active account's only/last token, the app switches to another stored
  account or returns to anonymous browsing; if it belongs to a background or non-active account
  (e.g. the notification service's token going stale), the current screen is left undisturbed
  (`FLW-02`).
- **There is no separate "sign out" — removing an account is the operation.** It revokes whichever
  token(s) that account holds, deregisters it from the notification service if registered, and
  forgets it; in-flight work using its token (e.g. a queued upload) is cancelled, not left running
  with a stale token (`FLW-02`, `FLW-22`).

## Multi-account clarity

Multi-account is instant and free to switch (`FLW-21`), which makes it easy to forget which
account is active — especially when a screen was reached **cold**, with no navigation through the
account's own feed to make it obvious. A deep link, push, or share intent all land this way: they
open straight onto someone else's entry, giving the user no cue at all about which of their
accounts would act if they commented or starred it.

- **A persistent account indicator is always visible** in the primary navigation chrome (Browse,
  Search, Map, My Profile, Notifications, Comments, Settings, Help) whenever **two or more
  accounts are stored** — a small avatar, tappable anywhere in the app, not just from `SCR-30`.
  It appears as **`(av)`** in those screens' wireframes; where a wireframe shows it, that position
  is indicative, not prescriptive. With fewer than two accounts it is absent, and the space it
  occupied is simply not reserved.
  With zero or one stored account there's nothing to disambiguate, so it's not shown. This is a
  deliberate choice over a deep-link-only banner: a banner would need to detect "was this screen
  reached cold," stay silent for every other cold-open path (push, share intent), and leave the
  same ambiguity for all of them. A persistent indicator solves it once, everywhere, with no
  per-path special-casing.
- **Tapping it opens a lightweight account switcher** — a popover/sheet listing every stored
  account (avatar, username, mode, needs-reauth badge where relevant), anchored where it was
  tapped rather than navigating away. Tapping an inactive account switches to it instantly, per
  `FLW-21` — the same underlying mechanism `SCR-30` uses, just reachable from anywhere. A **Manage
  accounts** row at the bottom opens `SCR-30` for add/remove/mode-change. This popover is not a
  new screen ID; it's a transient overlay over whatever screen is currently showing.
- **This indicator is informational, not a nudge.** It may show the active account's mode (e.g. a
  small "read-only" badge) but never an upgrade call-to-action — that would contradict the rule
  above that the write-blocked upgrade prompt is the app's only unprompted route to a mode change.
  Identity clarity and mode-change nudging are different concerns; this solves only the first.

### Optional: confirm the account before Star, Favourite, or a comment/reply

Even with the indicator, a user who *has* clocked which account is active can still tap Star,
Favourite, or submit a comment on a cold-opened entry without a fresh thought about whose account
it'll post as — the indicator is passive, and easy to skim past. For users who want a hard stop,
**Misc** in `SCR-25` carries an opt-in toggle, **off by default**, shown only when two or more
accounts are stored (hidden otherwise — a control with no possible effect is not offered, per the
usual rule):

- **Scope is deliberately narrow: Star, Favourite, and submitting a comment/reply — nothing else.**
  These are the low-friction, easy-to-fire-without-thinking actions (`FLW-06`, `FLW-07`). Follow,
  approve/refuse, edit/delete, report, and publish already involve a screen, a confirm step, or
  deliberate navigation that gives the same "which account is this" pause for free.
- **When enabled, the app asks *which account* immediately after the signed-in check and before
  the read-write check** — i.e. before, not after, the write-gating upgrade prompt from
  Authentication & session, above. A dialog lists the stored accounts (current one preselected);
  read-only accounts are shown but not selectable, labelled **read-only** rather than left to
  dead-end into the upgrade prompt a step later. Confirming a **different** account switches to it
  first (`FLW-21`), then the action proceeds as normal against the now-active account — including
  the upgrade prompt, if that account turns out to be read-only too. Cancelling the dialog aborts
  the action entirely: no switch, no post, same as cancelling anywhere else.
- **Checking this ahead of the read-write gate is deliberate**, not just ordering for its own
  sake: it lets a user whose active account happens to be read-only pick a different, already
  read-write account right there, instead of being bounced to the upgrade prompt when a
  perfectly-usable account was one tap away.
- **With fewer than two accounts stored, the setting has no effect** even if left on from when a
  second account existed — there's nothing to ask.

## Error handling

- **Read the error code, not the HTTP status.** The Blipfoto API returns HTTP 200 even on
  failure; the meaningful signal is an error code in the body. The full code→behaviour table is in
  [api-appendix/error-codes.md](api-appendix/error-codes.md). Key cases the UI must handle:
  invalid session (forced logout), missing/invalid bearer, protected/not-visible content, bad
  credentials, user unavailable, rate limiting, registration errors, and daily-favourite-quota.
- **Network vs application errors are different.** A *transport* failure (no connectivity, timeout)
  is retriable; an *application* error (a returned error code) is not retried blindly — it is
  surfaced or handled per its meaning.
- **Surface errors without losing work.** On a failed action the user stays where they are, sees a
  clear message, and keeps any text they had entered (e.g. a half-written comment).

## Optimistic UI

- Star/favourite, follow/unfollow, and approve/refuse follow requests update the UI
  **immediately**.
- On success the optimistic state stands; on failure the app shows an error. Reverting is optional
  and generally not done for social/graph actions — but counts that visibly changed (e.g.
  favourite +1) should roll back if the server rejects them.
- Affordances are driven by the object's **action flags** (see [glossary.md](glossary.md)), so the
  UI never offers an action the current user isn't permitted.
- **Read-only accounts never see write affordances.** The active account's sign-in mode (see
  Authentication & session, above) is checked alongside each object's action flags — an action
  flag saying "you may star this" doesn't override a read-only account's inability to write
  anywhere. Write actions are hidden or disabled entirely for a read-only account, never shown
  and left to fail on tap.
- **Hiding is not a write.** It is enforced on the device and sends nothing to Blipfoto, so
  `SCR-31` and the Hide action stay fully available to a read-only account. Refusing a follower
  *is* a server write, so it does not.

## Lists, feeds & paging

- Feeds and lists support **pull-to-refresh** (reset to the first page) and **pagination** (load
  more on scroll). The new app uses real pagination — there is no fixed page cap.
- Each list defines its **empty state** ("nothing here yet") and its **error state** (with retry)
  distinct from its loading state.
- A **protected/not-visible** result within a feed shows an inline "protected" message rather than
  an error.

## Loading, empty & error states

Every screen that loads data defines four states, and specs must address each:

- **Loading** — initial fetch in progress (skeleton/spinner).
- **Loaded** — content shown.
- **Empty** — request succeeded but there's nothing to show.
- **Error** — request failed; show a message and a way to retry.

## Composing & uploading (durable behaviour)

- **One entry per day.** Publish eligibility for the chosen date is checked before the user can
  publish; an ineligible date shows the specific reason (already posted, future, etc.).
- **Durable, background upload.** Once the user confirms a publish/edit, the upload **continues
  even if they leave the compose screen**, multiple uploads may be queued, progress is visible
  (e.g. a persistent indicator), and the app **automatically retries on network failure**
  (capped backoff). An application error stops that upload and surfaces a message — it is not
  retried blindly.
- On success the new/updated entry becomes visible and the user can navigate to it.

## Notifications & unread counts

- Notifications are delivered by the **cloud service** (see
  [02-notifications.md](02-notifications.md)), governed by the user's push
  preferences.
- **A push reports a count, not an event.** The service can tell the app only that a stream's
  unread total has risen and by how much — never what happened, to what, or who did it. This is a
  platform constraint, not a design choice: every API call that returns notification or comment
  *content* also marks it read, so a service that fetched detail would clear the user's badge before
  they ever saw it, here and on the website. Only the counts are readable without side effects.
  Two consequences run through everything below: **a push opens an inbox rather than a specific
  item**, and **a push cannot be suppressed by hidden member**.
- **Inboxes** (Notifications, Comments) show recent items, **fetched fresh on every visit like
  everything else** — the caching rule below has no inbox exception, so an inbox opens in its
  loading state rather than showing a stale list. A new push refreshes counts.
- **Opening an inbox clears its unread badge, and that read state persists on the server**, since
  the count is shared with the website. **Both inboxes clear implicitly** — simply fetching the
  items marks them read; there is no way to read either stream without doing so, and no per-item
  control on either. The app makes no separate mark-read call.
  - **Comments clear more broadly than they look.** Fetching the comment stream clears *every*
    unread comment for the account, not only the items returned — so a paged inbox must capture
    which items were unread from its **first** response, since every later page will already read
    as read. See `SCR-24`.
  - **Opening one's own entry also clears comment-unread** for the comments on it, since loading an
    entry loads its comments (`SCR-06`). The comments badge can therefore clear without the user
    ever visiting the comments inbox. This is expected, not a defect.

  See [api-appendix/endpoints.md](api-appendix/endpoints.md).
- **Tapping an in-app notification opens its target**; tapping a **push** opens the relevant inbox,
  because a push carries no target (above). Where a notification's target can't be determined, the
  app opens its link in the device browser rather than doing nothing — a tapped notification that
  appears to do nothing reads as broken.
- **Notifications caused by a hidden member are suppressed in the inboxes**, as far as the platform
  allows — see Hiding members, and refusing followers, for exactly how far that is. **Pushes are
  never suppressed**, since they identify nobody.
- **The OS notification permission is a separate gate from the sign-in mode**, requested as part of
  enabling notifications (`FLW-20`). There is **no persistent "blocked by the OS" state** — a
  refusal, or the OS permission being found missing on any later app-launch check, is treated
  identically to the user turning the notifications master switch off (`SCR-25`/`SCR-30`,
  `FLW-22`): the service registration and its read token are revoked, same as a deliberate
  toggle-off, with nothing remembered about the prior preference. Re-enabling always goes through
  the normal on-path again, permission request included.
  **Daily reminders (`FLW-18`) sit behind the same OS permission and get the same treatment** — a
  refusal switches the reminder setting off rather than creating a third "blocked" state. The two
  features are independent otherwise: turning one off never turns the other off, but a refusal at
  the OS level affects whichever one asked.
- **The app always reads the *current* permission state rather than remembering a past answer.**
  The platform exposes it on demand, including changes the user made in system settings without the
  app running, so "is notification display permitted right now?" is always answerable — which is
  what makes the no-remembered-state rule above workable rather than lossy.
- **Requesting the permission can fail without prompting, and that case must be handled.** Once the
  user has refused, the platform stops showing the prompt and simply returns the refusal
  immediately. The app must distinguish *"not asked yet"* from *"asked and refused"* — the platform
  reports these as different states — and:
  - **Not asked yet** → request it; the prompt appears.
  - **Already refused** → do **not** request into silence. Explain that notifications are switched
    off for the app in system settings, and offer to open those settings directly.

  Getting this wrong produces a loop: the user turns notifications on, the app runs a full
  authorization round for a read token, the permission request returns refused without ever
  appearing, and the app revokes the token it just obtained. **So the permission is checked *before*
  the read-token authorization, not after** — never make the user authorize something that is
  already known to be undeliverable.
- **Returning from system settings is not assumed to have succeeded.** Re-check the permission when
  the app resumes and act on what it now says; the user may have changed nothing.
- **In read-write + notifications, losing the notification service's read token never narrows write
  access.** That mode holds two independent tokens, and the service's isn't used for anything the
  app itself does — the account stays fully read-write; only notifications stop.
  **This does not apply in read-only + notifications**, where the app and the service share a
  single token: losing it is an ordinary whole-account forced logout, and the app must not present
  it as a notifications-only problem. See [api-appendix/auth.md](api-appendix/auth.md) (How many
  tokens each mode holds) and `FLW-02`.

## Privacy, safety & gating

- **Protected accounts** require follow-request approval before a follower sees their entries
  (`SCR-20`).
- **Hiding a member** (see below) is available wherever another member's content or identity
  appears.
- **Reporting** (`SCR-16`) escalates to Blipfoto's moderators and covers **both entries and
  comments** — a comment is reported via its entry, identified in the note. Unlike hiding, which
  is personal, a report can result in action affecting everyone.
- **A journal owner may delete any comment on their own entries**, not only their own comments —
  the primary, immediate tool for dealing with unwanted comments on one's own journal (`SCR-06`,
  `SCR-24`).
- **Refusing a follower or follow request** (`SCR-20`, `SCR-21`) is how a protected journal
  controls who may see it — a separate feature from hiding, see below.
- **Membership-gated** features (e.g. thumbnail crop) and **privacy-gated** UI are shown/hidden
  based on the member's account state.

## Hiding members, and refusing followers

Two **separate** safety features, pointing in opposite directions. Keeping them distinct — in
behaviour, in vocabulary, and in the UI — is a requirement, not a stylistic preference: users
arrive expecting a single "block" that does both, and it doesn't exist here.

| | Verb | Managed on | Who it affects | Available |
|---|---|---|---|---|
| **Hiding** | Hide / Unhide | `SCR-31` Hidden members | **You stop seeing them** | Any member, always |
| **Refusing** | Refuse | `SCR-21` Refused followers | **They stop seeing you** | Protected journals only, and only in response to a follow request |

Neither implies the other. A member can be hidden, refused, both, or neither, and all four
combinations are coherent.

**Refusing acts on a follow *request*, not on an existing follower.** This is a constraint of the
platform, not a design choice, and it shapes the UI:

- **Refuse** is offered on `SCR-20` when someone has asked to follow. That is what makes them a
  refused member, listed on `SCR-21`.
- **Remove follower** (`SCR-19`) is the separate, weaker operation for someone already following.
  It ends the relationship; it does not refuse them, and they never appear on `SCR-21`. On a
  protected journal they can ask again, and the owner decides then; on a public journal they can
  simply follow again.

So the app must never describe removing a follower as though it were permanent, and must never
offer "Refuse" against someone who has no outstanding request — there is nothing to refuse.

### The vocabulary is fixed

Use these words and no others. In particular **the app never uses the word "block"** for either
feature, because it would be a false promise: a hidden member can still read a public journal and
still comment on its entries, and a refused follower's entries are still perfectly visible to the
person who refused them.

Every surface for either feature states **both** what it does and what it does not do:

> **Hidden members** — you won't see their entries, comments, or notifications.
> *This doesn't stop them seeing your journal or commenting on your entries.*

> **Refused followers** — they can't see your journal.
> *This doesn't hide their entries from you.*

That paired shape — effect, then non-effect — is what teaches the distinction. It appears on the
Settings rows, on both list screens, and in both confirmation dialogs.

### Each action offers the other

Because neither feature alone does what a user may be picturing, **acting on one prompts about
the other**, with the complementary step offered as a separate, clearly-labelled choice — never
bundled silently into the first.

- **On hiding a member**, the confirmation explains that they can still see the journal and still
  comment, and what it would take to change that. Offer inline only the steps that actually apply
  to this member and this journal: **make the journal private** (`SCR-25` → Journal → privacy) when
  it is public, and **remove them as a follower** (`SCR-19`) when they currently follow a protected
  journal.
- **On refusing a follow request** (`SCR-20`) or restoring access (`SCR-21`), the confirmation
  notes that their entries will still appear to you, and offers **Hide** as a separate action.
- **On removing a follower** (`SCR-19`), the confirmation says what it does and does not do — and
  on a protected journal, that they may ask to follow again, which you can refuse at that point.

**Fully cutting off another member is possible**, and the app should say so plainly rather than
leave the user to work it out: set the journal to private, remove them as a follower, refuse the
follow request if they send a new one, and hide them. That combination stops them seeing anything
and stops you seeing them — but note the middle step depends on them asking again, so it is a
sequence rather than a single switch.

### Hiding: what suppression means

Hiding is **enforced by the app**, as a suppression list held on the device — Blipfoto's API has
no equivalent. It does exactly one thing: stops that member's content reaching you. It changes
nothing server-side, and the hidden member is never told.

When a member is hidden, **none of their content is rendered** anywhere in the app:

- **Their entries in any grid or feed** (`SCR-02`, `SCR-03`, `SCR-05`, `SCR-17`, `SCR-18`) show a
  **hidden placeholder tile**: no photograph, no title, no caption — just a neutral marker that
  something is hidden and by whom, sized to sit unobtrusively in the grid. The placeholder must
  never render their thumbnail; a blurred or shrunken version of their photo is still their photo.
- **On the map** (`SCR-04`) their markers are simply absent — a placeholder pin would be noise.
- **Their comments and replies** (`SCR-06`, `SCR-24`) are hidden entirely, with no placeholder —
  a gap in a conversation is less intrusive than a row of tombstones.
- **Notifications caused by them** — comments, stars, favourites, follows, follow requests — are
  suppressed from the inboxes (`SCR-23`, `SCR-24`), **completely in the comments inbox and on a
  best-effort basis in the notifications inbox.** The difference is a platform one and is set out
  in those two screens: a comment identifies its author outright, whereas a notification is
  delivered as pre-rendered text with no author field, so the app has to recognise the member from
  the text itself. That recognition works in the ordinary case and cannot be guaranteed.
  **A push is never suppressed** (`FLW-16`) — it identifies nobody, so there is nothing to
  recognise and nothing that can leak.
- **Opening a hidden member's entry or profile deliberately** (e.g. tapping the placeholder) shows
  a "you've hidden this member" state with an **Unhide** action, not the content.

**Counts are left alone.** View, star and favourite totals are server-side figures and continue to
include hidden members; the app does not recompute them, and the same applies to a comment count
that includes hidden comments. Suppression is about not showing people content, not about
rewriting numbers.

**Their name and avatar remain visible in people lists** — followers/following (`SCR-19`), pending
requests (`SCR-20`), people search (`SCR-03`) — marked **Hidden**. Removing them there would make
someone impossible to find in order to unhide, and a username and avatar are not the content the
feature exists to suppress.

The hidden list is **per account** (it describes your relationship to someone, so it switches with
the active account) and **stored on the device**: it does not travel to another device or survive
reinstalling the app, and the UI should not imply otherwise. **Nothing about it is ever sent
anywhere** — not to Blipfoto, and not to the notification service. A member can never hide
themselves.

**Members are identified by username**, because that is the only identifier the platform exposes
where the app needs to match one. A hidden member who **changes their username** therefore stops
being recognised until they are hidden again. That is a platform limitation rather than a design
choice, and the UI should not claim otherwise; it is also self-correcting, since the user simply
hides them again.

### Consistency requirement

Every surface that displays another member's content or identity must consult the hidden list. A
screen that forgets to is a safety defect, not a cosmetic one. The surfaces are: `SCR-02`,
`SCR-03`, `SCR-04`, `SCR-05`, `SCR-06`, `SCR-17`, `SCR-18`, `SCR-19`, `SCR-20`, `SCR-21`,
`SCR-23`, `SCR-24`, `SCR-31`, and push handling in `FLW-16`.

## App launch & first run

- **Launch lands on Browse (`SCR-02`).** There is no separate home screen, and no sign-in wall:
  the app opens straight into browsable content in every case.
- **Zero stored accounts** → Browse in its logged-out shape (Recent, Popular, Nearby), with a
  "Sign in" entry point in navigation. Sign-in is never forced at launch; it is requested at the
  moment an action needs it (`FLW-01`).
- **One or more stored accounts** → restore the account that was last active and open Browse in
  its signed-in shape. Restoring is local: no network call, no re-authorization.
- **The restored account is in needs-reauth** → still open normally, showing the account's state
  non-blockingly (a banner or badge on the Accounts entry point). Never open onto a modal
  sign-in prompt: the app remains usable for public browsing, and the user re-authorizes when
  they choose (`SCR-30`, `FLW-22`).
- **A deep link or push target at launch** → resolve to the target screen rather than Browse. If
  the target needs an account and none is usable, gate it exactly as any other gated action
  (`FLW-01`), returning to the target on success.
- **First run** shows a brief introduction to the sign-in mode choice at the point the user first
  reaches `SCR-01` deliberately — not a multi-screen onboarding carousel at launch. Read-only vs
  read-write is the one genuinely unfamiliar concept in the app and is the only thing worth
  explaining up front. Specified, with draft copy, in `SCR-01` (First-run mode explainer).

## Navigation, deep links & sharing

- **Handling blipfoto.com links is opt-in.** The app must not silently register itself as the
  handler for Blipfoto web URLs on install. Users who prefer the website — reasonably, since the
  site does things the app cannot (see
  [api-appendix/endpoints.md](api-appendix/endpoints.md)) — must not find their links hijacked.
  Offer the choice explicitly, default it **off**, and make it reversible at any time from
  `SCR-29 Help & Info` — **not** from Settings, which is account-gated and therefore unreachable to
  the logged-out users this choice also applies to. It is a device setting, not an account one.
- **Entry deep links** (web URL, where enabled, and the app's own custom scheme) and **push
  targets** open the specific entry or profile directly, signing in first if the target requires
  it.
- **Share-to-Blipfoto** (OS share of a photo) enters the compose flow (sign-in gated) with the
  shared photo pre-loaded.
- **Back behaviour** is conventional: secondary screens return to their parent; primary
  destinations are reachable from the main navigation. Unsaved edits prompt a discard
  confirmation.

## Caching — images only

One rule, applied the same way everywhere rather than varying per screen or entity:

- **No data is cached for display, anywhere.** Feeds, entries, profiles, awards, search results
  and map results are all fetched fresh on every visit — never rendered from a stale local copy.
  This is also why a cached entry's counts can never go stale: the app doesn't keep its own copy
  of them to begin with.
  - This doesn't stop a screen holding onto data it has *already fetched in the current session*
    — e.g. switching back to a browse/search tab loaded earlier in the same visit doesn't force a
    re-query (see `SCR-02`, `SCR-03`). That's ordinary in-session UI state, not a cache, and it's
    gone the next time the screen is freshly entered.
- **Images are cached app-wide, for 15 minutes.** Any image the API serves — entry photos and
  thumbnails, avatars, badge icons, notification images — is cached by URL for up to 15 minutes,
  wherever it's displayed. Persisted to disk, so it survives an app restart; bounded by the
  15-minute TTL alone (no separate size/count cap); no exception for a metered connection.
  - This needs no explicit invalidation logic in the common case: replacing an image (e.g.
    editing an entry's photo) gives it a new URL, so the old cached copy simply stops being
    referenced. Where a URL can stay stable across an edit (e.g. an avatar overwritten in place),
    the 15-minute TTL is the backstop that bounds how long a stale copy can show.
- **This is a performance optimisation, not an offline mode.** With no connectivity the app shows
  the normal error/retry state for whatever failed to fetch — a previously-viewed entry does not
  open just because its image happens to still be cached.

`config/countries` and `config/locales` are a separate, narrower exception — static reference
data for form pickers, not user content — see
[api-appendix/endpoints.md](api-appendix/endpoints.md).

## Identifiers (data hygiene)

- **Entry identifiers can exceed safe integer precision.** Any client that handles ids as numbers
  risks corrupting them; ids must be treated as **strings** when stored or round-tripped. (Detail
  in [api-appendix/data-model.md](api-appendix/data-model.md).)

## Rate limiting

- The API enforces a per-credential request rate limit; the app should be economical with calls
  (avoid redundant refetches, subject to the images-only caching rule above) and degrade
  gracefully if throttled. (Detail in [api-appendix/endpoints.md](api-appendix/endpoints.md).)

## Non-functional requirements

Cross-cutting product requirements, independent of any one screen or flow. Left unstated, an
implementer would silently pick all of these — they're recorded here as decided defaults.

- **Accessibility.** Every interactive element is reachable and labelled for a screen reader
  (TalkBack); text meets WCAG AA contrast (4.5:1 for body text); touch targets are at least
  48×48dp; layout does not break under system font scaling up to 200%.
- **Localisation.** The app ships **English-only** for v1 — no translated UI strings. The stored
  `locale` field (`SCR-25`) is unrelated to UI language: it continues to inform Blipfoto-side
  content and account settings exactly as it does today. Translating the UI is future work, out
  of scope here.
- **Platform support.** Minimum supported Android version is whatever floor the chosen
  cross-platform build framework imposes — this spec deliberately doesn't narrow it further, and
  doesn't name the framework (see `AppSpec/README.md` — framework choice is out of scope). That
  framework and version are now pinned in the build repo, and the resulting floor is **Android 7.0**;
  it should not be narrowed beyond that, and it moves when the framework's own floor moves.
  **Android is the only target for v1**, but the build approach is cross-platform and iOS is a
  plausible later target, so nothing in this spec should assume Android-only behaviour. Two
  consequences are load-bearing rather than theoretical: an OAuth redirect scheme that works
  unchanged on both platforms (see [api-appendix/auth.md](api-appendix/auth.md)), and a push
  delivery contract that isn't tied to one platform's push service (see
  [02-notifications.md](02-notifications.md)).
- **Screen sizes & orientation.** The app supports **phones and tablets**, across the full range
  of sizes each platform allows, plus Android foldables and split-screen/multi-window. It must
  never assume a fixed window size or refuse to be resized.
  - **The navigation model does not change with screen size.** There is no separate tablet
    layout, and specifically no two-pane list-detail mode: selecting an entry opens the entry
    screen, at every size. This is deliberate — Blipfoto's website has never split-screened, and
    the app's job is to give access to Blipfoto, not to invent a second interaction model for it.
    The screens where users actually spend time are the feeds and the entry view, and both are
    better served by one thing at a time.
  - Larger screens are used by **letting content breathe**, not by restructuring: grids derive
    their column count from the available width rather than a fixed number, images take advantage
    of the extra resolution, and line lengths stay readable rather than stretching the full width.
  - **Both orientations are supported on every screen.** Nothing is portrait-locked. State
    survives rotation and window resizing — in-progress text, a placed map marker, scroll
    position, and the compose form in particular.
- **Image loading & performance.** Feeds and grids request appropriately-sized thumbnails from the
  API — never the largest image available — with off-screen images loaded lazily. The largest
  available image is fetched only on `SCR-06`/`SCR-07` (entry detail / full-screen).
  **Standard resolution is this app's ceiling**: higher-resolution and original images exist on the
  platform but are restricted to trusted first-party apps and are not served to this one — the same
  restriction that puts additional photos out of reach (see
  [api-appendix/endpoints.md](api-appendix/endpoints.md)). Nothing in the app should offer a
  "view original" affordance or imply a higher resolution is available. The bar is qualitative — smooth
  scrolling on a mid-range device — rather than a numeric frame or memory budget, which isn't
  meaningful to fix without a device lab to validate it against.
- **Crash reporting.** No dedicated crash-reporting SDK. The Play Console's built-in crash/ANR
  reporting (available to any Play-published app, no extra integration needed) is relied on
  instead.
- **Analytics.** None. No usage or event tracking of any kind.
- **Privacy policy & data handling.** `SCR-29 Help & Info` links to a privacy policy — **not**
  Settings, which is account-gated: the policy must be reachable by someone who has never signed
  in, since anonymous browsing is a supported state and the policy covers it. It must
  disclose, at minimum: what's stored on-device (accounts, tokens, cached images, reminders);
  that a **third-party cloud notification service holds a live read-only OAuth token** to the
  account whenever push notifications are enabled (see
  [02-notifications.md](02-notifications.md)) — the one genuinely unusual data-sharing fact of
  this app; and that there is no analytics or crash-reporting SDK collecting data. Drafting the
  policy text itself is outside this spec's scope.
- **Stored tokens on device backup/restore.** See [api-appendix/auth.md](api-appendix/auth.md) —
  tokens are excluded from any OS-level device backup, so a restore onto a new or wiped device
  never silently carries a live bearer token across.
- **Account deletion.** Play policy requires a clear, reachable path to delete an account and its
  data alongside the privacy policy that discloses what's stored. Since account *creation* is
  already browser-based (`SCR-01`'s Create account link), deletion follows the same shape rather
  than inventing an in-app flow: `SCR-29 Help & Info` carries a **Delete my account** link, opening
  Blipfoto's own account-deletion page in the browser — same reachable-when-signed-out placement as
  the privacy policy, for the same reason.
  - **This is a device-level link, not scoped to any stored account** — like Create account, it
    doesn't and can't select which Blipfoto account the resulting browser session acts on; the app
    must not imply otherwise (e.g. by wording it as "delete `{username}`'s account" against the
    active account).
  - **Deleting an account on the web does not, and cannot, clear it from this app's stored account
    list automatically.** There is no dedicated signal for "this account was deleted" distinct from
    an ordinary forced logout — a deleted account's token simply stops being valid, and the app
    handles that exactly as any other invalid-session error (`FLW-02`), moving the account to
    needs-reauth rather than removing it. Re-authorizing it will fail at Blipfoto's own sign-in page
    (there being no account to sign into), surfaced as an ordinary OAuth error — no special
    detection is attempted or needed. The user removes the stale entry themselves via **Remove
    account** (`SCR-30`), same as any other account they no longer want listed.
