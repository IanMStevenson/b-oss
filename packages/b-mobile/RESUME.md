# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–6 are all complete and pushed to `b-mobile-initial`.** Phase 0 (prerequisite `b-oss`
refactor) is merged into `main`. The app now has: a working Vite/Ionic/Capacitor skeleton, the full
28-screen route table, a real OAuth round and full account-management flow, real `SCR-01`/`SCR-30`,
a functional write-gate, real Browse/Tag-Entries/Entry-Detail/Full-screen-Photo/Entry-Metadata
screens, a full social action bar on `SCR-06` (star/favourite/follow/comment, all optimistic),
inline comment reply/edit/delete/report, real `SCR-15`/`SCR-16`/`SCR-31`, a working hidden-members
system, real profile screens (`SCR-17`/`SCR-18` sharing one implementation),
followers/following/pending-requests/refused-followers/awards (`SCR-19`–`SCR-22`), the
people-list variant of hidden-member handling (marked, not suppressed), and — as of Phase 6 — real
`SCR-03` Search (Entries + People tabs, debounced) and `SCR-04` Map (MapLibre GL JS, lazy-loaded),
with `platform/geolocation.ts` finally implemented for real (Browse's Nearby tab is now actually
functional, not just visibly showing its "needs location access" state). Full monorepo
`typecheck && lint && test && build` green (351 tests, confirmed stable across 9 repeated
full-suite runs across two commits). **Phase 7 (Compose & publish) has not started.**

## Last completed step

Committed and pushed `feat(b-mobile): Phase 6 — Search & Map (SCR-03/04, FLW-04/14)` and
`docs(b-mobile): log Phase 6 completion, point RESUME at Phase 7`. This is Phase 6's full scope per
`PLAN.md`'s checklist. One deviation worth knowing about going in: the first working build put
`maplibre-gl` behind a static top-level import in `MapScreen.tsx`, which defeated
app-architecture.md §20's explicit "MapLibre must be lazy-loaded" requirement (it bundled straight
into the main chunk). Fixed by `React.lazy()`-wrapping the `/map` route's component in
`AppRoutes.tsx` instead of touching `MapScreen.tsx` — Vite code-splits at the dynamic `import()`
boundary, so `MapScreen.tsx`'s own static `maplibre-gl` import now ships in its own chunk (~946KB),
fetched only when `/map` is actually visited. **Worth checking `npm run build`'s own chunk-size
output for any future screen that pulls in a large dependency** — neither typecheck nor lint would
ever catch this class of regression.

## Next intended step

Start **Phase 7 — Compose & publish** on `b-mobile-initial` (no PR), per `PLAN.md`'s phase list:

1. **Read `SCR-09`–`SCR-14` and `FLW-12`/`FLW-13`/`FLW-18` first** — same deferred-until-the-phase-
   starts approach used for every phase so far.
2. `platform/upload.ts` — the hand-built multipart body over `@capacitor/file-transfer`. This does
   **not** need a device spike: app-architecture.md §7 already closed the multipart question by
   reading the plugin's actual native source (not by testing on-device), and states plainly why
   `params` can't be used (the API needs fields in the body, not the query string, and iOS silently
   drops `params`-supplied fields even though Android doesn't). Just implement what §7 specifies.
3. A durable `uploadQueueStore` + a runner module in `src/flows/` (**not** a React component — §9
   is explicit the runner has non-React consumers). One item at a time, serial; retry policy is
   capped exponential backoff for `transport` outcomes only (§9's table), everything else moves
   straight to `failed`.
4. Real `platform/camera.ts` — still a Phase-1 stub (`takePhoto()`/`pickPhoto()` both reject),
   same shape `platform/geolocation.ts` was in before Phase 6. `resultType: Uri`, not base64 (§15).
5. `react-easy-crop` needs installing — check what's actually in `package.json` first, same
   "don't assume a specific package is already there" instruction every phase gets. **Two crop
   operations, not one** — §15 is explicit these must not be conflated: `SCR-10`'s entry
   thumbnail crop sends _coordinates_ (`thumbnail_crop` as `x,y,w` floats) alongside the
   _untouched_ photo; `SCR-25`'s avatar crop (Phase 8, but the cropper component itself is built
   now) sends an actual _cropped JPEG_ since there's no crop-coordinate field for avatars.
6. BBCode editor toolbar for `SCR-11` — five buttons (bold/italic/underline/strikethrough/link,
   one conditional per §14's exact tag set — not the spec's own stale "bold, italic, link, quote"
   wording, which app-architecture.md §21 already corrected). Reuse the plain-`<textarea>`-with-a-
   ref approach `SCR-15`'s comment editor (Phase 4) already established, for the same reason:
   wrapping the selection needs real `selectionStart`/`selectionEnd`, which means reaching past
   Ionic's shadow DOM if `IonTextarea` were used instead.
7. `SCR-12` location picker — likely reuses the `MapScreen`/`platform/mapTiles.ts` machinery just
   built in Phase 6, adapted for a single draggable marker rather than a browsable region with
   live entry markers. Check what's actually reusable as-is vs. what needs a second, simpler
   component before assuming either way.
8. `local-notifications` (`@capacitor/local-notifications`) for `FLW-18`'s daily reminder.
   **Suppression is by cancellation on successful upload, never a fire-time network check** — §12
   is explicit a scheduled local notification can't run app code before firing, so "cancel today's
   occurrence and schedule tomorrow's" on every successful publish is the only correct shape.
   **Do not request `SCHEDULE_EXACT_ALARM`/`USE_EXACT_ALARM`** — inexact scheduling is correct per
   §12's Play-policy reasoning, not a shortcut.
9. Verify: full monorepo `typecheck && lint && test && build`, four-state coverage for every new
   screen, multiple repeated full-suite `npm test` runs (this project's pattern — do at least 2,
   more if anything looks flaky). Given Phase 6 found a real chunk-size regression only by reading
   `npm run build`'s own output, do the same check here: `SCR-09`–`SCR-14` are all synchronous
   route components today (no lazy-loading precedent to follow for them specifically), but if
   `react-easy-crop` or anything else pulls in a large dependency, check the build output before
   calling the phase done.

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking Phase 7's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a local `.env` — never invented by me,
never committed. The OAuth round and every live data/action screen built so far (now including
Search and Map) remain untested against the real API for the same env-var reason — expected,
matches the spec's own stance that this isn't a pre-build gate.

## Gotchas discovered so far (not obvious from the code)

- **`b-visual`** is the current, correct name for the shared design-tokens/style-guide package.
- **Cross-package `.tsx` source imports need care with ambient CSS declarations.** Don't add a
  package-local `declare module '*.module.css'` to `b-mobile` unless it truly has its own CSS
  Modules — the root `types/globals.d.ts` already covers everything. Full writeup: Phase 0.2's
  `AGENT_LOG.md` entry (2026-08-03).
- **`b-api`'s existing methods aren't fully trustworthy against the spec just because one with
  the right name exists** — check what it actually returns/does before building on it. Found
  three times: the multipart seam (Phase 0.3), `verifyToken()` not returning `scope` (Phase 2),
  `getEntry`'s `returnFriendships` option not requested until Phase 4 needed it. Phase 5's audit
  of the social-graph endpoints and Phase 6's use of `searchUsers`/`searchEntries` found no gaps
  either time — don't assume every phase will find one, but keep checking before building on a
  method just because its name matches.
- **No headless browser available in this sandbox** — `playwright install --with-deps` needs
  root. Verification uses jsdom-rendered Testing Library smoke tests instead. Don't re-attempt
  `playwright install --with-deps` expecting a different result. **The same gap applies to
  anything else that needs a real renderer** — Phase 6 hit this again for `maplibre-gl` (no
  WebGL/canvas in jsdom) and mocked the library wholesale rather than trying to run it; the same
  approach (mock at the boundary, test the component's own logic) is the template for any future
  screen that wraps a rendering-heavy third-party library.
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
  it). Before adding a new derived-value selector or an effect depending on a hook's return
  object, check whether that object is _actually_ stable across otherwise-unchanged renders.
- **A raw `element.click()` in a test doesn't reliably synchronize with a handler that chains
  multiple `await`s before its first `setState`**, under the CPU contention the full 24+-file
  monorepo `npm test` run creates in this sandbox. `@testing-library/user-event`'s
  `await userEvent.click(...)` does. Default to `userEvent` over a bare `.click()`/
  `.dispatchEvent()` for any test exercising a multi-await async handler — Phase 7's compose/
  upload-queue flow is exactly the kind of multi-await handler this matters for.
- **`IonAlert` renders its buttons into the DOM unconditionally, regardless of `isOpen`** — a bare
  `screen.getByText('X')` can match a hidden alert's own button as easily as a real trigger
  button, especially since confirm dialogs often reuse the trigger's own verb ("Remove" triggers,
  "Remove" confirms). Scope trigger queries with `{ selector: 'ion-button' }`; for the alert's own
  destructive button, its text sits on a nested `<span>` that `selector` filtering can't see past
  to the parent `<button>` — use `document.querySelector('button.alert-button-role-destructive')`
  directly instead. Full writeup: Phase 5's `AGENT_LOG.md` entry, which hit this three separate
  times before settling on the pattern.
- **`IonLabel` didn't render its children in this jsdom test setup** on at least one occasion
  (`HiddenMembersScreen`'s first draft, Phase 4) — root cause not fully diagnosed. Worked around
  with a plain `<button>`/`<span>` instead, which `UserRow.tsx` (Phase 5) also does preemptively
  for exactly this reason. `IonButton`, `IonChip`, `IonText`, etc. have all rendered children fine
  throughout the project — `IonLabel` specifically is the one component that hasn't.
- **`IonButton`'s `aria-label` prop didn't reach the rendered `<ion-button>`'s DOM attributes in
  this jsdom test setup either** (found writing `MapScreen`'s my-location test, Phase 6) —
  `screen.getByLabelText(...)` couldn't find a button by its `aria-label`.
  `screen.getByText('My location', { selector: 'ion-button' })` (the same trigger-scoping pattern
  the `IonAlert` gotcha above established) worked reliably instead. Same shape as the `IonLabel`
  gap: an Ionic component whose props don't reliably reach the DOM in this test environment — check
  for this before reaching for `getByLabelText`/`getByRole` on any future `IonButton`.
- **`b-view`'s `EntryDetail` and `ThumbnailGrid` are not reused by `b-mobile`, on purpose** —
  `EntryDetail`'s `dangerouslySetInnerHTML` conflicts with §14's ban; `ThumbnailGrid`'s windowed
  pagination doesn't fit any feed here. `EntryGrid`/`BBCodeText` were built instead and are now
  reused everywhere a grid or BBCode render is needed, including `SCR-17`/`SCR-18`'s Entries/Faves
  tabs, comment text, and (Phase 6) `SCR-03`'s Entries tab.
- **A friendship-status button reading "Following" collides with a "Following" nav link right next
  to it** (found on `SCR-18`, Phase 5) — both `EntryDetailScreen` and `ProfileScreen` now label
  that button **"Unfollow"** (the action, not the state) to avoid this. Keep this in mind if any
  future screen adds another follow-relationship affordance near a "Following" label.
- **`SCR-07`/`SCR-08`/`SCR-15`/`SCR-16` all deliberately avoid depending on a prior screen's
  in-memory data** — `SCR-07`/`SCR-08` refetch via `useLiveEntry(entryId)` for deep-link
  resilience; `SCR-15`/`SCR-16` instead use router `location.state` for their reply/edit/report
  context, since that context has no deep-link use case at all. `SCR-04`'s focused mode (Phase 6)
  follows the `useLiveEntry`-style pattern too — it fetches the target entry's own coordinates via
  `fetchEntry(id)` rather than being handed them, for the same deep-link-resilience reason (a
  `?entry=<id>` URL must work standalone). See `useAppNavigate.ts`'s doc comment for which pattern
  fits which case.
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: documented
  in `flows/accountsFlow.ts`'s own docstring. Not a correctness bug.
- **Blipfoto's exact registration/terms/help page URLs aren't stated anywhere in the spec** —
  `SCR-01`'s "Create account" link points at the bare `https://www.blipfoto.com` root with a TODO.
- **A large third-party dependency pulled in by a single screen needs an explicit lazy-loading
  check, not just a green typecheck/lint/test** (Phase 6, `maplibre-gl`) — inspect
  `npm run build`'s own chunk-size output whenever a new screen adds a heavyweight dependency;
  neither typecheck nor lint nor the test suite would ever catch a static import silently bloating
  the main chunk. `MapScreen` is the one screen so far behind `React.lazy()` (wired in
  `AppRoutes.tsx`, not in the screen file itself) — the same pattern is there to copy if
  `react-easy-crop` or anything else in Phase 7 turns out to need it too.
- **`devicePrefsStore.confirmAccountBeforeReaction` has no UI to toggle it yet** — `SCR-25`
  (Phase 8) adds the switch. The gating logic that reads it (`flows/useAccountConfirmGate.tsx`)
  is fully built and correct now; it's permanently off in practice until then.
- **`SCR-18`'s "Remove follower" is a documented, deliberate gap, not an oversight** —
  `getUserProfile`'s friendship data is viewer-relative (do you follow them) and doesn't say
  whether they follow you, which is what that action needs. `SCR-19`'s Followers list is the
  correct place for it (already built, already works) — don't add a duplicate, weaker version to
  `SCR-18` by guessing at the relationship instead of confirming it.
