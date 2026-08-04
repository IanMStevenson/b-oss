# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–4 are all complete and pushed to `b-mobile-initial`.** Phase 0 (prerequisite `b-oss`
refactor) is merged into `main`. The app now has: a working Vite/Ionic/Capacitor skeleton, the full
28-screen route table, a real OAuth round and full account-management flow, real `SCR-01`/`SCR-30`,
a functional write-gate, real Browse/Tag-Entries/Entry-Detail/Full-screen-Photo/Entry-Metadata
screens backed by the live `b-view` data adapter, a real disk-backed image cache, BBCode rendering
— and, as of Phase 4, a full social action bar on `SCR-06` (star/favourite/follow/comment, all
optimistic), inline comment reply/edit/delete/report, real `SCR-15`/`SCR-16`/`SCR-31`, and a
working hidden-members system enforced across every grid and comment thread built so far. Full
monorepo `typecheck && lint && test && build` green (309 tests, confirmed stable across 6+
repeated full-suite runs). **Phase 5 (Profiles & connections) has not started.**

## Last completed step

Committed and pushed Phase 4 in two parts: `feat(b-mobile): Phase 4a — hidden members, device
prefs, write-gate fix` (`37bd454`) and `feat(b-mobile): Phase 4b/c — reactions, comments, report,
hidden members UI` (`959a20f`). This is Phase 4's full scope per `PLAN.md`'s checklist.

## Next intended step

Start **Phase 5 — Profiles & connections** on `b-mobile-initial` (no PR):

1. **Read `SCR-17` (My Profile), `SCR-18` (User Profile), `SCR-19` (Followers/Following), `SCR-20`
   (Pending Requests), `SCR-21` (Refused Followers), `SCR-22` (Awards), `FLW-09` first** — same
   deferred-until-the-phase-starts approach used for every phase so far.
2. `SCR-18` is the big one: the `/user/:username` route has existed (as `ScreenPlaceholder`) since
   Phase 1 and is already linked from several places (tag-entry author, `SCR-06`'s follow target,
   `SCR-31`'s hidden-member rows). Building it for real is what makes those links actually work.
3. **The hidden-member consistency requirement gets its first people-list test here.** Unlike
   grids (placeholder tile) and comments (suppressed entirely), rules.md says people lists —
   followers/following/pending requests/people search — show a hidden member's name/avatar
   marked **Hidden**, not suppressed. Don't reuse the grid/comment suppression pattern verbatim;
   this is a genuinely different treatment.
4. `FLW-09` (approve/refuse follow requests) is the first flow that writes to the _refusing_
   side of the two-safety-features distinction (rules.md, "Hiding members, and refusing
   followers") — keep the vocabulary fixed (never "block"), and remember refusing only applies to
   a pending _request_, never an existing follower (`SCR-19`'s "remove follower" is the separate,
   weaker op — still not built, no screen calls for it yet outside SCR-31's TODO).
5. Worth picking up if time allows, not blocking: the account-switcher popover deferred since
   Phase 2 (`rules.md`, Multi-account clarity) — `AppShell`'s nav chrome has existed since Phase 3,
   so the only blocker was "needs a persistent nav chrome to anchor to," which is no longer true.
6. Verify: typecheck/lint/test, four-state coverage for the new screens, and specifically a test
   for the hidden-member-marked-not-suppressed behaviour in at least one people list (this is the
   rule most likely to get silently merged with the grid/comment pattern by mistake).

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking Phase 5's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a local `.env` — never invented by me,
never committed. The OAuth round (Phase 2) and the live data/action screens (Phases 3–4) are all
untested against the real API for the same reason — needs a real client id and an actual
device/browser. Expected, matches the spec's own stance that this isn't a pre-build gate.

## Gotchas discovered so far (not obvious from the code)

- **`b-visual`** is the current, correct name for the shared design-tokens/style-guide package
  (was `b-tokens` for most of Phase 0).
- **Cross-package `.tsx` source imports need care with ambient CSS declarations.** Don't add a
  package-local `declare module '*.module.css'` to `b-mobile` unless it truly has its own CSS
  Modules — the root `types/globals.d.ts` already covers everything. Full writeup: Phase 0.2's
  `AGENT_LOG.md` entry (2026-08-03).
- **`b-api`'s existing methods aren't fully trustworthy against the spec just because one with
  the right name exists** — check what it actually returns/does before building on it. Found
  three times now: the multipart seam (Phase 0.3), `verifyToken()` not returning `scope`
  (Phase 2), and `getEntry`'s `returnFriendships` option not being requested by `fetchEntry` until
  Phase 4 needed the follow state.
- **No headless browser available in this sandbox** — `playwright install --with-deps` needs
  root. Verification uses jsdom-rendered Testing Library smoke tests instead. Don't re-attempt
  `playwright install --with-deps` expecting a different result.
- **jsdom has no `Element.scrollTo`**, which `ion-segment` (and likely other Ionic components)
  call when their active item changes — throws otherwise. Fixed with a guarded shim,
  `packages/b-mobile/src/test-setup.ts`, wired into **both** `packages/b-mobile/vite.config.ts`'s
  own `test.setupFiles` _and_ the root `vitest.config.ts`'s (root `npm test` doesn't pick up
  per-package Vite configs at all). If a future Ionic component throws a different jsdom-missing-
  API error in tests, extend this same file.
- **Two Zustand-selector footguns, same root cause, both hit in Phase 4 — worth remembering as a
  category**: a selector that returns a _newly allocated_ value (an empty array/object literal,
  or a fresh wrapper object) on every call, even when nothing actually changed, breaks
  `useSyncExternalStore`'s reference-equality snapshot check. One manifests as an infinite
  render loop (`useHiddenMembers`'s `?? []` fallback — fixed with a shared `EMPTY_HIDDEN`
  constant); the other as silently-reverted state (`useLiveEntry`'s `entryState` wrapper being
  reconstructed every render, which made a `useEffect` depending on it refire on every render and
  clobber an optimistic update the instant after it was set — fixed by depending on the stable
  inner data instead). Before adding a new derived-value selector or a `useEffect` depending on a
  hook's return object, check whether that object is _actually_ the same reference across
  otherwise-unchanged renders — many aren't, by default.
- **A raw `element.click()` in a test doesn't reliably synchronize with a handler that chains
  multiple `await`s before its first `setState`**, at least under the CPU contention the full
  24-file monorepo `npm test` run creates in this sandbox (reliable in isolation, ~50% flaky in
  the full run). `@testing-library/user-event`'s `await userEvent.click(...)` does synchronize
  correctly. Default to `userEvent` over a bare `.click()`/`.dispatchEvent()` for any test
  exercising a multi-await async handler (gated writes are the main case in this codebase).
- **`IonLabel` didn't render its children in this jsdom test setup** (`HiddenMembersScreen`'s
  first draft used it for the username and got back an empty `<ion-label />` in every dump, for
  reasons not fully root-caused). Worked around by using a plain `<button>` instead — `IonButton`,
  `IonChip`, `IonText`, etc. have all rendered children fine throughout the project; `IonLabel`
  specifically is the one component so far that hasn't. If a future screen needs `IonLabel` and
  hits the same symptom, this is a known open question, not a new bug to re-diagnose from
  scratch.
- **`b-view`'s `EntryDetail` and `ThumbnailGrid` are not reused by `b-mobile`, on purpose.**
  `EntryDetail` renders comment/description HTML via `dangerouslySetInnerHTML`, conflicting with
  `app-architecture.md` §14's ban — `SCR-06` was built from scratch rendering raw BBCode through
  `<BBCodeText>`. `ThumbnailGrid`'s windowed Prev/Next pagination doesn't fit any `b-mobile`
  feed's infinite-scroll requirement — `EntryGrid` was built from scratch. `b-view`'s `Lightbox`
  wasn't reused either, since `SCR-07`'s pinch-zoom needed a purpose-built component anyway
  (`react-zoom-pan-pinch`, not in the spec's dependency list — picked because none is specified).
- **`SCR-07`/`SCR-08` each independently call `useLiveEntry(entryId)` rather than receiving the
  entry from `SCR-06`**, despite both screens' spec text saying "no API calls" — read as "no
  _dedicated_ endpoint," not "zero network activity," for deep-link resilience. `SCR-15`/`SCR-16`
  went the other way deliberately: their context (reply/edit/report target) travels through
  router `location.state` instead, since unlike SCR-07/08 they have no deep-link use case at
  all — see `useAppNavigate.ts`'s doc comment for the general rule this follows.
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: Read-only+
  notifications → Read-write+notifications requests an extra read authorization instead of
  reusing the already-held one. Documented in the function's own docstring
  (`flows/accountsFlow.ts`). Not a correctness bug, just a one-extra-step inefficiency.
- **Blipfoto's exact registration/terms/help page URLs aren't stated anywhere in the spec** —
  `SCR-01`'s "Create account" link points at the bare `https://www.blipfoto.com` root with a
  TODO. Update the `BLIPFOTO_ROOT` constant in `screens/SCR-01-sign-in/SignInScreen.tsx` if the
  real sub-path ever becomes known.
- **`platform/geolocation.ts` is still a Phase-1 stub** (`getCurrentPosition()` always rejects),
  so Browse's Nearby tab currently always shows its "needs location access" state — expected
  until Phase 6 implements it for real.
- **`platform/mapTiles.ts` doesn't exist yet** — Phase 6 scope, needed for `SCR-04` and any
  future map affordance.
- **`devicePrefsStore.confirmAccountBeforeReaction` has no UI to toggle it yet** — `SCR-25`
  (Phase 8) adds the switch. The gating logic that reads it (`flows/useAccountConfirmGate.tsx`)
  is fully built and correct now; it's just permanently off in practice until then.
