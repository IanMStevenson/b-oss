# b-mobile — resume point

Rewritten at the end of every phase / major milestone. Read this first, then the last 20 entries
of `AGENT_LOG.md`, then `PLAN.md`, before doing anything else — especially if this session started
with "resume".

## Status

Phase 0 in progress, in worktree `../b-oss-b-mobile-prereqs` (branch `b-mobile-prereqs`, off
`origin/main` — **not** a descendant of `b-mobile-initial`). **0.1 (`b-tokens`) and 0.2
(`b-view`/`b-view-backup` split) are done and committed.** 0.3 (`b-api` seams) not yet started.
No `b-mobile` app code exists yet — this worktree only touches the prerequisite packages.

## Last completed step

Phase 0.2: split `b-view` into `b-view` (presentational, own view-model types) and new
`packages/b-view-backup` (backup-data hooks + standalone SPA). Repointed `b-ark-ui-electron`,
`b-ark-ui-chrome`, `b-ark` (electron-builder + `b-view-files.ts`), and `b-ark-chrome` (its own
`copy-b-view.mjs`/build scripts — a repoint the original spec audit missed). Full monorepo
`typecheck && lint && test && build` green (219 tests). Committed
(`feat(b-view): split backup data layer into b-view-backup`, commit `821a149`).

## Next intended step

1. Phase 0.3: `b-api` transport + multipart seams (in `../b-oss-b-mobile-prereqs`).
   - Constructor gains `fetchImpl` (transport, defaults to `globalThis.fetch`) and
     `multipartImpl` (new, optional) params — both additive/positional, so existing
     `new BlipfotoClient(token)` call sites in `b-ark-ui-chrome`/`b-ark` are unaffected.
   - New `MultipartFileRef` type: `{ fieldName, filename, mimeType } & ({ blob: Blob } | { path:
     string })`, replacing today's `{fieldName, blob, filename}` shape on `mutateMultipart` and
     the `image`/`avatar` params of `publishEntry`/`updateEntry`/`updateUserSettings`. No other
     package calls these three methods today (confirmed in Phase-0-planning audit), so this is a
     same-PR, no-downstream-migration change.
   - Update `client.test.ts`: existing tests for the new shapes, plus a `fetchImpl`-injection
     test and a `multipartImpl`-delegation test.
2. Phase 0.4: full monorepo verify (already have a known-good baseline from 0.1+0.2 — must stay
   green), open PR from `b-mobile-prereqs` → `main`, **stop and ask the user to confirm before
   merging** — the one deliberate check-in point in the whole plan, because Phase 0 touches
   packages `b-ark`/`b-ark-chrome` already ship.
3. Once Phase 0 is merged: in `../b-oss-b-mobile-initial`, merge/pull `origin/main` before writing
   any `b-mobile` app code — building against the un-split `b-view` would bake in coupling the
   split exists to remove.
4. Phase 1 (package skeleton) onward, on `b-mobile-initial`, no more PRs until much later.

## Open decisions / blockers

None outstanding — `app-architecture.md` states "no open questions" and I have no unresolved
questions of my own at this point. The only two external inputs still needed, both explicitly the
user's to supply, not mine to guess: `VITE_BLIPFOTO_CLIENT_ID` and `VITE_MAP_TILES_KEY` real
values in a local, gitignored `.env` — `.env.example` gets blank placeholders only (Phase 1).

## Gotchas discovered so far (not obvious from the code)

- `app-architecture.md` §2 undersells the `b-view` split's blast radius in two ways, both now
  fixed: `b-ark-ui-chrome` also imports backup types from `b-view` (not just `b-ark-ui-electron`,
  and not just `useJournal`/`useEntry` — `ThumbnailGrid` itself called `useSearchEntries`
  internally, a real hook dependency, not just a type re-export — see the Phase 0.2 `AGENT_LOG.md`
  entry for how that was resolved via a prop-driven `search` interface); and `b-ark-chrome` has
  its own SPA-mirroring build step (`copy-b-view.mjs`) that a plain `@b-oss/b-view` import grep
  doesn't surface, since it's an npm-workspace/shell reference, not a TS import.
- `b-view/src/components/EntryDetail.module.css` (and the SPA's inline error styles) used
  `--rag-red` for error-state colour — a real dependency the spec doesn't mention. Fixed by adding
  `--color-danger` to `b-tokens` and repointing those rules.
- **TypeScript gotcha for any future package that imports `.tsx` source cross-package from
  `b-view`** (this will matter again in Phase 3, when `b-mobile` itself starts consuming `b-view`
  components): don't give the consuming package its own `declare module '*.css'`/`*.module.css`
  ambient file unless it has real CSS Modules of its own to declare. A narrower local declaration
  alongside the root `types/globals.d.ts`'s broader one produces false "possibly undefined"
  errors specifically for `.module.css` imports inside files pulled in from outside the consuming
  package's `rootDir`. The root ambient file already covers everything; only add a local one if
  the package truly has its own `.module.css` files (as `b-view` itself does).
- `publishEntry`/`updateEntry`/`updateUserSettings` in `b-api` have no callers anywhere else in
  the repo yet, so the multipart seam redesign (Phase 0.3, next) is contained entirely within
  `b-api` — no other package's call sites need updating.
