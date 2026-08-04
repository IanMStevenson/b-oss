# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–8 are all complete and pushed to `b-mobile-initial`.** Phase 0 (prerequisite `b-oss`
refactor) is merged into `main`. The app now has: a working Vite/Ionic/Capacitor skeleton, the full
28-screen route table, a real OAuth round and full account-management flow, real `SCR-01`/`SCR-30`,
a functional write-gate, real Browse/Tag-Entries/Entry-Detail/Full-screen-Photo/Entry-Metadata
screens, a full social action bar on `SCR-06` (star/favourite/follow/comment, all optimistic),
inline comment reply/edit/delete/report, real `SCR-15`/`SCR-16`/`SCR-31`, a working hidden-members
system, real profile screens (`SCR-17`/`SCR-18` sharing one implementation),
followers/following/pending-requests/refused-followers/awards (`SCR-19`–`SCR-22`), real `SCR-03`
Search and `SCR-04` Map, a full compose/publish/edit pipeline (`SCR-09`–`SCR-14`, a durable
background upload queue, camera/crop/multipart-upload), `FLW-13`'s owner-only Edit/Replace-photo/
Delete, `FLW-18`'s daily reminder data model/scheduling — and, as of Phase 8, real `SCR-25`
Settings and `SCR-29` Help & Info: a Settings hub (`SettingsScreen.tsx`) with General/Journal/
Profile/Notifications/Reminders/Misc sections (each load→edit→Save/Cancel or immediate-local-
persist per FLW-17, read-only-account view-only mode where the spec requires it), the
`confirmAccountBeforeReaction` and reminder on/off+time-picker UI now wired to Phase 4/7's
already-built gating/scheduling logic, avatar take/choose/crop/delete fully wired to `PUT
user/settings`'s `avatar` field, biography editing via `SCR-11` in a new `target="bio"` mode, a
Notifications section with a real master switch and Feed/Push toggles (Advanced polling interval
is local-only, pending Phase 9's live registration), and a Help & Info hub (icon guide, safety &
privacy explainer, open-source licences, external Help/Terms/Privacy-policy/Delete-account links,
the opt-in blipfoto.com link-handling toggle) reachable with no account signed in. Full monorepo
`typecheck && lint && test && build` green (499 tests, confirmed stable across 2 repeated
package-level runs and 2 repeated monorepo-level runs). **Phase 9 (Notifications: `b-push` +
client) has not started.**

## Last completed step

Committed and pushed `feat(b-mobile): Phase 8 — Settings & device-level screens (SCR-25/29,
FLW-17)` and `docs(b-mobile): log Phase 8 completion, point RESUME at Phase 9`. This is Phase 8's
full scope per `PLAN.md`'s checklist and RESUME's own prior "Next intended step" section, plus one
scope decision made and documented rather than left ambiguous (see below) and one small deliberate
improvement to Phase 5 code (`SCR-22`'s badge tap now goes to `/help/icon-guide` instead of the
`/help` hub it used as a placeholder, fulfilling a TODO that phase's own comment planted for this
one). Worth reading in full before touching the same modules again:

1. **The Notifications section's scope is split across Phase 8 and Phase 9, not all-or-nothing.**
   `PLAN.md`'s Phase 9 title ("Notifications: `b-push` + client") could read as "every notification
   UI is Phase 9," but checking first (this project's standing discipline) found that `SCR-30`'s
   `AccountsScreen.tsx` (Phase 2) already has a working master on/off switch via
   `flows/accountsFlow.ts#changeAccountMode()`, and `b-api` already has real, working
   `getNotificationSettings`/`updateNotificationSettings` methods with no `b-push` dependency at
   all. Only the Advanced polling-interval control genuinely needs a live `b-push` registration
   (`PATCH /v1/registrations/:id`), which doesn't exist yet. So `SCR-25`'s master switch and Feed/
   Push toggle groups are real, working code today; only the Advanced control is local-only
   (`devicePrefsStore.notificationPollingIntervalMinutes`), waiting for Phase 9's registration id.
2. **`devicePrefsStore.uploadFullSize` defaults to `true` and has no consumer yet** — it matches
   the app's actual current behaviour, since no client-side photo downscaling exists anywhere in
   this codebase (Phase 7's compose/edit screens only ever crop, never resize). This is a real,
   pre-existing gap, not something Phase 8 was asked to close (the preference lives on `SCR-25`
   Misc; the resize logic it would gate belongs to `SCR-10`/`SCR-13`, out of this phase's scope).
3. **`devicePrefsStore.openBlipfotoLinksInApp` is the opt-in `<activity-alias>` toggle**, not a
   second feature alongside it — `SCR-29`'s spec text and app-architecture.md §16's native
   mechanism describe the same toggle from two sides. No `android/` project exists in this repo yet
   (only the `@capacitor/android` npm package, not a checked-in native project) — the boolean is
   persisted now with no native effect; Phase 10 is what makes it do anything on-device.
4. **A jsdom `IonLabel`-children gotcha, already noted as "at least one occasion, root cause not
   diagnosed" in this file's own gotcha list, reproduced predictably on two fresh screens this
   phase** (`HelpInfoScreen`'s and `SettingsScreen`'s hub rows) — `getByText('Icon guide')` etc.
   failed to find text that was genuinely rendered, while sibling `IonNote`/`IonCheckbox` children
   on the very same rows rendered fine. Fixed the same way `UserRow.tsx`/`BBCodeToolbar.tsx`
   already had: plain `<span>` children inside `IonItem`, not `IonLabel`. Not a "never use
   IonLabel" rule — existing screens using it (`AccountsScreen.tsx` and others) were left alone —
   just a confirmed trap worth checking for on any _new_ screen before trusting `getByText`.

## Next intended step

Start **Phase 9 — Notifications: `b-push` + client** on `b-mobile-initial` (no PR), per `PLAN.md`'s
phase list: `SCR-23/24`, `FLW-15/16`.

1. **Read `SCR-23`, `SCR-24`, `FLW-15`, `FLW-16`, and `docs/ImplementationSpec/notification-
service.md` in full first** — same deferred-until-the-phase-starts approach every phase has
   used, and `notification-service.md` in particular is long and already has a "Resolved UX"
   section mapping each design decision to the `AppSpec/` screens/flows it feeds.
2. **New peer package `b-push`** — a Cloudflare Worker + D1, per `notification-service.md`'s own
   design: counts-only polling (`messages/totals/unread` only — reading notification/comment
   _content_ would mark it read, a documented API side effect the service must never trigger), the
   registration API (`POST`/`PATCH`/`DELETE /v1/registrations`), FCM HTTP v1 push transport,
   `reauth-required` handling for a stale read token. This is a new top-level `packages/b-push`
   directory — check whether it needs its own `package.json`/build wiring independent of the
   `b-mobile` app package, and whether root `npm run typecheck`/`lint`/`test`/`build` need to be
   taught about it (a new workspace member) before assuming the existing scripts already cover it.
3. **App side**: `platform/push.ts` (device push-token registration against the new service),
   permission-before-auth sequencing per `FLW-20`'s existing notifications-mode choice (Phase 2
   already has the token-lifecycle machinery — `flows/accountsFlow.ts`'s several
   `// TODO(Phase 9): register/deregister with the notification service` markers are exactly the
   call sites waiting for this), the two inboxes' (`SCR-23` notifications, `SCR-24` comments)
   asymmetric hidden-member suppression per `notification-service.md`'s own description, and the
   first-page-unread-snapshot trap it also describes (reading the recent-activity endpoints marks
   them read, so the unread count shown alongside a freshly-opened list has to be captured _before_
   that list's own fetch, not derived from it afterward).
4. **Also in scope, left dangling by Phase 8's own scope decision**: wire `SCR-25`'s Advanced
   polling-interval control (`devicePrefsStore.notificationPollingIntervalMinutes`, currently
   local-only) to a real `PATCH /v1/registrations/:id` call once a registration id exists, and
   replace every `TODO(Phase 9)` marker already sitting in `flows/accountsFlow.ts` (Phase 2) with
   the real registration/deregistration calls against the new service.
5. **Verify**: full monorepo `typecheck && lint && test && build`, four-state coverage for every
   new screen, multiple repeated full-suite `npm test` runs (this project's established pattern —
   do at least 2, more if anything looks flaky). Check `npm run build`'s own chunk-size output if
   anything new pulls in a large dependency — and per this project's own repeated finding, don't
   assume every flagged chunk is a new regression; grep the flagged chunk's own contents for a
   telltale symbol first (Phase 6 found a pre-existing `@ionic/react` chunk this way, Phase 8
   confirmed the same chunk again by the same method).

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking Phase 9's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a local `.env`, plus (new as of Phase 9)
whatever Cloudflare account/credentials `b-push`'s own deployment needs — never invented by me,
never committed. The OAuth round and every live data/action/write screen built so far remain
untested against the real API for the same env-var reason — expected, matches the spec's own
stance that this isn't a pre-build gate. `b-push` itself, once built, will need an actual Cloudflare
deployment (Workers + D1) before the app side can be tested against it for real — that deployment
step is explicitly manual per `notification-service.md` ("no automated deploy on push, at least
initially"), not something this session should attempt to automate.

## Gotchas discovered so far (not obvious from the code)

- **`b-visual`** is the current, correct name for the shared design-tokens/style-guide package.
- **Cross-package `.tsx` source imports need care with ambient CSS declarations.** Don't add a
  package-local `declare module '*.module.css'` to `b-mobile` unless it truly has its own CSS
  Modules — the root `types/globals.d.ts` already covers everything. Full writeup: Phase 0.2's
  `AGENT_LOG.md` entry (2026-08-03).
- **`b-api`'s existing methods aren't fully trustworthy against the spec just because one with
  the right name exists** — check what it actually returns/does before building on it. Found
  repeatedly: the multipart seam (Phase 0.3), `verifyToken()` not returning `scope` (Phase 2),
  `getEntry`'s `returnFriendships` option (Phase 4), `@capacitor/camera`'s current API sidestepping
  a hand-rolled EXIF parser (Phase 7, a shortcut rather than a gap). **Phase 8 found the opposite
  both ways in one phase**: `getCountries()`/`getLocales()` were exactly as advertised (no
  surprise), while `updateNotificationSettings`'s flat, un-namespaced key shape only became clear
  from reading `b-api`'s own `client.test.ts` fixtures, not its method signature. Keep checking —
  don't assume every phase finds a gap, but don't assume a name match is enough either.
- **No headless browser available in this sandbox** — `playwright install --with-deps` needs
  root. Verification uses jsdom-rendered Testing Library smoke tests instead. Don't re-attempt
  `playwright install --with-deps` expecting a different result. **The same gap applies to
  anything else that needs a real renderer** — Phase 6 hit this again for `maplibre-gl` (no
  WebGL/canvas in jsdom) and mocked the library wholesale rather than trying to run it; Phase 7
  applied the identical treatment to `react-easy-crop` (mocked `components/PhotoCropper.tsx`
  wholesale in `ComposeEntryScreen`'s tests) — mock at the boundary, test the component's own
  logic, is the template for any future screen wrapping a rendering-heavy third-party library.
  **Phase 8's `ProfileSection` test reused this exact template** for its own avatar-crop flow: a
  small interactive stub (a button that calls `onCropAreaChange` with fixed values) rather than a
  bare no-op div, since that phase's test needed to exercise the confirm-crop path, not just check
  the cropper renders.
- **jsdom has no `Element.scrollTo`**, which `ion-segment` (and likely other Ionic components)
  call when their active item changes — throws otherwise. Fixed with a guarded shim,
  `packages/b-mobile/src/test-setup.ts`, wired into **both** `packages/b-mobile/vite.config.ts`'s
  own `test.setupFiles` _and_ the root `vitest.config.ts`'s (root `npm test` doesn't pick up
  per-package Vite configs at all).
- **Two Zustand-selector footguns, same root cause — worth remembering as a category**: a selector
  that returns a _newly allocated_ value (empty array/object literal, or a fresh wrapper object)
  on every call, even when nothing changed, breaks `useSyncExternalStore`'s reference-equality
  snapshot check. Manifests either as an infinite render loop (`useHiddenMembers`'s old `?? []`
  fallback) or as silently-reverted state (`useLiveEntry`'s `entryState` wrapper being
  reconstructed every render, clobbering an optimistic update via a `useEffect` that depended on
  it). **A close relative, found in Phase 7, not quite the same shape**: an effect that depends on
  a value which its own success path _clears_ can re-trigger itself right after succeeding
  (`EditEntryScreen`'s `isCurrentDraft`, flipped by `Save`'s own `clearDraft()`) — fixed with a
  `useRef` seeded once at mount rather than a reactive dependency. Before adding a new derived-value
  selector or an effect depending on a hook's return object _or_ a value one of the effect's own
  handlers can mutate, check whether it's stable/won't react to its own aftermath.
- **A raw `element.click()` in a test doesn't reliably synchronize with a handler that chains
  multiple `await`s before its first `setState`**, under the CPU contention the full monorepo
  `npm test` run creates in this sandbox. `@testing-library/user-event`'s `await
userEvent.click(...)` does. Default to `userEvent` over a bare `.click()`/`.dispatchEvent()` for
  any test exercising a multi-await async handler — used throughout Phase 7/8's screen tests for
  exactly this reason.
- **`IonAlert` renders its buttons into the DOM unconditionally, regardless of `isOpen`** — a bare
  `screen.getByText('X')` can match a hidden alert's own button as easily as a real trigger
  button. Scope trigger queries with `{ selector: 'ion-button' }`; for the alert's own destructive
  button, `document.querySelector('button.alert-button-role-destructive')` (a plain DOM query)
  works when there's only one such alert on the screen. **Phase 7 extended this**: once a screen
  has _multiple distinct_ destructive `IonAlert`s (`SCR-06` now has four — Unfollow, Hide,
  delete-comment, delete-entry), that bare query matches whichever renders first in source order,
  not necessarily the one actually open. Scope through the alert's own `header` attribute instead:
  `document.querySelector('ion-alert[header="…"] button.alert-button-role-destructive')`. **Phase
  8's `ProfileSection` test reused this exact `header`-scoped pattern** for its "Delete avatar?"
  confirmation, alongside the section's own "Discard changes?" alert.
- **`IonLabel` didn't render its children in this jsdom test setup** on at least one occasion
  (Phase 4), root cause not fully diagnosed — **and reproduced predictably on two fresh screens in
  Phase 8** (`HelpInfoScreen`, `SettingsScreen`'s hubs): `getByText('Icon guide')` etc. found
  nothing even though the exact same row's `IonNote`/`IonCheckbox` sibling children rendered fine.
  Fixed both screens by using plain `<span>` children inside `IonItem` instead — the same choice
  `UserRow.tsx`/`BBCodeToolbar.tsx` already made for `IonLabel`/`IonButton` respectively (not a
  "never use IonLabel" rule; existing screens using it successfully were left alone). `IonButton`'s
  `aria-label` prop also didn't reach the rendered `<ion-button>`'s DOM attributes (Phase 6's
  `MapScreen` my-location test) — `screen.getByText('My location', { selector: 'ion-button' })`
  worked reliably instead. Check for this class of gap before reaching for `getByLabelText`/
  `getByRole` on any future Ionic component, and now also before trusting a bare `getByText`
  against text nested inside `IonLabel` specifically.
- **`b-view`'s `EntryDetail` and `ThumbnailGrid` are not reused by `b-mobile`, on purpose** —
  `EntryDetail`'s `dangerouslySetInnerHTML` conflicts with §14's ban; `ThumbnailGrid`'s windowed
  pagination doesn't fit any feed here. `EntryGrid`/`BBCodeText` were built instead and are reused
  everywhere a grid or BBCode render is needed.
- **`SCR-07`/`SCR-08`/`SCR-15`/`SCR-16` all deliberately avoid depending on a prior screen's
  in-memory data**, refetching via `useLiveEntry`/router state instead, for deep-link resilience.
  **`SCR-10`–`SCR-13` (Phase 7) are the deliberate exception to this pattern**: they share one
  in-memory `composeDraftStore` (app-architecture.md §6's "Draft state") precisely _because_
  `SCR-11`/`SCR-12` need to write results back into an in-progress, not-yet-submitted draft with no
  deep-link use case at all (there's nothing to link to until the entry is actually published) —
  don't "fix" this by threading the draft through router state instead, that's solving a problem
  this flow doesn't have. See `useAppNavigate.ts`'s doc comment for which pattern fits which case.
  **Phase 8's `DescriptionEditorScreen` `target="bio"` mode deliberately does _not_ join this
  exception** — it fetches/saves biography directly via `data/settings.ts`, with no dependency on
  `ProfileSection`'s own state at all, since biography (unlike a compose draft) has a real
  server-backed source of truth to refetch from and no in-progress-draft shape to share.
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: documented
  in `flows/accountsFlow.ts`'s own docstring. Not a correctness bug. **Phase 8's `SCR-25`
  Notifications master switch calls this same function**, exactly as `SCR-30`'s `AccountsScreen`
  already did — no new deviation, same function, same behaviour, second caller.
- **Blipfoto's exact registration/terms/help page URLs still aren't stated anywhere in the
  spec** — `SCR-01`'s "Create account" link and, as of Phase 8, `SCR-29`'s Help/Terms/Privacy
  policy/Delete-account links all point at the bare `https://www.blipfoto.com` root with a TODO.
  Still open; a real navigation-team pass fills these in eventually.
- **A large third-party dependency pulled in by a single screen needs an explicit lazy-loading
  check, not just a green typecheck/lint/test** — inspect `npm run build`'s own chunk-size output
  whenever a new screen adds a heavyweight dependency. `MapScreen` and `LocationPickerScreen` share
  one lazy `maplibre-gl` chunk; `ComposeEntryScreen` is lazy-loaded specifically because of
  `react-easy-crop`. **But not every large chunk in the build output is a regression** — Phase 7's
  own chunk-size check found a ~1MB eager chunk that turned out to be `@ionic/react` itself (a
  pre-existing, unavoidable framework cost from Phase 1); **Phase 8 re-confirmed the identical
  chunk again by the same grep-for-a-telltale-symbol method**, since Phase 8 added no new
  dependency at all (`package.json` diff empty) but still checked rather than assuming.
- **`SCR-18`'s "Remove follower" is a documented, deliberate gap, not an oversight** —
  `getUserProfile`'s friendship data is viewer-relative and doesn't say whether they follow you.
  `SCR-19`'s Followers list is the correct place for it (already built, already works).
- **`platform/upload.ts`'s native multipart path has never run against a real device or the real
  API** — the design is source-verified (app-architecture.md §7 reads the plugin's actual native
  code, not an inferred behaviour), and the one subtlety that _was_ only discoverable by reading the
  plugin's TypeScript surface directly (not its docs) — `FileTransfer.uploadFile()` rejecting on an
  HTTP error status rather than resolving — is fixed and documented in Phase 7's `AGENT_LOG.md`
  entry. Still worth a real device test as part of the manual §19-layer-3 checklist before shipping.
- **`devicePrefsStore.uploadFullSize` (Phase 8, SCR-25 Misc) has no consumer yet** — it persists
  and defaults to `true` (matching current behaviour), but no client-side photo downscaling exists
  anywhere in this app (Phase 7's compose/edit screens only crop, never resize). Whoever eventually
  builds the downscale step on `SCR-10`/`SCR-13`'s upload path is the one who wires this toggle to
  something real — don't assume it already does something because the setting exists.
