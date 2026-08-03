# b-mobile — agent log

Append-only. One entry per significant action/decision/completed sub-task, written as it happens,
not batched. Newest entries at the bottom.

---

## 2026-08-03 — Branch/worktree setup

Created worktree `../b-oss-b-mobile-initial` on branch `b-mobile-initial` (off `origin/main`) for
this whole effort, per the user's request and the machine's per-package-of-work worktree
convention. Found pre-existing untracked spec docs (`packages/b-mobile/docs/`) sitting in the
shared `~/dev/b-oss` checkout — moved them into the new worktree (not copied — user asked for
"MOVE... uncommitted") and committed as "Initial Specifications", pushed. No PR opened yet, per
user: "We'll be working a while on this before we merge."

## 2026-08-03 — Spec read-through and planning

Read `AppSpec/` (README, 00-product, 01-information-architecture, 02-notifications, glossary,
rules) and `ImplementationSpec/` (README, app-architecture.md in full — the entry point per its
own §21 task list, platform-and-reuse.md, notification-service.md, b-api-updates.md) plus all of
`api-appendix/` (auth, data-model, endpoints, error-codes, open-questions). Screens/ and flows/
(28 + 21 files) were not read individually at this stage — the foundational docs plus
app-architecture.md's route table and screen inventory give enough to plan; individual screen
specs get read when that screen's phase starts.

Audited the current `b-oss` codebase against `app-architecture.md` §2/§21's claims about what
needs to change, since the spec's assumptions about blast radius needed checking against the real
tree rather than trusted blind:
- `b-api`: confirmed `BlipfotoClient`'s constructor is positional
  (`accessToken, baseUrl = ...`), `request`/`mutate`/`mutateMultipart` all call
  `globalThis.fetch` directly with no injection point. Confirmed `publishEntry`/`updateEntry`/
  `updateUserSettings` (the three multipart-backed methods) have **zero callers anywhere else in
  the repo** — `b-ark`/`b-ark-chrome` only ever construct `BlipfotoClient` for reads. This means
  the multipart seam redesign is a b-api-only change, no downstream call-site updates needed.
- `b-view`: confirmed `types.ts` re-exports `BlipEntry`/`BlipComment`/`JournalMetadata`/
  `EntryIndex` from `@b-oss/backup-engine`, declared as a runtime dep in `package.json`. Grepped
  every `@b-oss/b-view` import site across the repo and found the spec undersells the blast
  radius: `b-ark-ui-chrome` (`useFsaJournal.ts`, `journal-source.ts`, `BackupPage.tsx`) also
  imports backup types/hooks from `b-view`, not just `b-ark-ui-electron` as
  `app-architecture.md` §2 states. Also found `EntryDetail.module.css` uses `--rag-red` for its
  error-state colour — a real dependency on a "RAG" token the spec says should live only in
  `b-ark`'s layer. Decision: add a semantic `--color-danger` to `b-tokens`' base palette (same
  hex) and repoint that one CSS rule, rather than either keeping RAG vocabulary in `b-tokens` or
  leaving `b-view`'s error state broken.
- `b-tokens`: confirmed no pre-existing style-guide document anywhere in the repo (searched for
  `*style*guide*`, `*design*.md`, and prose mentioning colour/spacing conventions) — the "written
  style guidance" `app-architecture.md` §2 calls for has to be authored from
  `b-ark-ui-electron`'s actual CSS, not migrated from a doc that doesn't exist.
- Confirmed `eslint.config.cjs`'s existing `no-restricted-imports` pattern (electron-only-in-
  b-ark) as the template for the Capacitor platform-boundary rule and any b-view/backup-engine
  boundary rule.
- Confirmed root `tsconfig.base.json` + per-package `tsconfig.json` pattern (`b-view`'s
  `noEmit: true` non-composite style vs. `b-api`'s `composite: true`) as the template for
  `b-mobile`'s own `tsconfig.json`.

Wrote the full phase-by-phase execution plan via plan mode
(`/home/ims/.claude/plans/cosmic-foraging-scroll.md`), covering Phase 0 (prerequisite `b-api`/
`b-view`/`b-tokens` refactor, its own worktree+branch+PR, explicit merge-confirmation gate since
it touches packages `b-ark`/`b-ark-chrome` already depend on) and Phases 1–11 (the app itself, on
`b-mobile-initial`, no PRs against `main` until much later per the user's own instruction). User
approved the plan. Mirrored it into this package as `PLAN.md` per the session-discipline
requirement that these files live in `packages/b-mobile/`, not just the external plan file.

**Next:** create `../b-oss-b-mobile-prereqs` worktree on branch `b-mobile-prereqs` off
`origin/main`, and start Phase 0.1 (`b-tokens`).

## 2026-08-03 — Phase 0.1 complete: `b-tokens` package

Worktree created (`../b-oss-b-mobile-prereqs`, branch `b-mobile-prereqs`, off `origin/main`).
Note for later sessions: **this log file, and `PLAN.md`/`RESUME.md`, physically live on
`b-mobile-initial`**, but Phase 0's actual code changes are committed on the separate
`b-mobile-prereqs` branch/worktree (per the plan's worktree-per-package-of-work rule — Phase 0
must be independently mergeable). I'm updating this log via absolute path while working in the
other worktree, and committing the log update separately on `b-mobile-initial`. A cold-start
session picking this file up mid-Phase-0 should check both worktrees' `git log` to see the full
picture, not just this branch's.

Added `packages/b-tokens`: `tokens.css` (base palette, minus the three `--rag-*` vars, plus a new
`--color-danger` — see the audit entry above), `tokens.ts` (same values in TS), `package.json`/
`tsconfig.json` following `b-view`'s source-consumption pattern (`main`/`types` point at
`src/index.ts`, no build step), and `docs/style-guide.md`. Root `package.json`'s `typecheck`
script gained `tsc -p packages/b-tokens --noEmit` (same treatment as `b-view`/`b-ark-chrome`).

The style guide required actually reading `b-view`'s and `b-ark-ui-electron`'s CSS for concrete
values (type scale, spacing set, radii-by-role, hover/disabled/selection states) rather than
inventing conventions — recorded in the doc itself with the reasoning, e.g. why `--color-danger`
gets a base-layer semantic token while a full RAG triad stays app-specific. Also confirmed
`b-ark-ui-electron/src/styles/tokens.css` has a dead `--blue-info` var not present in `b-view`'s
copy (unused anywhere in the repo) — left it alone; not in scope to clean up, and it's a live
example of exactly the "duplicated values drift apart" problem `b-tokens` exists to fix.

Ran `npm install` in the new worktree to register the workspace symlink (first attempt used
`--workspaces=false`, which skips workspace linking entirely and produced no `@b-oss/*` symlinks —
noted here in case that mistake looks tempting again). `tsc -p packages/b-tokens --noEmit` and
`eslint packages/b-tokens/**/*.{ts,tsx}` both clean. Committed
(`feat(b-tokens): add shared design-tokens package`).

**Next:** Phase 0.2 — the `b-view`/`b-view-backup` split.

## 2026-08-03 — Phase 0.2 complete: `b-view`/`b-view-backup` split

Session picked back up cold mid-Phase-0.2 (two "resume" triggers landed while this was
in-flight, uncommitted). Verified real state via `git status` in `../b-oss-b-mobile-prereqs`
against these files before continuing, per the resume protocol — this file and `PLAN.md`/
`RESUME.md` had fallen behind actual progress (last entry ended at Phase 0.1), confirming the
"write log entries as you go" discipline needs tighter adherence during long uninterrupted
tool-call stretches; catching up now rather than mid-flight next time.

Moved `useJournal`/`useEntry`/`useFolderAccess`/`useFolderEntry`/`useFolderJournal`/
`useSearchEntries`, the FSA typings, and the standalone SPA (+ its vite/build config) into new
`packages/b-view-backup`. `b-view` now defines its own `BlipEntry`/`BlipComment`/`EntryIndex`/
`EntryState` (structurally close to `backup-engine`'s shapes minus pure bookkeeping fields —
`schema_version`, `backed_up_at`, `backup_app_version`, `images.web_scraped` — dropped since a
view-model has no use for them) and drops the `@b-oss/backup-engine` runtime dependency.

**`ThumbnailGrid` had a deeper coupling than the audit first showed**: it called
`useSearchEntries` directly for its in-grid search box, not just re-exporting a type. Fixed by
making search fully prop-driven (`search?: {query, onQueryChange, results, status, progress}`)
and moving the hook call to each caller (`HomeScreen.tsx`, `BackupPage.tsx`, the SPA's
`FolderApp`/`HttpApp`) — same UI behaviour (debounced via `useDeferredValue` in each caller, same
as `ThumbnailGrid` used to do internally), hook now lives with the rest of the backup-data layer.

**Two more repointing targets beyond the original audit**: `b-ark-chrome` has its own
`build`/`dev`/`dist` scripts that build the SPA and mirror it into `public/b-view-dist/` via
`scripts/copy-b-view.mjs` (deployed into users' backup folders by `BrowserBackend`) — missed in
the original blast-radius read because it's a shell-script/npm-workspace reference, not a TS
import, so it didn't show up in the `@b-oss/b-view` import grep. Repointed alongside `b-ark`'s
`electron-builder.json` (`from: ../b-view/dist-app/` → `../b-view-backup/dist-app/`) and
`b-view-files.ts`. Also fixed a stale `.gitignore` entry (`packages/b-view/src/spa/favicon.png`)
that would have let the build-generated favicon leak into `git status` as untracked forever.

**A real TypeScript gotcha, worth remembering for Phase 3+**: giving `b-view-backup` its own
`css.d.ts` (mirroring `b-view`'s, out of habit) produced ~107 phantom
`'styles' is possibly 'undefined'` errors, but only for `.module.css` imports inside `.tsx` files
pulled in cross-package from `b-view`'s source (not for `b-view`'s own standalone typecheck, and
not for `b-ark-ui-electron`/`b-ark-ui-chrome`, which import the same files but have no local
`css.d.ts` of their own). Root cause: `b-view-backup`'s local file declared `*.css` only; the
root `types/globals.d.ts` already declares both `*.css` and `*.module.css` for the whole repo.
A file literally named `X.module.css` matches *both* wildcard patterns, and having a *second*,
narrower-but-still-matching `*.css` declaration local to the consuming package appears to
confuse TypeScript's specificity ranking for module resolution originating outside that
package's `rootDir` — it fell back to unioning in `undefined`. Tried and ruled out first:
`declaration`/`noEmit` toggling, `rootDir` removal, and moving the package into the `tsc --build`
composite chain — none of those were it. Fix: **delete the redundant local `css.d.ts`**; the root
one already covers any package with no `.module.css` files of its own. If a future package
(`b-mobile` included) needs its own `*.module.css` declaration because it has real CSS Modules,
that's fine and matches `b-view`'s pattern — the bug is specifically from a *narrower duplicate*
of a pattern the root file already covers, not from having ambient CSS declarations per se.

Also caught and fixed mid-flight: an accidental `git checkout --` on `HomeScreen.tsx` (run while
debugging the above, without checking `git status` first) reverted legitimate uncommitted edits
to that file, not just a temporary test line appended to it. Redone from a fresh `Read`. Flagged
here as a reminder to `git status` before any checkout, per the standing safety rule, even
mid-investigation when it feels like "just resetting one small test change."

Full monorepo `typecheck && lint && test && build` all green (219 tests). Committed
(`feat(b-view): split backup data layer into b-view-backup`).

**Next:** Phase 0.3 — the `b-api` transport + multipart seams.
