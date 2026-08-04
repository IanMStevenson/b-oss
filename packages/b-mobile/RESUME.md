# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0–5 are all complete and pushed to `b-mobile-initial`.** Phase 0 (prerequisite `b-oss`
refactor) is merged into `main`. The app now has: a working Vite/Ionic/Capacitor skeleton, the full
28-screen route table, a real OAuth round and full account-management flow, real `SCR-01`/`SCR-30`,
a functional write-gate, real Browse/Tag-Entries/Entry-Detail/Full-screen-Photo/Entry-Metadata
screens, a full social action bar on `SCR-06` (star/favourite/follow/comment, all optimistic),
inline comment reply/edit/delete/report, real `SCR-15`/`SCR-16`/`SCR-31`, a working hidden-members
system, and — as of Phase 5 — real profile screens (`SCR-17`/`SCR-18` sharing one implementation),
followers/following/pending-requests/refused-followers/awards (`SCR-19`–`SCR-22`), and the
people-list variant of hidden-member handling (marked, not suppressed). Full monorepo
`typecheck && lint && test && build` green (330 tests, confirmed stable across 6+ repeated
full-suite runs). **Phase 6 (Search & Map) has not started.**

## Last completed step

Committed and pushed `feat(b-mobile): Phase 5 — Profiles & connections (SCR-17–22, FLW-09)`
(commit `e2f934d`). This is Phase 5's full scope per `PLAN.md`'s checklist — the one deliberately
deferred piece (`SCR-18`'s "Remove follower") is documented inline in `ProfileScreen.tsx`, not an
oversight.

## Next intended step

Start **Phase 6 — Search & Map** on `b-mobile-initial` (no PR):

1. **Read `SCR-03` (Search), `SCR-04` (Map), `FLW-04` (search entries & people), `FLW-14` (browse
   on the map) first** — same deferred-until-the-phase-starts approach used for every phase so
   far.
2. `platform/geolocation.ts` gets implemented for real against `@capacitor/geolocation` — it's
   been a Phase-1 stub (`getCurrentPosition()` always rejects) since Phase 1, which is why
   Browse's Nearby tab (built in Phase 3) has never actually loaded anything — it's always shown
   its "needs location access" state in every manual check so far. This is the point where that
   finally becomes testable end-to-end.
3. New `platform/mapTiles.ts` behind MapLibre GL JS — check what's actually installed/available
   before assuming a specific package; nothing map-related has been added to `package.json` yet.
4. `SCR-03`'s Entries tab is straightforward (reuses `EntryGrid`/`usePagedResource`, same shape as
   every other feed this app has built so far). Its **People tab is new territory**: check
   `b-api`'s `searchUsers` (confirmed to exist in Phase 5's audit, not yet called from anywhere in
   `b-mobile`) returns the same lightweight `BlipUser` shape `components/UserRow.tsx` already
   expects — if so, reuse `UserRow` directly rather than building a second person-row component.
5. Debounced search input — this is the first screen needing that; §7's request-id supersession
   pattern (already used by `useResource`/`usePagedResource`) is the model to follow for both the
   search debounce and the map's pan/zoom-triggered entry reload, not a new mechanism.
6. Verify: typecheck/lint/test, four-state coverage for the new screens. Given this phase's history
   of `IonAlert`-button-text collisions (see Gotchas below) — Map/Search are less alert-heavy than
   Phase 5's screens, but if a confirm dialog appears anywhere here, apply the same two patterns
   from the start rather than rediscovering them.

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking Phase 6's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a local `.env` — never invented by me,
never committed. **`VITE_MAP_TILES_KEY` becomes directly relevant this phase** for the first time
(earlier phases didn't need it) — the map tile provider itself still needs choosing/confirming
against whatever `platform/mapTiles.ts` ends up requiring; don't assume a specific provider without
checking what the env var name implies or what's cheapest/simplest to wire up. The OAuth round and
every live data/action screen built so far remain untested against the real API for the same
env-var reason — expected, matches the spec's own stance that this isn't a pre-build gate.

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
  of the social-graph endpoints found no gaps this time, for what it's worth — don't assume every
  phase will find one, but keep checking.
- **No headless browser available in this sandbox** — `playwright install --with-deps` needs
  root. Verification uses jsdom-rendered Testing Library smoke tests instead. Don't re-attempt
  `playwright install --with-deps` expecting a different result.
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
  `.dispatchEvent()` for any test exercising a multi-await async handler (gated writes are the
  main case in this codebase — there will be more of these in Phase 7's compose flow).
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
  throughout the project — `IonLabel` specifically is the one component that hasn't. If a future
  screen needs it and hits the same symptom, this is a known open question, not a new bug.
- **`b-view`'s `EntryDetail` and `ThumbnailGrid` are not reused by `b-mobile`, on purpose** —
  `EntryDetail`'s `dangerouslySetInnerHTML` conflicts with §14's ban; `ThumbnailGrid`'s windowed
  pagination doesn't fit any feed here. `EntryGrid`/`BBCodeText` were built instead and are now
  reused everywhere a grid or BBCode render is needed, including `SCR-17`/`SCR-18`'s Entries/Faves
  tabs and comment text.
- **A friendship-status button reading "Following" collides with a "Following" nav link right next
  to it** (found on `SCR-18`, Phase 5) — both `EntryDetailScreen` and `ProfileScreen` now label
  that button **"Unfollow"** (the action, not the state) to avoid this. Keep this in mind if any
  future screen adds another follow-relationship affordance near a "Following" label.
- **`SCR-07`/`SCR-08`/`SCR-15`/`SCR-16` all deliberately avoid depending on a prior screen's
  in-memory data** — `SCR-07`/`SCR-08` refetch via `useLiveEntry(entryId)` for deep-link
  resilience; `SCR-15`/`SCR-16` instead use router `location.state` for their reply/edit/report
  context, since that context has no deep-link use case at all. See `useAppNavigate.ts`'s doc
  comment for which pattern fits which case.
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: documented
  in `flows/accountsFlow.ts`'s own docstring. Not a correctness bug.
- **Blipfoto's exact registration/terms/help page URLs aren't stated anywhere in the spec** —
  `SCR-01`'s "Create account" link points at the bare `https://www.blipfoto.com` root with a TODO.
- **`platform/geolocation.ts` is still a Phase-1 stub** — Phase 6 (next) is where this finally gets
  implemented for real; Browse's Nearby tab (Phase 3) has been visibly non-functional (always
  shows "needs location access") the whole time as a direct consequence.
- **`platform/mapTiles.ts` doesn't exist yet, and no map library is installed** — both are Phase 6
  scope, starting fresh.
- **`devicePrefsStore.confirmAccountBeforeReaction` has no UI to toggle it yet** — `SCR-25`
  (Phase 8) adds the switch. The gating logic that reads it (`flows/useAccountConfirmGate.tsx`)
  is fully built and correct now; it's permanently off in practice until then.
- **`SCR-18`'s "Remove follower" is a documented, deliberate gap, not an oversight** —
  `getUserProfile`'s friendship data is viewer-relative (do you follow them) and doesn't say
  whether they follow you, which is what that action needs. `SCR-19`'s Followers list is the
  correct place for it (already built, already works) — don't add a duplicate, weaker version to
  `SCR-18` by guessing at the relationship instead of confirming it.
