# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–7 are all complete and pushed to `b-mobile-initial`.** Phase 0 (prerequisite `b-oss`
refactor) is merged into `main`. The app now has: a working Vite/Ionic/Capacitor skeleton, the full
28-screen route table, a real OAuth round and full account-management flow, real `SCR-01`/`SCR-30`,
a functional write-gate, real Browse/Tag-Entries/Entry-Detail/Full-screen-Photo/Entry-Metadata
screens, a full social action bar on `SCR-06` (star/favourite/follow/comment, all optimistic),
inline comment reply/edit/delete/report, real `SCR-15`/`SCR-16`/`SCR-31`, a working hidden-members
system, real profile screens (`SCR-17`/`SCR-18` sharing one implementation),
followers/following/pending-requests/refused-followers/awards (`SCR-19`–`SCR-22`), the
people-list variant of hidden-member handling, real `SCR-03` Search and `SCR-04` Map (MapLibre GL
JS, lazy-loaded), `platform/geolocation.ts` — and, as of Phase 7, a full compose/publish/edit
pipeline: real `SCR-09`–`SCR-14` (photo capture/pick, entry details with a publish-eligibility-
aware date picker, the BBCode description editor, a location picker reusing `SCR-04`'s MapLibre
machinery, entry edit/replace-photo, and the upload-progress list), a durable background upload
queue (`state/uploadQueueStore.ts` + `flows/uploadQueueRunner.ts`) with capped-backoff retry and
killed-process recovery, real `platform/camera.ts` and `platform/upload.ts` (hand-built multipart
body over `@capacitor/file-transfer`), `react-easy-crop`-based cropping (`SCR-10`'s coordinate crop
wired; `SCR-25`'s avatar JPEG crop utility built but not yet wired to a screen), `FLW-13`'s
owner-only Edit/Replace-photo/Delete on `SCR-06`'s overflow menu, and `FLW-18`'s daily reminder
(`platform/localNotifications.ts` + `flows/reminderFlow.ts`, data model built and fully wired to
the publish/account-removal/mode-change paths, with no `SCR-25` toggle UI yet). Full monorepo
`typecheck && lint && test && build` green (436 tests, confirmed stable across 3 repeated
full-suite runs). **Phase 8 (Settings & device-level screens) has not started.**

## Last completed step

Committed and pushed `feat(b-mobile): Phase 7 — Compose & publish (SCR-09-14, FLW-12/13/18)` and
`docs(b-mobile): log Phase 7 completion, point RESUME at Phase 8`. This is Phase 7's full scope per
`PLAN.md`'s checklist, including everything RESUME's own prior "Next intended step" section called
for. Three real bugs found and fixed before shipping, all documented in detail in AGENT_LOG.md's
Phase 7 entry — worth reading in full before touching the same modules again:

1. `FileTransfer.uploadFile()` rejects on an HTTP error status (unlike `fetch()`, which resolves) —
   the native `multipartImpl` must distinguish "the server responded with an error envelope" (return
   it as a normal result) from "the request never reached the server" (rethrow as a transport
   failure), or every write/validation/forced-logout error from a native publish/edit gets
   misclassified as `NetworkError`.
2. A literal `on: {hour, minute}, repeats: true` local-notification schedule cannot "skip just
   today" on cancel-and-reschedule (§12) if today's time hasn't passed yet — the fix anchors at an
   explicit `at` `Date` (+ `every: 'day'` for the ongoing daily repeat) computed by app code instead.
3. An effect depending on a value that its own success path clears (`EditEntryScreen`'s
   `isCurrentDraft`, flipped by `Save`'s `clearDraft()`) re-triggers itself right after succeeding —
   fixed with a `useRef` seeded once, not a reactive dependency.

Also worth knowing before starting Phase 8: `react-easy-crop`/`maplibre-gl` are both confirmed
correctly excluded from the eager bundle (checked via `npm run build`'s own chunk output, per this
project's established verification pattern) — `maplibre-gl` is one chunk shared between `SCR-04`
and the now-also-lazy `SCR-12`; `react-easy-crop` is folded into `ComposeEntryScreen`'s own ~32KB
lazy chunk. The one large _eager_ chunk (~1.05MB minified/217KB gzip) is `@ionic/react`/
`@ionic/core`'s own framework code — a pre-existing cost of the Phase-1 Ionic decision, not
something Phase 7 added; don't mistake it for a new regression if `npm run build`'s warning about
chunks over 500KB is seen again without first checking what's actually inside the flagged chunk.

## Next intended step

Start **Phase 8 — Settings & device-level screens** on `b-mobile-initial` (no PR), per `PLAN.md`'s
phase list: `SCR-25`/`SCR-29`, `FLW-17`.

1. **Read `SCR-25`, `SCR-29` and `FLW-17` first** — same deferred-until-the-phase-starts approach
   used for every phase so far.
2. **`devicePrefsStore` grows to its full shape** — `SCR-25`'s General/Journal/Misc sections. Two
   pieces already exist and just need a UI: `confirmAccountBeforeReaction` (Phase 4's gate is fully
   built, permanently off until this phase's toggle exists) and `reminders` (Phase 7's
   `flows/reminderFlow.ts` is fully built and wired into publish/account-removal/mode-change — this
   phase only needs to add the on/off + hour/minute picker UI calling `setReminderEnabled()`, which
   doesn't exist yet anywhere in the app).
3. **`SCR-25`'s avatar crop** — `components/PhotoCropper.tsx` and `data/imageCrop.ts`'s
   `cropToJpegBlob()` (pixel-rect → canvas-drawn, re-encoded JPEG `Blob`) are already built, from
   Phase 7, specifically for this. Check what's actually needed to wire it to `PUT user/settings`'s
   `avatar` field (a `FileSource`, same shape the compose flow already uses) before assuming
   anything else needs building.
4. **`config/countries`/`config/locales`** — check what `b-api` already returns
   (`getCountries()`/`getLocales()` likely already exist per the pattern every other phase has
   found — verify, don't assume) before writing new fetchers.
5. **Opt-in web-link `<activity-alias>` toggle** — pulled forward from Phase 10 per `PLAN.md`. This
   is Android manifest / native-project territory (an `<activity-alias>` entry gated by a runtime
   preference) — check how much of Phase 10's Android-project scaffolding needs to exist first, or
   whether the toggle itself (a `devicePrefsStore` boolean + a placeholder wiring note) is all that's
   in scope until Phase 10's `android/` project exists to actually hold the manifest entry.
6. **Privacy-policy/delete-account links** — check `docs/AppSpec/` for whether these are just
   external links (`platform/browser.ts#openUrl`) or need anything more.
7. **Verify**: full monorepo `typecheck && lint && test && build`, four-state coverage for every new
   screen, multiple repeated full-suite `npm test` runs (this project's pattern — do at least 2,
   more if anything looks flaky). Check `npm run build`'s own chunk-size output if anything new pulls
   in a large dependency — established as this project's standard verification step since Phase 6,
   applied again in Phase 7 (see "Last completed step" above for how to interpret a flagged chunk
   correctly rather than assuming it's a new regression).

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking Phase 8's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a local `.env` — never invented by me,
never committed. The OAuth round and every live data/action/write screen built so far (now
including compose/publish/edit) remain untested against the real API for the same env-var reason —
expected, matches the spec's own stance that this isn't a pre-build gate. The multipart upload path
in particular (§7's TODO H) has never run against a real device or the real API — closed by
source-reading per app-architecture.md, not spiked, and the manual on-device checklist (§19 layer 3)
is still the user's own pass once there's a signed build to install.

## Gotchas discovered so far (not obvious from the code)

- **`b-visual`** is the current, correct name for the shared design-tokens/style-guide package.
- **Cross-package `.tsx` source imports need care with ambient CSS declarations.** Don't add a
  package-local `declare module '*.module.css'` to `b-mobile` unless it truly has its own CSS
  Modules — the root `types/globals.d.ts` already covers everything. Full writeup: Phase 0.2's
  `AGENT_LOG.md` entry (2026-08-03).
- **`b-api`'s existing methods aren't fully trustworthy against the spec just because one with
  the right name exists** — check what it actually returns/does before building on it. Found
  repeatedly: the multipart seam (Phase 0.3), `verifyToken()` not returning `scope` (Phase 2),
  `getEntry`'s `returnFriendships` option (Phase 4). The same discipline paid off differently in
  Phase 7: reading `@capacitor/camera`'s _current_ API (`takePhoto`/`chooseFromGallery`) before
  building against the deprecated `getPhoto`/`pickImages` revealed `MediaResult.metadata` already
  provides what would otherwise have needed a hand-rolled EXIF parser. Don't assume every phase
  will find a gap or a shortcut — but keep checking before building on a method/plugin API just
  because its name or reputation matches.
- **No headless browser available in this sandbox** — `playwright install --with-deps` needs
  root. Verification uses jsdom-rendered Testing Library smoke tests instead. Don't re-attempt
  `playwright install --with-deps` expecting a different result. **The same gap applies to
  anything else that needs a real renderer** — Phase 6 hit this again for `maplibre-gl` (no
  WebGL/canvas in jsdom) and mocked the library wholesale rather than trying to run it; Phase 7
  applied the identical treatment to `react-easy-crop` (mocked `components/PhotoCropper.tsx`
  wholesale in `ComposeEntryScreen`'s tests) — mock at the boundary, test the component's own
  logic, is the template for any future screen wrapping a rendering-heavy third-party library.
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
  any test exercising a multi-await async handler — used throughout Phase 7's compose/upload-queue
  screen tests for exactly this reason.
- **`IonAlert` renders its buttons into the DOM unconditionally, regardless of `isOpen`** — a bare
  `screen.getByText('X')` can match a hidden alert's own button as easily as a real trigger
  button. Scope trigger queries with `{ selector: 'ion-button' }`; for the alert's own destructive
  button, `document.querySelector('button.alert-button-role-destructive')` (a plain DOM query)
  works when there's only one such alert on the screen. **Phase 7 extended this**: once a screen
  has _multiple distinct_ destructive `IonAlert`s (`SCR-06` now has four — Unfollow, Hide,
  delete-comment, delete-entry), that bare query matches whichever renders first in source order,
  not necessarily the one actually open. Scope through the alert's own `header` attribute instead:
  `document.querySelector('ion-alert[header="…"] button.alert-button-role-destructive')`.
- **`IonLabel` didn't render its children in this jsdom test setup** on at least one occasion
  (Phase 4) — root cause not fully diagnosed. `IonButton`'s `aria-label` prop also didn't reach the
  rendered `<ion-button>`'s DOM attributes (Phase 6's `MapScreen` my-location test) —
  `screen.getByText('My location', { selector: 'ion-button' })` worked reliably instead. Phase 7's
  `components/BBCodeToolbar.tsx` sidesteps both preemptively by rendering plain `<button>`s, not
  `IonButton`/`IonLabel`, the same choice `UserRow.tsx` made in Phase 5. Check for this class of gap
  before reaching for `getByLabelText`/`getByRole` on any future Ionic component.
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
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: documented
  in `flows/accountsFlow.ts`'s own docstring. Not a correctness bug.
- **Blipfoto's exact registration/terms/help page URLs aren't stated anywhere in the spec** —
  `SCR-01`'s "Create account" link points at the bare `https://www.blipfoto.com` root with a TODO.
  Worth checking again in Phase 8 if `SCR-25`'s privacy-policy/delete-account links hit the same gap.
- **A large third-party dependency pulled in by a single screen needs an explicit lazy-loading
  check, not just a green typecheck/lint/test** — inspect `npm run build`'s own chunk-size output
  whenever a new screen adds a heavyweight dependency. `MapScreen` and (Phase 7) `LocationPickerScreen`
  share one lazy `maplibre-gl` chunk; `ComposeEntryScreen` is lazy-loaded specifically because of
  `react-easy-crop`. **But not every large chunk in the build output is a regression** — Phase 7's
  own chunk-size check found a ~1MB eager chunk that turned out to be `@ionic/react` itself (a
  pre-existing, unavoidable framework cost from Phase 1, not something that phase added); grep the
  flagged chunk's own contents for a telltale symbol before assuming a new dependency leaked in.
- **`devicePrefsStore.confirmAccountBeforeReaction` and `devicePrefsStore.reminders` both have no
  UI to toggle them yet** — `SCR-25` (Phase 8) adds both. The gating/scheduling logic that reads
  them (`flows/useAccountConfirmGate.tsx`, `flows/reminderFlow.ts`) is fully built and correct now;
  `confirmAccountBeforeReaction` is permanently off and no account has a reminder configured, in
  practice, until Phase 8's toggle/picker UI exists.
- **`SCR-18`'s "Remove follower" is a documented, deliberate gap, not an oversight** —
  `getUserProfile`'s friendship data is viewer-relative and doesn't say whether they follow you.
  `SCR-19`'s Followers list is the correct place for it (already built, already works).
- **`platform/upload.ts`'s native multipart path has never run against a real device or the real
  API** — the design is source-verified (app-architecture.md §7 reads the plugin's actual native
  code, not an inferred behaviour), and the one subtlety that _was_ only discoverable by reading the
  plugin's TypeScript surface directly (not its docs) — `FileTransfer.uploadFile()` rejecting on an
  HTTP error status rather than resolving — is fixed and documented in Phase 7's `AGENT_LOG.md`
  entry. Still worth a real device test as part of the manual §19-layer-3 checklist before shipping.
