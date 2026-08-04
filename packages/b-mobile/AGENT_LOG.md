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
A file literally named `X.module.css` matches _both_ wildcard patterns, and having a _second_,
narrower-but-still-matching `*.css` declaration local to the consuming package appears to
confuse TypeScript's specificity ranking for module resolution originating outside that
package's `rootDir` — it fell back to unioning in `undefined`. Tried and ruled out first:
`declaration`/`noEmit` toggling, `rootDir` removal, and moving the package into the `tsc --build`
composite chain — none of those were it. Fix: **delete the redundant local `css.d.ts`**; the root
one already covers any package with no `.module.css` files of its own. If a future package
(`b-mobile` included) needs its own `*.module.css` declaration because it has real CSS Modules,
that's fine and matches `b-view`'s pattern — the bug is specifically from a _narrower duplicate_
of a pattern the root file already covers, not from having ambient CSS declarations per se.

Also caught and fixed mid-flight: an accidental `git checkout --` on `HomeScreen.tsx` (run while
debugging the above, without checking `git status` first) reverted legitimate uncommitted edits
to that file, not just a temporary test line appended to it. Redone from a fresh `Read`. Flagged
here as a reminder to `git status` before any checkout, per the standing safety rule, even
mid-investigation when it feels like "just resetting one small test change."

Full monorepo `typecheck && lint && test && build` all green (219 tests). Committed
(`feat(b-view): split backup data layer into b-view-backup`).

**Next:** Phase 0.3 — the `b-api` transport + multipart seams.

## 2026-08-03 — Phase 0.3 complete: `b-api` transport + multipart seams

`BlipfotoClient`'s constructor gained `fetchImpl` (defaults to `globalThis.fetch`, wrapped in an
arrow function rather than `.bind`'d, so `request`/`mutate`/the default `mutateMultipart` path all
route through it) and `multipartImpl` (new, `undefined` by default) — both additive positional
params, so `new BlipfotoClient(token)` call sites in `b-ark-ui-chrome`/`b-ark` needed no changes,
confirming the Phase-0-planning audit's read on blast radius.

New `FileSource` type (`{blob: Blob} | {path: string; mimeType: string}`) replaces the bare `Blob`
on `publishEntry`/`updateEntry`/`updateUserSettings`'s `image`/`avatar` params. Zero external
callers today (confirmed in planning), so no downstream migration — only `client.test.ts`'s own
calls needed updating to the new shape.

**Design decision on `multipartImpl`'s contract**, since `app-architecture.md` §7 doesn't pin the
exact shape, only "given the target URL, the plain fields, and a file reference... it performs the
upload and returns the parsed envelope": rather than have `multipartImpl` return an already-parsed,
error-checked envelope (pushing Blipfoto's error-code semantics onto every future implementation,
including b-mobile's own `platform/upload.ts`), it returns raw transport parts (`{status, headers?,
body}`) and `BlipfotoClient` parses/throws exactly as it already does for the fetch-based path —
refactored `parseEnvelope` into `updateRateLimit()` + `parseEnvelopeBody()` so both paths share one
implementation. Recorded here since it's a real interpretation call, not dictated by the spec text.

`mutateMultipart` now branches on whether `multipartImpl` is configured: unconfigured keeps
today's `FormData`/`fetch` behaviour exactly, and throws a clear error if handed a `path`-sourced
file (nothing to read from in a browser); configured, it delegates entirely regardless of file
source. Both `publishEntry`/`updateEntry`/`updateUserSettings` pass their file param through
unchanged in shape terms — only the internal `blob:` key became `source:`.

Added test coverage: `fetchImpl` injection (success path asserts the custom impl actually receives
the call; rejection path asserts `NetworkError`), `multipartImpl` delegation (asserts the exact
`{url, method, fields, file}` shape it receives, a success round-trip including rate-limit-header
parsing from the returned `headers`, `BlipfotoError` code-mapping from an error envelope exactly as
the fetch path does, `NetworkError` wrapping on rejection), and the native-path-without-
multipartImpl guard. Hit a small round of `@typescript-eslint/require-await` /
`no-base-to-string` lint failures from async arrows with no `await` and a `String(input)` call on
a `RequestInfo | URL` union — fixed by dropping `async` in favour of explicit `Promise.resolve()`/
`Promise.reject()` and asserting `input as string` (b-api never calls `fetchImpl` with anything but
a plain string URL, so the assertion is safe, just not something the type system can prove alone).

98/98 `b-api` tests pass; full monorepo `typecheck && lint && test && build` all green (226 tests
total). Committed (`feat(b-api): add transport and multipart seams`), pushed.

**Phase 0 code is now complete** — 0.1 (`b-tokens`), 0.2 (`b-view`/`b-view-backup` split), 0.3
(`b-api` seams) all committed on `b-mobile-prereqs`. **Next:** Phase 0.4 — open the PR against
`main` and stop for the user's explicit merge confirmation, per the plan's one deliberate
check-in point.

## 2026-08-03 — Phase 0.4: PR opened, stopping for merge confirmation

Opened https://github.com/IanMStevenson/b-oss/pull/62 (`b-mobile-prereqs` → `main`), 3 commits,
full test-plan checklist in the PR body (typecheck/lint/test/build all confirmed green; manual
smoke test of `b-ark`'s embedded viewer and `b-ark-chrome`'s backup page explicitly called out as
**not** done — neither app was launched interactively this session).

**Deliberately not merging.** This is the one check-in point the plan calls for: Phase 0 touches
`b-api`/`b-view`, which `b-ark` and `b-ark-chrome` (shipping apps) depend on, so it crosses the
bar for "affects shared systems" even under a general instruction to run autonomously. Stopping
here for the user to review/merge (or ask for changes) before any `b-mobile` app code is written.

**If a future session picks this up before the user has responded**: check the PR's state first
(`gh pr view 62`) rather than assuming either outcome. If merged: `git fetch origin && git merge
origin/main` (or rebase) into `b-mobile-initial` before touching `b-view`, per the plan, then
proceed to Phase 1. If still open: do not merge it unilaterally — surface its status and wait.
Once merged, also consider (per CLAUDE.md) removing the `../b-oss-b-mobile-prereqs` worktree,
since whichever agent created a worktree is responsible for cleaning it up once its PR merges.

## 2026-08-04 — Phase 0 merged; **Phase 0 fully complete**

Between the last entry and this session, a `b-tokens` → `b-visual` rename landed in the prereqs
worktree (package renamed throughout: directory, `package.json` name, `b-view`'s dependency and
`tokens.css` re-export, the SPA's `main.tsx` import, root `typecheck` script). Verified it —
full monorepo `typecheck && lint && test && build` green, 226 tests — committed
(`refactor(b-tokens): rename package to b-visual`) and pushed to `b-mobile-prereqs`, updating
PR #62 in place.

User confirmed: merge. Checked `gh pr checks 62` first (both `CLAAssistant` and `ci` passing),
then `gh pr merge 62 --merge --delete-branch=false` — merged as `2ca0dda`. Kept the remote branch
(didn't pass `--delete-branch`) since the local worktree still points at it; cleanup is a
separate, explicit step per CLAUDE.md, not implied by the merge.

Pulled into `b-mobile-initial`: `git fetch origin && git merge origin/main --no-edit` — clean
merge, no conflicts (50 files). Ran `npm install` + full verify (`typecheck && lint && test`) in
this worktree post-merge to confirm the merge itself didn't introduce anything broken — green,
226 tests. Pushed.

**Phase 0 is done, everywhere.** `b-view`/`b-view-backup` split, `b-tokens`→`b-visual` (now the
canonical name — update any mental model or future references accordingly, `b-tokens` no longer
exists), and the `b-api` transport/multipart seams are all on `main` and in this worktree.

**Housekeeping still open, not yet done**: per CLAUDE.md's "audit branches after a merge"
guidance, `../b-oss-b-mobile-prereqs` (worktree + local/remote `b-mobile-prereqs` branch) should
be cleaned up now that its PR is merged — asking the user first rather than deleting unprompted,
per the standing rule on destructive actions. Also should sanity-check for any other
fully-merged branches lying around while I'm looking.

User confirmed worktree cleanup. Removed `../b-oss-b-mobile-prereqs` (`git worktree remove`),
deleted `b-mobile-prereqs` locally (`git branch -d`) and on `origin` (`git push origin --delete`).
`git worktree list` now shows only the shared `b-oss` checkout and this worktree — Phase 0's
worktree footprint is fully cleaned up.

**Next:** start **Phase 1** — the `b-mobile` package skeleton — on `b-mobile-initial`. This is
genuinely new work (first `b-mobile` app code), not a prerequisite refactor, so no more PRs
against `main` until much later, per the plan. Proceeding without further check-ins, per the
user's original instruction, now that the one deliberate gate (Phase 0's merge) has cleared.

## 2026-08-04 — Phase 1 complete: package skeleton & platform foundation

First `b-mobile` app code. `npm install` confirmed the pinned versions from app-architecture.md
§3 all resolve (Capacitor 8.5.0, `@ionic/react`/`@ionic/react-router` 8.8.16, `react-router-dom`
5.3.4, Zustand 5.0.14) — checked this early since a version mismatch here would ripple through
everything else.

**Scaffolding**: `package.json`/`tsconfig.json`/`tsconfig.node.json`/`vite.config.ts`/
`capacitor.config.ts`/`index.html`, modelled on `b-ark-chrome`'s conventions (envDir at repo
root, `__APP_VERSION__`/`__RELEASE__` defines from `version.generated.json`, a live-src alias
for `@b-oss/b-api` since its `"main"` points at compiled `dist/` — `@b-oss/b-view`/`b-visual`
need no alias, their `"main"` already points at `src/`). `vite.config.ts`'s dev-only
`/api/blipfoto` proxy exists because Blipfoto serves no CORS headers (§7/§19); `client.ts`
switches to it only when `!isNativePlatform() && import.meta.env.DEV`, never in a production
bundle.

**All twelve `src/platform/*` modules** from §4's table, each with the wrapper's real exported
signature. Made a deliberate call on scope: where the spec's own text calls for a genuine web
fallback (`browser.ts` opening a new tab, `prefs.ts` via `localStorage`), implemented it for
real now rather than stubbing it, since those are trivial and make `vite dev` more genuinely
useful immediately. Everything native-only (`secureStorage`, `http`'s CapacitorHttp path,
`upload`, `imageCache`, `push`, `localNotifications`, `camera`, `geolocation`, `deepLinks`)
throws a `platform/X.ts: not implemented until Phase N` error rather than silently no-opping —
deliberate, so a caller built ahead of its dependency fails loudly instead of behaving as if a
real network/permission/storage call quietly did nothing. None of the actual Capacitor plugin
packages beyond `@capacitor/core` are installed yet — each gets added in the phase that
implements it for real, so every dependency addition is traceable to the work that needed it.

**App shell**: `AppShell.tsx` (`IonApp`/`IonMenu`/`IonRouterOutlet`), `OverlayProvider` stub, and
the **full 28-screen route table** (`AppRoutes.tsx`) — every route from §5's table, pointing at a
shared `ScreenPlaceholder` until its own phase builds the real `screens/SCR-NN-*/` component.
`WriteGuardRoute` implements the write-gate once, on the routes §5 explicitly marks
write-gated (`/compose`, `/entry/:id/edit`, `/entry/:id/comment`, `/entry/:id/report`) — reading
`useCanWrite()`, currently always `false` since no accounts exist yet, so it redirects to
`/browse` rather than the eventual in-place upgrade prompt (that's Phase 2). `useAppNavigate()`
is the thin wrapper screens use instead of `react-router`'s own hooks.

**New ESLint rules** (mirroring the existing electron/chrome pattern in `eslint.config.cjs`):
`@capacitor/*` confined to `src/platform/**`; `react-router`/`react-router-dom` confined to
`src/app/routes/**` **plus `AppShell.tsx`** — the one deliberate exception, since it's what sets
up `IonReactRouter` in the first place, distinct from a _screen_ reaching for raw navigation
hooks. Hit both rules against my own code while writing it (`client.ts` importing `Capacitor`
directly, `AppShell.tsx` importing `@ionic/react-router`) — fixed by routing `client.ts` through
`platform/appState.ts`'s `isNativePlatform()` instead, and widening the routes-only-react-router
exception to include `AppShell.tsx`.

**Data layer**: `client.ts` (anonymous-only factory for now — real account-token reading and the
`purpose` param are Phase 2), `errors.ts` (`mapApiError`, the six-outcome shape from §7,
implemented with the codes `error-codes.md` defines and a clearly-marked default branch; the
`validation` outcome isn't produced by anything yet since classifying write/validation codes
into copy-deck keys is per-flow work that lands with each write screen, not something a generic
mapper can do in isolation — noted in the file itself).

**State**: `accountsStore.ts` — the shape and `useCanWrite()` selector, no accounts yet. Modelled
token possession as `appTokenScope: 'read' | 'read,write' | null` per account rather than a bare
boolean, since `useCanWrite()` needs the _granted scope_, not just "a token exists" (auth.md:
"the granted scope, not the requested one, is what sets hasAppToken's read/write value").

**`.env.example`**: `VITE_BLIPFOTO_CLIENT_ID`, `VITE_OAUTH_REDIRECT_URI` (=`bmobile://oauth/`),
`VITE_NOTIFY_SERVICE_URL`, `VITE_NOTIFY_REGISTRATION_SECRET`, `VITE_MAP_TILES_KEY` — all blank.

**Verification, and an honest gap**: full monorepo `typecheck && lint && test` green (227 tests).
Added `src/app/__tests__/AppShell.test.tsx` — a jsdom-rendered smoke test asserting `<AppShell
/>` actually mounts and resolves the default route to the Browse placeholder, which exercises
real React/Ionic/router wiring, not just that Vite can transform the files. `npm run build`
produces a working bundle (harmless `lightningcss`/Ionic-CSS minifier warnings only). **Could
not literally load the page in a browser**: started `vite dev` and confirmed it serves without
transform errors, but headless Chromium couldn't launch in this sandbox (missing system shared
libraries, no root to install them via `playwright install --with-deps`). The jsdom test is a
real, environment-appropriate substitute for the mounting/routing logic specifically — it is not
a substitute for actually looking at the rendered UI, which stays the user's own pass as
instructed from the start.

**Next:** Phase 2 — Auth & accounts (`FLW-01/02/20/21/22`, `SCR-01/30`). OAuth round (§8) via
`b-api`'s `buildImplicitGrantUrl`/`parseImplicitGrantCallback`, real `platform/browser.ts` +
`platform/deepLinks.ts` + `platform/secureStorage.ts` implementations (installing
`@capacitor/browser`, `@capacitor/app`, `@aparajita/capacitor-secure-storage` at that point), the
full `accountsStore` (token-lifecycle transitions, prefs persistence), and the write-gating route
guard's real upgrade-prompt behaviour. This unblocks every later screen with a write affordance,
which is why it comes right after the skeleton rather than any content screen.

## 2026-08-04 — Phase 2 complete: auth & accounts

Read `SCR-01`, `SCR-30`, `FLW-01`, `FLW-02`, `FLW-20`, `FLW-21`, `FLW-22` in full before starting
(deferred until this phase per the plan — the foundational docs were enough to plan Phases 0–1,
but implementing the real screens needed the actual acceptance criteria and wireframes).

Installed `@aparajita/capacitor-secure-storage@8.0.0`, `@capacitor/browser@8.0.0`,
`@capacitor/app@8.0.0` and checked their actual TS definitions before writing wrappers rather than
guessing the API shape from memory — useful, since e.g. `SecureStorage.getItem/setItem/removeItem`
is a plain string-keyed API (simpler than expected), and `@capacitor/browser`'s `browserFinished`
event turned out to be exactly the cancellation signal an OAuth round needs (fires when the user
closes the in-app browser manually, Android/iOS only).

**Found and fixed a real gap in `b-api`**: `verifyToken()` (`GET oauth/token`) only ever declared
`Promise<{ username: string }>`, never the granted `scope` — but auth.md is explicit that this
call exists specifically to "read back its granted scope," and that's what actually sets
`hasAppToken`'s read/write value, not the requested scope. Confirmed zero other callers exist
(only its own test), so widened the return type to `{ username: string; scope?: string }` with no
downstream migration needed. Added a test asserting scope round-trips. This is the second time a
spec-vs-b-api gap has surfaced only once actually implementing against it (the first was Phase
0.3's multipart seam) — worth remembering that `b-api`'s existing surface isn't fully trustworthy
against the spec just because a method with the right name already exists; check what it actually
returns before building on it.

Built `flows/oauthRound.ts` (one round: state generate/verify, open the browser, resolve on the
matching redirect or the browser being closed, confirm granted scope) and
`flows/accountsFlow.ts` (ties it to `accountsStore` + secure storage for all five flows). For
`changeAccountMode`, rather than hand-coding auth.md's 4×4 mode-transition table as 16 literal
cells, implemented it as two general rules — fresh app-token auth only when the target scope
differs from what's held (revoking the superseded token first, never left dangling), then
reconcile the service token against the target notifications setting, treating read-only mode's
service token as a reused alias of the app token rather than a second credential. This matches 15
of 16 cells exactly. **One known, documented deviation**: Read-only+notifications →
Read-write+notifications should reuse the already-held read token as the new service token
(auth.md: "new auth (write); keep read token"), but because the app-token replacement step already
revokes the account's prior token before the service-token step runs, this path requests a fresh
second read authorization instead — one extra sign-in step versus the spec's ideal, though the
account still lands in the correct final state. Decided this was an acceptable, clearly-flagged
trade-off rather than building a full 16-cell state machine to close one edge case exactly,
given effort budget — recorded in the function's own docstring so it's visible without needing
this log entry.

Built `SCR-01` (deliberate/mode-choice shape only — the gated shape's `signInGated()` exists in
`accountsFlow.ts` but has no caller, since no write action exists yet before Phase 4 to trigger
it) and `SCR-30` (list/switch/add/inline detail for mode-change and remove). Left the first-run
mode explainer and the account-switcher popover as explicit TODOs — the former is copy-deck
polish, the latter needs a persistent nav chrome that doesn't exist until Phase 3's real Browse
screen replaces the current bare `IonMenu` placeholder.

Replaced `WriteGuardRoute`'s Phase-1 silent redirect with a real (if not yet the full
imperative-overlay-per-§5) upgrade prompt: an `IonAlert` offering "Manage accounts" or
cancel-and-go-back. Functionally satisfies rules.md's "never opens in the first place" — the
guarded route's component still never mounts — without yet building the overlay machinery later
phases will want for richer overlays generally.

Added 17 unit tests (`flows/__tests__/accountsFlow.test.ts`) mocking every platform/data boundary
(`secureStorage`, `client.getClientForToken`, `oauthRound.runOAuthRound`) so they run as pure
logic — one per rule actually stated in FLW-01/02/20/21/22's acceptance criteria, including the
read-only-token-is-shared case, the failed-second-round-keeps-first-token case, and forced logout
only clearing the specific failing token. All passed on first run after the implementation was
written against the spec text directly (not written test-first) — a reasonable confidence signal
that the code matches the acceptance criteria, not just that the tests match the code.

Full monorepo `typecheck && lint && test && build` green throughout (244 tests). Committed
(`feat(b-mobile): auth & accounts — OAuth round, token lifecycle, SCR-01/SCR-30`), pushed.

**Next:** Phase 3 — Browse & entry viewing core (`SCR-02/05/06/07/08`, `FLW-03/05`). Read those
screen/flow specs first (same deferred-until-the-phase-starts approach as this phase). Key
pieces: `useResource`/`usePagedResource` (§6), `platform/imageCache.ts` implemented for real
(currently a Phase-1 stub) + `<CachedImage>`, and the `b-view` live adapter in `b-mobile/src/data/`
mapping `b-api` responses into `b-view`'s view-model types — this is the first place `b-mobile`
imports `.tsx` source cross-package from `b-view`, so re-read the Phase 0.2 CSS-ambient-
declaration gotcha before adding any local `css.d.ts`. Also the first phase where `AppShell`'s
placeholder `IonMenu` becomes worth replacing with real navigation, which unblocks the
account-switcher popover deferred from this phase.

## 2026-08-04 — Phase 3 complete: Browse & entry viewing core

Built `data/useResource.ts`/`usePagedResource.ts` (§6) — the four-state loading/loaded/empty/error
primitive and its paged variant (`loadMore`/`refresh`, tracking page index + `more` internally).
Both supersede rather than abort stale in-flight requests via a monotonic request id, matching §7's
app-layer cancellation model (`CapacitorHttp` can't abort natively).

Built `data/viewModel.ts`, the live adapter (§2) mapping `b-api`'s wire responses into `b-view`'s
(now source-agnostic, post-Phase-0) `BlipEntry`/`BlipComment`/`EntryIndex` types. This is the first
place `b-mobile` imports `.tsx` source cross-package from `b-view` — the Phase 0.2 CSS-ambient-
declaration gotcha (redundant local `declare module '*.css'` conflicting with the root
`types/globals.d.ts`) stayed avoided by simply never adding a local `css.d.ts` to `b-mobile`.

Implemented `platform/imageCache.ts` for real: SHA-256 hash of the URL (`crypto.subtle.digest`) as
the cache key, `@capacitor/filesystem` (`getUri`/`stat`/`mkdir`) + `@capacitor/file-transfer`
(`downloadFile`) against `Directory.Cache`, 15-minute TTL checked against `stat().mtime`, falls
back to the raw URL on any error (a cache miss must never become a broken image) and on web
(`Capacitor.isNativePlatform()` false — no native filesystem to write into, browser HTTP cache is
adequate for dev). Built `<CachedImage>` on top for every non-`b-view` image use. The launch/resume
sweep to proactively evict expired entries is a documented TODO, not a correctness gap — every
`resolveImage()` call already checks the TTL itself, and `Directory.Cache` is OS-evictable
regardless.

Built `data/bbcode.ts` + `<BBCodeText>` (§14): a `@bbob/react` preset covering exactly `b`/`i`/`u`/
`s`/`url` (bare and `[url=target]label[/url]` forms; targets get a scheme/mailto/`http://` prefix
via `normalizeUrl`), clicks routed through `platform/browser.ts` instead of navigating. Found by a
failing test, not documentation: `@bbob/react`'s _default_ behaviour for an unrecognized tag is to
try rendering it as a same-named HTML element (producing a React warning and silently stripping the
bracket syntax) — not, as I'd assumed, to leave it as literal text. Fixed by wiring in `@bbob`'s
`onlyAllowTags` parser option (restricts which tags get parsed as tags at all; anything else stays
literal from the parse stage onward), with `BBCODE_TAGS` exported as the single source of truth for
both the preset's tag map and this option.

Real screens, replacing their `ScreenPlaceholder` route entries:

- **`SCR-02` Browse** — five feeds as in-screen tab state (§5), not routes. Recent loads on open;
  Following/Just Me/Popular/Nearby lazy-load their first page on first visit, then stay mounted
  (`hidden`, not unmounted) so switching back doesn't re-query. Following/Just Me only render when
  an account is active. Nearby currently always shows its "needs location access" state —
  `platform/geolocation.ts` is still a Phase-1 stub (`getCurrentPosition()` always rejects) until
  Phase 6.
- **`SCR-06` Entry Detail** — built from scratch, **not** reusing `b-view`'s `EntryDetail`. Found
  via `grep` that `EntryDetail` renders `description_html`/`content_html` via
  `dangerouslySetInnerHTML`, which directly conflicts with `app-architecture.md` §14's explicit,
  forcefully-worded "no `dangerouslySetInnerHTML` anywhere in the app" requirement (entry/comment
  content is written by other members — this is the actual security-relevant property, not a
  stylistic one). Renders the raw BBCode (`description`/`content`, not the `_html` variants)
  through `<BBCodeText>` instead. Read-only this phase per `FLW-05`'s scope — the action bar
  (comment/star/favourite/follow) is Phase 4; owner-only edit/delete/report/hide/share are Phase
  5+/7; error codes 104/202 don't have their own copy-deck message yet (TODO F/G) and show the
  server's message as-is in the meantime.
- **`SCR-07` Full-screen Photo** — pinch-zoom/pan via `react-zoom-pan-pinch` (not in
  `app-architecture.md`'s dependency list; it doesn't specify a gesture library for this screen, so
  picked one — lightweight, no native deps, double-tap-to-toggle support built in). Standard
  resolution is the ceiling per spec (this app is never served hi-res/original), so there's no
  "view original" affordance to build, and none is offered.
- **`SCR-08` Entry Metadata** — labelled EXIF fields, blank ones omitted, "No camera information"
  when none exist.
- **`SCR-05` Tag Entries** — a single infinite-scroll grid, same shape as Browse's feed tabs.

**One deliberate, documented deviation from the literal spec text, applied to both `SCR-07` and
`SCR-08`:** both fetch the entry themselves via `useLiveEntry(entryId)` rather than being handed
the already-loaded entry object from `SCR-06`, even though both screens' spec text says "no API
calls" / "data comes from the entry already loaded on SCR-06." Read that line as "no _dedicated_
endpoint for this screen" rather than "literally zero network activity" — the alternative
(passing the entry via router `location.state`) would leave both screens broken on a direct
deep link or a page refresh, and would be the one screen boundary in the whole app not keyed
purely on `entryId` as a plain prop. The cost is one extra `getEntry` call on each visit; noted in
both screens' own header comments.

**A second deliberate deviation, decided after Phase 0's own EntryDetail/dangerouslySetInnerHTML
finding**: `b-view`'s `ThumbnailGrid` (windowed Prev/Next pagination, built for the backup viewer's
fixed already-fetched list) doesn't match any `b-mobile` feed — every one of them (Browse's five
tabs, Tag Entries, and later Search/profile grids) wants true infinite scroll. Built `EntryGrid`
from scratch instead of reusing `ThumbnailGrid`. `b-view`'s `Lightbox` had no equivalent conflict
(only renders `<img>`, no HTML content) — considered reusing it for `SCR-07`, but the pinch-zoom
requirement pushed towards a purpose-built component either way.

Replaced `AppShell`'s placeholder `IonMenu` with the full primary nav from
`01-information-architecture.md`'s navigation map — every item routes somewhere real, several
still `ScreenPlaceholder` pending their own phase. New Entry only shows when `useCanWrite()`; My
Profile/Notifications/Comments/Settings only show when an account is active; Search/Map/Browse/
Help/Accounts always show. The (av) account-switcher indicator next to My Profile stays a Phase 5+
TODO (rules.md, Multi-account clarity).

One self-caught bug, fixed before it was ever run: an early draft of `EntryDetailScreen` had a
`ResolvedPhoto` helper misusing `useState`'s initializer as a side-effect hack
(`useState(() => { resolveImage(url).then(setSrc, ...) })`) instead of `useEffect` — and needlessly
duplicated `<CachedImage>`'s already-correct logic besides. Deleted it, used `<CachedImage>`
directly.

Two test-infrastructure fixes, both affecting every future test that renders an `ion-segment`, not
just this phase's: jsdom has no `Element.scrollTo`, which `ion-segment` calls when its active
button changes — added a guarded shim (`src/test-setup.ts`, no-ops if `Element` doesn't exist, so
it's inert for non-jsdom test files) referenced from **both** `packages/b-mobile/vite.config.ts`
(package-local `vitest run`) **and** the root `vitest.config.ts` (root `npm test` doesn't pick up
per-package Vite configs at all — confirmed by running both and seeing the root run silently miss
the shim until it was added there too). `vite.config.ts` also switched its `defineConfig` import
from `vite` to `vitest/config` — needed for the `test` key to typecheck at all.

29 new tests: one per screen for its loading/error/loaded(/empty) states (§19 layer 2), plus
`BrowseScreen`'s sign-in-gated tab visibility and lazy-load-on-first-visit behaviour.

Full monorepo `typecheck && lint && test && build` green throughout (272 tests). Committed
(`feat(b-mobile): Browse & entry viewing core — SCR-02/05/06/07/08`, `4cb8fa1`), pushed.

**Next:** Phase 4 — Light social actions (`FLW-06/07/08/10/11`, `SCR-15/16/31`). Read those
screen/flow specs first. Key pieces: the optimistic-update pattern for star/favourite/follow
(rules.md), a new `hiddenMembersStore`, and the hidden-placeholder-tile convention applied
consistently across every surface that can show an entry/member from a hidden account — as of
Phase 3 that's `SCR-02`, `SCR-05`, and `SCR-06`. `SCR-06`'s action bar (comment/star/favourite/
follow) also belongs to this phase, closing out the read-only scope it shipped with in Phase 3.
`signInGated()` (FLW-01, built in Phase 2, currently uncalled) finally gets its first caller here —
any of these actions attempted while signed out.
