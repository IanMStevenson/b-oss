# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phases 0, 1, and 2 are all complete and pushed to `b-mobile-initial`.** Phase 0 (prerequisite
`b-oss` refactor) is merged into `main`. The app itself now has: a working Vite/Ionic/Capacitor
skeleton, the full 28-screen route table, a real OAuth round and full account-management flow
(sign in, switch, remove, change mode, forced logout), real `SCR-01`/`SCR-30` screens, and a
functional write-gate. Full monorepo `typecheck && lint && test && build` green (244 tests).
**Phase 3 (Browse & entry viewing core) has not started.**

## Last completed step

Committed and pushed `feat(b-mobile): auth & accounts — OAuth round, token lifecycle,
SCR-01/SCR-30` (commit `e1dd621`). This is Phase 2's core done, per `PLAN.md`'s checklist — a
few sub-items were deliberately deferred to later phases (see Gotchas below), not left
unfinished by oversight.

## Next intended step

Start **Phase 3 — Browse & entry viewing core** on `b-mobile-initial` (no PR):

1. **Read `SCR-02`, `SCR-05`, `SCR-06`, `SCR-07`, `SCR-08`, `FLW-03`, `FLW-05` first** — same
   deferred-until-the-phase-starts approach used for every phase so far. Don't skip this even
   though the foundational docs (rules.md, glossary, etc.) are already familiar.
2. `src/data/useResource.ts` / `usePagedResource.ts` (§6) — the four-state
   (loading/loaded/empty/error) fetch primitives every data-loading screen uses.
3. `platform/imageCache.ts` — currently a Phase-1 stub that throws on native; implement for real
   against `@capacitor/filesystem` + `@capacitor/file-transfer` (15-minute TTL, URL-keyed,
   disk-persisted — §10). Needs installing both packages. Plus a `<CachedImage>` component.
4. **The `b-view` live adapter** (`b-mobile/src/data/` per §2 — not a package, this is the one
   place it lives) mapping `b-api` responses into `b-view`'s view-model types (`BlipEntry`/
   `BlipComment`/`EntryIndex`/`EntryState`, defined in `@b-oss/b-view` itself post-Phase-0-split).
   **This is the first time `b-mobile` imports `.tsx` source cross-package from `b-view`** — before
   adding any local `declare module '*.module.css'` file to `b-mobile`, re-read the Phase 0.2
   gotcha below; it's about to become directly relevant for the first time.
5. Real `SCR-02` (Browse, launch destination, five in-screen feed tabs per §5 — not five routes),
   `SCR-06` (Entry Detail, the content hub), `SCR-07`, `SCR-08`, `SCR-05`, replacing their
   `ScreenPlaceholder` route entries.
6. **Replace `AppShell`'s placeholder `IonMenu` with real navigation** per
   `01-information-architecture.md`, varying by sign-in state. This is also what unblocks the
   account-switcher popover deferred from Phase 2 (needs a persistent nav chrome to anchor to).
7. Verify: typecheck/lint/test, plus per-screen four-state test coverage (§19 layer 2 — "one test
   per screen asserting its four loading/empty/error/loaded states").

## Open decisions / blockers

None on the spec side. Still needed from the user eventually, not blocking Phase 3's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a local `.env` — never invented by me,
never committed. The OAuth round built in Phase 2 is untested against the real API for the same
reason (needs a real client ID and an actual device/browser with the custom URL scheme
registered) — this is expected and matches the spec's own stance that this isn't a pre-build
spike, just ordinary first-run verification once there's a device to run it on.

## Gotchas discovered so far (not obvious from the code)

- **`b-visual`** is the current, correct name for the shared design-tokens/style-guide package
  (was `b-tokens` for most of Phase 0).
- **Cross-package `.tsx` source imports need care with ambient CSS declarations.** Don't add a
  package-local `declare module '*.module.css'` to `b-mobile` unless it truly has its own CSS
  Modules — the root `types/globals.d.ts` already covers everything. Full writeup: Phase 0.2's
  `AGENT_LOG.md` entry (2026-08-03). **This becomes directly relevant in Phase 3**, the first
  phase where `b-mobile` imports `b-view` components.
- **`b-api`'s existing methods aren't fully trustworthy against the spec just because one with
  the right name exists** — check what it actually returns/does before building on it. Found
  twice so far: the multipart seam (Phase 0.3) and `verifyToken()` not returning `scope` (Phase
  2, fixed — widened its return type, zero other callers, no migration needed).
- **`b-api`'s `MultipartImpl` contract** returns raw `{status, headers?, body}`, not a pre-parsed
  envelope — `b-api` keeps error-code semantics centralized so `platform/upload.ts` (Phase 7)
  doesn't have to reimplement them.
- **No headless browser available in this sandbox** — `playwright install --with-deps` needs
  root. Verification uses jsdom-rendered Testing Library smoke tests instead, which genuinely
  exercise mounting/routing/store logic but aren't a substitute for looking at the rendered UI.
  Don't re-attempt `playwright install --with-deps` expecting a different result.
- **`changeAccountMode`'s one known deviation from auth.md's exact transition table**: Read-only+
  notifications → Read-write+notifications requests an extra read authorization instead of
  reusing the already-held one. Documented in the function's own docstring
  (`flows/accountsFlow.ts`). The account still ends up in the correct final state — this is a
  one-extra-step inefficiency, not a correctness bug. Worth tightening if it ever becomes a real
  user complaint, not urgent.
- **`SCR-01`'s gated shape has no caller yet.** `signInGated()` (FLW-01) is fully implemented in
  `flows/accountsFlow.ts`, but nothing invokes it — no write action exists before Phase 4
  (star/favourite/comment/follow) to trigger a gated sign-in. Don't be surprised it's unused;
  it's ready and waiting, not dead code to clean up.
- **Blipfoto's exact registration/terms/help page URLs aren't stated anywhere in the spec** —
  only the OAuth authorize and developer-apps URLs are confirmed. `SCR-01`'s "Create account"
  link currently points at the bare `https://www.blipfoto.com` root with a TODO rather than
  guessing a sub-path. If the exact URL becomes known, update the `BLIPFOTO_ROOT` constant in
  `screens/SCR-01-sign-in/SignInScreen.tsx`.
