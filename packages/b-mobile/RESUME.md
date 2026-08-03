# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

**Phase 0 code is complete** (0.1 `b-tokens`, 0.2 `b-view`/`b-view-backup` split, 0.3 `b-api`
seams — all committed on `b-mobile-prereqs`, in worktree `../b-oss-b-mobile-prereqs`, off
`origin/main`). Full monorepo `typecheck && lint && test && build` green (226 tests) as of the
last commit. **Phase 0.4 (open PR, get merge confirmation) is next and not yet done.** No
`b-mobile` app code exists yet anywhere.

## Last completed step

Phase 0.3: `b-api` transport (`fetchImpl`) + multipart (`multipartImpl`) seams, `FileSource` type
replacing `Blob` on the three multipart-backed methods, new tests. Committed
(`feat(b-api): add transport and multipart seams`) and pushed to `origin/b-mobile-prereqs`.

## Next intended step

1. **Phase 0.4**: push is already done (each Phase 0 commit was pushed as it landed). Open a PR
   from `b-mobile-prereqs` → `main` (`gh pr create`, base `main`, head `b-mobile-prereqs`) —
   3 commits: `feat(b-tokens): add shared design-tokens package`,
   `feat(b-view): split backup data layer into b-view-backup`,
   `feat(b-api): add transport and multipart seams`.
2. **Stop there and ask the user to confirm before merging.** This is the one deliberate
   check-in point in the whole plan — Phase 0 touches `b-api`/`b-view` that `b-ark` and
   `b-ark-chrome` (shipping apps) depend on. Do not merge autonomously even though the rest of
   the plan says to run without checking in.
3. Once the user confirms and it's merged: in `../b-oss-b-mobile-initial` (this worktree),
   `git fetch origin && git merge origin/main` (or rebase, whichever the user prefers) to pick up
   Phase 0 before writing any `b-mobile` app code — building against the un-split `b-view` would
   bake in coupling the split exists to remove.
4. Then Phase 1 (package skeleton) onward, on `b-mobile-initial`, no more PRs until much later.
5. Consider whether `../b-oss-b-mobile-prereqs` worktree should be removed once Phase 0 merges
   (per CLAUDE.md: whichever agent created a worktree removes it once its PR merges) — hold off
   asking until the merge actually happens.

## Open decisions / blockers

None outstanding on the spec side. Waiting on the user for: (a) confirmation to merge the Phase 0
PR, (b) eventually, real `VITE_BLIPFOTO_CLIENT_ID`/`VITE_MAP_TILES_KEY` values in a local
`.env` (Phase 1's `.env.example` gets blank placeholders only).

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
