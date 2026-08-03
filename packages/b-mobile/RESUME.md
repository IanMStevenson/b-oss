# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phase 0 is fully done on my end and blocked on the user.** All three sub-phases (0.1
`b-tokens`, 0.2 `b-view`/`b-view-backup` split, 0.3 `b-api` seams) are committed and pushed on
`b-mobile-prereqs` (worktree `../b-oss-b-mobile-prereqs`, off `origin/main`). Full monorepo
`typecheck && lint && test && build` green (226 tests). **PR opened:
https://github.com/IanMStevenson/b-oss/pull/62 — deliberately not merged.** This is the plan's
one check-in point; everything stops here until the user reviews/merges it (or asks for changes).
No `b-mobile` app code exists yet anywhere.

## Last completed step

Opened PR #62 (`b-mobile-prereqs` → `main`) with the full test-plan checklist in its body.

## Next intended step

**A session resuming this should check `gh pr view 62` first, not assume.**

- **If PR #62 is still open**: nothing to do but wait — don't merge it, don't start Phase 1. If
  the user asks for changes, make them on `b-mobile-prereqs` in `../b-oss-b-mobile-prereqs`,
  push, and the PR updates automatically.
- **If PR #62 is merged**: in `../b-oss-b-mobile-initial` (this worktree),
  `git fetch origin && git merge origin/main` (or rebase) before writing any `b-mobile` app code
  — building against the un-split `b-view` would bake in coupling the split exists to remove.
  Then consider removing the `../b-oss-b-mobile-prereqs` worktree (CLAUDE.md: whichever agent
  created a worktree cleans it up once its PR merges) — ask first, don't just do it. Then start
  Phase 1 (package skeleton) on `b-mobile-initial`. No more PRs against `main` until much later,
  per the plan.
- **If PR #62 was closed without merging**: stop and ask the user what they want instead —
  don't guess.

## Open decisions / blockers

**Blocked on the user**: PR #62 needs review/merge decision before anything else in this project
can proceed. Also eventually needed from the user (not blocking Phase 1's start, just needed
before real device/browser testing): `VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a
local `.env` — Phase 1's `.env.example` gets blank placeholders only.

## Gotchas discovered so far (not obvious from the code)

- `app-architecture.md` §2 undersells the `b-view` split's blast radius in two ways, both now
  fixed: `b-ark-ui-chrome` also imports backup types from `b-view` (`ThumbnailGrid` itself called
  `useSearchEntries` internally — a real hook dependency fixed by making search prop-driven, not
  just a type re-export); and `b-ark-chrome` has its own SPA-mirroring build step
  (`copy-b-view.mjs`) invisible to a plain `@b-oss/b-view` import grep since it's an
  npm-workspace/shell reference, not a TS import.
- `b-view/src/components/EntryDetail.module.css` (and the SPA's inline error styles) used
  `--rag-red` — fixed via a new `--color-danger` semantic token in `b-tokens`.
- **TypeScript gotcha for Phase 3+, when `b-mobile` itself starts importing `.tsx` source
  cross-package from `b-view`**: don't give the consuming package its own
  `declare module '*.css'`/`*.module.css` ambient file unless it truly has its own CSS Modules.
  A narrower local declaration (e.g. `*.css` only) alongside the root `types/globals.d.ts`'s
  broader one produces false "possibly undefined" errors for `.module.css` imports in files
  pulled in from outside the consuming package's `rootDir`. Full writeup in the Phase 0.2
  `AGENT_LOG.md` entry.
- `MultipartImpl`'s contract (Phase 0.3) is a documented interpretation, not spec-dictated: it
  returns raw `{status, headers?, body}`, not a pre-parsed/error-checked envelope — `b-api` keeps
  envelope-parsing and error-code semantics centralized so `b-mobile`'s eventual
  `platform/upload.ts` doesn't have to reimplement them. See the Phase 0.3 `AGENT_LOG.md` entry if
  this needs revisiting when Phase 7 actually implements `platform/upload.ts`.
