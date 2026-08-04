# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0, 1, 2, and 3 are all complete and pushed to `b-mobile-initial`.** Phase 0 (prerequisite
`b-oss` refactor) is merged into `main`. The app now has: a working Vite/Ionic/Capacitor skeleton,
the full 28-screen route table, a real OAuth round and full account-management flow, real
`SCR-01`/`SCR-30`, a functional write-gate, and — as of Phase 3 — real Browse/Tag-Entries/
Entry-Detail/Full-screen-Photo/Entry-Metadata screens (`SCR-02/05/06/07/08`) backed by the live
`b-view` data adapter, a real disk-backed image cache, and BBCode rendering. `AppShell`'s nav menu
is the full primary nav, not a placeholder. Full monorepo `typecheck && lint && test && build`
green (272 tests). **Phase 4 (Light social actions) has not started.**

## Last completed step

Committed and pushed `feat(b-mobile): Browse & entry viewing core — SCR-02/05/06/07/08` (commit
`4cb8fa1`). This is Phase 3's full scope per `PLAN.md`'s checklist — the only things deliberately
left for later are tagged inline (see Gotchas below), not left unfinished by oversight.

## Next intended step

Start **Phase 4 — Light social actions** on `b-mobile-initial` (no PR):

1. **Read `FLW-06`, `FLW-07`, `FLW-08`, `FLW-10`, `FLW-11`, `SCR-15`, `SCR-16`, `SCR-31` first** —
   same deferred-until-the-phase-starts approach used for every phase so far.
2. The optimistic-update pattern (rules.md) for star/favourite/follow — applied to `SCR-06`'s
   (currently absent) action bar. This is the point where `SCR-06` stops being read-only and
   FLW-05's full scope closes out.
3. `signInGated()` (FLW-01, built in Phase 2 but never called yet) gets its first real caller:
   any of these actions attempted while signed out should trigger it.
4. New `hiddenMembersStore` (device-local) + the hidden-placeholder-tile convention
   (rules.md, Consistency) — apply it to every surface that can currently show an entry/member
   from a hidden account: `SCR-02` (Browse), `SCR-05` (Tag Entries), `SCR-06` (Entry Detail,
   comments). `SCR-15`/`SCR-16`/`SCR-31` are themselves new screens this phase builds.
5. Verify: typecheck/lint/test, plus per-screen four-state test coverage for the new screens, plus
   tests for the optimistic-update rollback-on-failure behaviour specifically (that's the part
   most likely to be got subtly wrong).

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking Phase 4's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a local `.env` — never invented by me,
never committed. The OAuth round (Phase 2) and the live data screens (Phase 3) are both untested
against the real API for the same reason — needs a real client id and an actual device/browser.
Expected, matches the spec's own stance that this isn't a pre-build gate.

## Gotchas discovered so far (not obvious from the code)

- **`b-visual`** is the current, correct name for the shared design-tokens/style-guide package
  (was `b-tokens` for most of Phase 0).
- **Cross-package `.tsx` source imports need care with ambient CSS declarations.** Don't add a
  package-local `declare module '*.module.css'` to `b-mobile` unless it truly has its own CSS
  Modules — the root `types/globals.d.ts` already covers everything. Full writeup: Phase 0.2's
  `AGENT_LOG.md` entry (2026-08-03). This became relevant in Phase 3 (first `b-view` `.tsx`
  import) and stayed a non-issue by just not adding a local `css.d.ts` — keep not adding one.
- **`b-api`'s existing methods aren't fully trustworthy against the spec just because one with
  the right name exists** — check what it actually returns/does before building on it. Found
  twice: the multipart seam (Phase 0.3) and `verifyToken()` not returning `scope` (Phase 2).
- **`b-api`'s `MultipartImpl` contract** returns raw `{status, headers?, body}`, not a pre-parsed
  envelope — `b-api` keeps error-code semantics centralized so `platform/upload.ts` (Phase 7)
  doesn't have to reimplement them.
- **No headless browser available in this sandbox** — `playwright install --with-deps` needs
  root. Verification uses jsdom-rendered Testing Library smoke tests instead. Don't re-attempt
  `playwright install --with-deps` expecting a different result.
- **jsdom has no `Element.scrollTo`**, which `ion-segment` (and likely other Ionic components)
  call when their active item changes — throws otherwise. Fixed with a guarded shim,
  `packages/b-mobile/src/test-setup.ts` (no-ops if `Element` doesn't exist, so it's inert outside
  jsdom). **Wired into two places, both needed**: `packages/b-mobile/vite.config.ts`'s own `test.
setupFiles` (for `vitest run` from inside the package) _and_ the root `vitest.config.ts`'s
  `test.setupFiles` (root `npm test` does **not** pick up per-package Vite configs at all — it
  only reads its own root config). If a future Ionic component throws a different jsdom-missing-
  API error in tests, extend this same file rather than creating a second one.
- **`b-view`'s `EntryDetail` and `ThumbnailGrid` are not reused by `b-mobile`, on purpose.**
  `EntryDetail` renders comment/description HTML via `dangerouslySetInnerHTML`, which conflicts
  with `app-architecture.md` §14's explicit ban — `SCR-06` was built from scratch instead,
  rendering raw BBCode through `<BBCodeText>`. `ThumbnailGrid`'s pagination is windowed Prev/Next
  pages (built for the backup viewer's fixed list), which doesn't fit any `b-mobile` feed's
  infinite-scroll requirement — `EntryGrid` was built from scratch instead. `b-view`'s `Lightbox`
  was _not_ ruled out the same way (no HTML-content conflict) but wasn't reused either, since
  `SCR-07`'s pinch-zoom requirement needed a purpose-built component anyway
  (`react-zoom-pan-pinch`, not in the spec's dependency list — no gesture library is specified
  for this screen, so one was picked: lightweight, no native deps).
- **`SCR-07`/`SCR-08` each independently call `useLiveEntry(entryId)` rather than receiving the
  entry from `SCR-06`**, despite both screens' spec text saying "no API calls" — read as "no
  _dedicated_ endpoint," not "zero network activity," to keep every screen boundary deep-link-
  resilient (same `entryId`-prop pattern as `SCR-06`). One extra `getEntry` call per visit is the
  cost; documented in both screens' own header comments.
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: Read-only+
  notifications → Read-write+notifications requests an extra read authorization instead of
  reusing the already-held one. Documented in the function's own docstring
  (`flows/accountsFlow.ts`). Not a correctness bug, just a one-extra-step inefficiency.
- **`SCR-01`'s gated shape has no caller yet** — `signInGated()` (FLW-01) is implemented but
  unused until Phase 4 gives it a write action to gate. Don't be surprised it's unused.
- **Blipfoto's exact registration/terms/help page URLs aren't stated anywhere in the spec** —
  `SCR-01`'s "Create account" link points at the bare `https://www.blipfoto.com` root with a
  TODO. Update the `BLIPFOTO_ROOT` constant in `screens/SCR-01-sign-in/SignInScreen.tsx` if the
  real sub-path ever becomes known.
- **`platform/geolocation.ts` is still a Phase-1 stub** (`getCurrentPosition()` always rejects),
  so Browse's Nearby tab currently always shows its "needs location access" state rather than
  ever loading entries — expected until Phase 6 implements it for real.
