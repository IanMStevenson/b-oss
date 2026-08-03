# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

Planning complete, user-approved. **Phase 0 not yet started.** No app code exists yet — only the
spec docs (`packages/b-mobile/docs/`) and these three discipline files are committed on
`b-mobile-initial`.

## Last completed step

Wrote and got approval for the full execution plan (mirrored in `PLAN.md`). Created `PLAN.md`,
`AGENT_LOG.md`, `RESUME.md` (this file) on `b-mobile-initial`.

## Next intended step

1. Create worktree `../b-oss-b-mobile-prereqs` on branch `b-mobile-prereqs`, cut from
   `origin/main` (**not** from `b-mobile-initial** — Phase 0 must be independently mergeable).
2. Phase 0.1: `b-tokens` package.
3. Phase 0.2: `b-view`/`b-view-backup` split.
4. Phase 0.3: `b-api` transport + multipart seams.
5. Phase 0.4: full monorepo verify, open PR against `main`, **stop and ask the user to confirm
   before merging** — this is the one deliberate check-in point in the whole plan, because Phase 0
   touches packages `b-ark`/`b-ark-chrome` already ship.
6. Once Phase 0 is merged: `git pull --ff-only` (or merge `origin/main`) into `b-mobile-initial`
   before writing any `b-mobile` app code — building against the un-split `b-view` would bake in
   coupling the split exists to remove.
7. Phase 1 (package skeleton) onward, on `b-mobile-initial`, no more PRs until much later.

## Open decisions / blockers

None outstanding — `app-architecture.md` states "no open questions" and I have no unresolved
questions of my own at this point. The only two external inputs still needed, both explicitly the
user's to supply, not mine to guess: `VITE_BLIPFOTO_CLIENT_ID` and `VITE_MAP_TILES_KEY` real
values in a local, gitignored `.env` — `.env.example` gets blank placeholders only (Phase 1).

## Gotchas discovered so far (not obvious from the code)

- `app-architecture.md` §2 undersells the `b-view` split's blast radius: `b-ark-ui-chrome` also
  imports backup types/hooks from `b-view`, not just `b-ark-ui-electron`. See `PLAN.md`'s audit
  section and the 2026-08-03 `AGENT_LOG.md` entry for the full list of files.
- `b-view/src/components/EntryDetail.module.css` uses `--rag-red` for its error-state colour —
  a real dependency the spec doesn't mention. Fixed in Phase 0.1 by adding `--color-danger` to
  `b-tokens` and repointing that one rule.
- `publishEntry`/`updateEntry`/`updateUserSettings` in `b-api` have no callers anywhere else in
  the repo yet, so the multipart seam redesign (Phase 0.3) is contained entirely within `b-api` —
  no other package's call sites need updating.
