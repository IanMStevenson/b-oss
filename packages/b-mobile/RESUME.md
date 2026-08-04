# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phase 0 (prerequisite refactor) and Phase 1 (package skeleton) are both complete and pushed to
`b-mobile-initial`.** The `b-mobile` package exists with a working Vite/Ionic/Capacitor
skeleton, all 12 `src/platform/*` boundary modules, the full 28-screen route table (pointing at
placeholders), the write-gate, the anonymous-only client factory, error mapper, and the
`accountsStore` shape. Full monorepo `typecheck && lint && test && build` green (227 tests).
**Phase 2 (Auth & accounts) has not started.**

## Last completed step

Committed and pushed `feat(b-mobile): package skeleton and platform foundation` (commit
`77285db`). This is Phase 1 done in full, per `PLAN.md`'s own checklist.

## Next intended step

Start **Phase 2 — Auth & accounts** on `b-mobile-initial` (no PR, per the plan — only Phase 0
got one):

1. `platform/secureStorage.ts` — implement for real against `@aparajita/capacitor-secure-storage`
   (install it now; currently only `@capacitor/core` is a dependency). Key scheme
   `token:<accountId>:<purpose>`.
2. `platform/browser.ts` — implement the native path against `@capacitor/browser` (install it).
   Web fallback (new-tab open) already exists from Phase 1.
3. `platform/deepLinks.ts` — implement against `@capacitor/app`'s `appUrlOpen` (install
   `@capacitor/app`).
4. The OAuth round itself (app-architecture.md §8, steps 1–7): `b-api`'s
   `buildImplicitGrantUrl()`/`parseImplicitGrantCallback()` (check these exist already in
   `b-api` — they're referenced by the spec as "existing"), `state` generation/verification,
   `GET oauth/token` to confirm issuance + read granted scope, the two-token
   (read-write + notifications) double-round case.
5. Full `accountsStore`: token-lifecycle transitions per auth.md's mode-change table, `prefs`
   persistence (identity + flags only, never tokens), forced-logout handling (`FLW-02`).
6. `SCR-01` (Sign In) and `SCR-30` (Accounts) real screens, replacing their `ScreenPlaceholder`
   route entries in `AppRoutes.tsx`.
7. `WriteGuardRoute`'s real behaviour: the in-place "this account is read-only" upgrade prompt
   instead of the current redirect-to-`/browse` placeholder.
8. Verify: typecheck/lint/test, plus whatever jsdom-level testing is practical for the OAuth
   round (the round itself needs a device/browser to fully exercise — flag that honestly rather
   than claiming full coverage, same as Phase 1's browser-check gap).

This phase unblocks every later screen with a write affordance, which is why it's next rather
than a content screen (Browse/Entry Detail come in Phase 3).

## Open decisions / blockers

None on the spec side — `app-architecture.md` states no open questions, and Phase 1 didn't
surface any either, beyond the two ESLint self-violations already fixed (see `AGENT_LOG.md`).
Still needed from the user eventually, not blocking Phase 2's start: real
`VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a local `.env` — never invented by me,
never committed.

## Gotchas discovered so far (not obvious from the code)

- **`b-visual`** is the current, correct name for the shared design-tokens/style-guide package
  (was `b-tokens` for most of Phase 0, renamed partway through).
- **Cross-package `.tsx` source imports need care with ambient CSS declarations** — see the
  Phase 0.2 `AGENT_LOG.md` entry (2026-08-03). Don't add a package-local
  `declare module '*.module.css'` unless that package truly has its own CSS Modules; the root
  `types/globals.d.ts` already covers everything else. `b-mobile` doesn't have this problem yet
  (no cross-package `.tsx` imports until Phase 3's `b-view` component reuse) but will need to
  remember this when that lands.
- **`b-api`'s `MultipartImpl` contract** (Phase 0.3) returns raw `{status, headers?, body}`, not
  a pre-parsed envelope — `b-api` keeps error-code semantics centralized so `platform/upload.ts`
  (Phase 7) doesn't have to reimplement them.
- **No headless browser available in this sandbox** — `playwright install --with-deps` needs
  root (not available) for the shared libraries Chromium needs to launch. Phase 1's "vite dev
  boots to Browse" verification used a jsdom-rendered Testing Library smoke test instead
  (`src/app/__tests__/AppShell.test.tsx`), which genuinely exercises the React/Ionic/router
  mounting logic but is not a substitute for actually looking at the rendered UI. If a future
  session wants real screenshots, this constraint is still true unless the sandbox changes —
  don't re-attempt `playwright install --with-deps` expecting a different result.
- **ESLint's `@capacitor/*`-confined-to-`platform/**`** rule caught `src/data/client.ts`
  importing `Capacitor` directly for `isNativePlatform()` — fixed by routing through
  `platform/appState.ts`'s exported `isNativePlatform()` instead. Same pattern applies to any
  future non-platform file that needs a native/web branch: go through an existing `platform/`
  export, don't import `@capacitor/core` directly.
- **`AppShell.tsx` is a deliberate, sole exception to "react-router only in `routes/`"** — it's
  in the ESLint override's `files` list alongside `src/app/routes/**` because it's what sets up
  `IonReactRouter` itself. If a screen or component ever seems to need a similar exception,
  that's very likely a sign it should be using `useAppNavigate()` instead, not a cue to widen
  this list further.
