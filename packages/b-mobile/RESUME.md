# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phase 0 is fully complete.** Merged into `main` (PR #62) after explicit user confirmation,
pulled into this worktree (`b-mobile-initial`) via `git merge origin/main`, re-verified green
here (`typecheck && lint && test`, 226 tests). `b-visual` (renamed from `b-tokens` mid-Phase-0),
the `b-view`/`b-view-backup` split, and the `b-api` transport/multipart seams are all live on
`main` and in this worktree. **No `b-mobile` app code exists yet — Phase 1 has not started.**

One open housekeeping item, not yet actioned: `../b-oss-b-mobile-prereqs` (worktree + local/
remote `b-mobile-prereqs` branch) should be cleaned up now its PR is merged, per CLAUDE.md — but
only after asking the user, per the standing rule on destructive actions. Don't delete it
unprompted.

## Last completed step

Merged PR #62, merged `origin/main` into `b-mobile-initial`, verified, pushed. Updated `PLAN.md`
or `AGENT_LOG.md` to reflect the `b-tokens`→`b-visual` rename and Phase 0's completion.

## Next intended step

1. If not already done: ask the user whether to remove the `b-mobile-prereqs` worktree/branch
   (local + remote) now that its PR is merged. Don't delete without a yes.
2. Start **Phase 1** on this branch (`b-mobile-initial`) — the `b-mobile` package skeleton:
   `package.json`/`tsconfig.json`/`vite.config.ts` (with the dev CORS proxy for
   `api.blipfoto.com`)/`capacitor.config.ts`/`index.html`; `src/platform/*` stubs with web
   fallbacks per app-architecture.md §4's table; `src/app/` shell (Ionic `IonApp`/`IonMenu`/
   `IonRouterOutlet`, route table to placeholder screens per §5's route table, `OverlayProvider`
   stub); `src/data/client.ts` + `errors.ts` (§7); `accountsStore` skeleton; ESLint
   `no-restricted-imports` scoped to `src/platform/**` (mirror the existing electron/chrome
   pattern in `eslint.config.cjs`); `.env.example` additions — `VITE_BLIPFOTO_CLIENT_ID`,
   `VITE_OAUTH_REDIRECT_URI=bmobile://oauth/`, `VITE_NOTIFY_SERVICE_URL`,
   `VITE_NOTIFY_REGISTRATION_SECRET`, `VITE_MAP_TILES_KEY` — all blank placeholders, never a real
   value. Verify: `vite dev` boots to an empty Browse route in a desktop browser; typecheck/lint/
   test green; root `typecheck` script gains a `tsc -p packages/b-mobile --noEmit` entry.
3. No PRs against `main` for Phase 1 onward — commit directly on `b-mobile-initial`, push
   regularly, per the plan (Phase 0 was the one exception).
4. **Before writing `b-mobile`'s own CSS-module ambient declarations**, re-read the ownership
   note in Gotchas below — this is exactly the scenario that bit `b-view-backup` in Phase 0.2, and
   `b-mobile` will be importing `b-view`'s `.tsx` source cross-package the same way starting in
   Phase 3 (`ThumbnailGrid`/`EntryDetail` reuse).

## Open decisions / blockers

None on the spec side. Still needed from the user eventually (not blocking Phase 1's start, only
needed before real device/browser testing): real `VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY`
values in a local, gitignored `.env` — never invented, never committed.

## Gotchas discovered so far (not obvious from the code)

- **`b-visual`** is the current, correct name for the shared design-tokens/style-guide package.
  It was `b-tokens` for most of Phase 0 and got renamed partway through — if anything in memory,
  an old branch, or a stale doc still says `b-tokens`, it's wrong; `b-visual` is canonical.
- `app-architecture.md` §2 undersold the `b-view` split's blast radius in two ways, both fixed:
  `b-ark-ui-chrome` also imported backup types from `b-view` (`ThumbnailGrid` itself called
  `useSearchEntries` internally — fixed by making search prop-driven); and `b-ark-chrome` has its
  own SPA-mirroring build step (`copy-b-view.mjs`) invisible to a plain import grep.
- **TypeScript gotcha for Phase 3+, when `b-mobile` itself starts importing `.tsx` source
  cross-package from `b-view`**: don't give the consuming package its own
  `declare module '*.css'`/`*.module.css` ambient file unless it truly has its own CSS Modules.
  A narrower local declaration alongside the root `types/globals.d.ts`'s broader one produces
  false "possibly undefined" errors for `.module.css` imports in files pulled in from outside the
  consuming package's `rootDir`. Full writeup in the Phase 0.2 `AGENT_LOG.md` entry
  (2026-08-03, "b-view-backup" heading).
- `b-api`'s `MultipartImpl` contract (Phase 0.3) returns raw `{status, headers?, body}`, not a
  pre-parsed/error-checked envelope — deliberate, so `b-mobile`'s eventual `platform/upload.ts`
  (Phase 7) doesn't have to reimplement Blipfoto's error-code semantics. See the Phase 0.3
  `AGENT_LOG.md` entry if this needs revisiting when that phase actually arrives.
