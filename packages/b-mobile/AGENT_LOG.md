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

## 2026-08-04 — Phase 4 complete: Light social actions

Split into three commits for reviewability given the size: 4a (foundation), 4b/c (the actions,
screens, and every fix found while building them).

**4a — foundation** (`37bd454`). `platform/prefs.ts` implemented for real against
`@capacitor/preferences` — found it was still throwing on native despite Phase 2's `accountsStore`
already depending on it for persistence; a real pre-existing gap, not Phase 4 scope creep, fixed
because this phase's two new stores need it too. New `state/hiddenMembersStore.ts` (FLW-10):
per-account, device-local, persisted via prefs, switches with the active account, nothing in it
ever sent anywhere. New `state/devicePrefsStore.ts` with exactly the one field FLW-06/07 need now
(`confirmAccountBeforeReaction`, off by default) — grows into the full `SCR-25` set in Phase 8
rather than being rebuilt then. `b-view`'s `EntryIndex` gains an optional `username` (backup-engine's
own duck-typed equivalent doesn't carry one — single-journal, so it'd be redundant per entry — and
doesn't need to), populated by the live adapter, which is what lets `EntryGrid` consult the hidden
list per entry and render a placeholder tile (no thumbnail/title, still tappable through to
`SCR-06`) for a hidden member's entries. Also fixed a real bug in `WriteGuardRoute`: it showed the
read-only upgrade prompt for _both_ a read-only account and an anonymous one, but FLW-01/FLW-11 are
explicit that anonymous must go straight to a gated sign-in round instead — a read-only-account
upgrade prompt offered to an anonymous user makes no sense (there's no account to upgrade). Fixed
by branching on `activeAccount` before `canWrite`.

**4b/c — the actions themselves** (`959a20f`). `flows/reactionsFlow.ts` (star/favourite/follow/
unfollow/report) and `flows/commentsFlow.ts` (post/edit/delete comment) as pure API wrappers, same
split as `accountsFlow.ts` vs. its screens — gating and optimistic-update policy live in the
screen, not the flow. The one thing that _does_ belong in the flow: error-codes.md's 221/222
("already starred"/"already favourited") resolve as success rather than throwing — not a UI
concern, call-specific API knowledge — and 223 (daily favourite quota) surfaces as a distinct
`FavoriteQuotaError` so `SCR-06` can show its specific message.

`flows/useAccountConfirmGate.tsx` implements the "confirm the account before Star, Favourite, or a
comment/reply" dialog in full against the new `devicePrefsStore` flag, even though nothing can turn
the flag on yet (no `SCR-25`) — FLW-06/07 require the gating logic to exist regardless of when the
toggle ships, and building it now means Phase 8 only has to add a switch, not retrofit this.

`SCR-06` gets its real action bar: Star/Favourite (optimistic +1, rollback only on a genuine
refusal — the 221/222 codes leave the optimistic state alone per rules.md), Follow/Unfollow
(optimistic; unfollow confirms first; a protected target's actual resulting state — following vs.
pending — is corrected from the server's response rather than predicted client-side, since nothing
in the data available here says whether the target journal is protected ahead of time), Comment
(opens `SCR-15`), and an overflow menu (camera info when EXIF exists, Report, Hide — Hide never
offered on the active account's own entry). Comments got real inline Reply/Edit/Delete/Report,
driven entirely by the server's own per-comment action flags rather than reimplementing the
edit-is-own-only/delete-is-own-or-own-entry rules client-side. All four write actions hide
entirely (not just disable) for a signed-in read-only account; an anonymous tap routes through
`signInGated()` first — its first real caller, since Phase 2 built it with nothing to call it yet.

New screens: `SCR-15` New/Edit Comment (a plain native `<textarea>` with a ref, not `IonTextarea` —
the formatting toolbar needs real `selectionStart`/`selectionEnd` to wrap the selected text in a
BBCode tag pair, which means reaching past Ionic's shadow-DOM wrapper; a discard-confirmation guard
fires only when backing out with unsaved text). `SCR-16` Report Entry (the same `entry/report`
endpoint serves both entry and comment reports — a comment report is identified by a pre-seeded
note rather than a separate call; Hide is offered as a separate action after a successful report,
never applied automatically). `SCR-31` Hidden Members (fully device-local, no network request;
switches with the active account). Reply/edit context and report targets travel through router
`location.state` rather than a route param, since both are pure in-app handoffs with no deep-link
use case — documented this as the deciding factor directly in `useAppNavigate.ts`'s `push`/
`replace` doc comment, now that a real second case (beyond the rejected one from `SCR-07`/`SCR-08`
in Phase 3) exists to justify the pattern.

**Two real bugs found and fixed while building this, both would have shipped to a real device:**

1. `EntryDetailScreen`'s reaction-seeding `useEffect` depended directly on `useLiveEntry`'s
   `entryState` — a wrapper object `useLiveEntry` reconstructs on _every_ render, even when the
   underlying resource hasn't changed. Depending on it made the effect refire on every render,
   including the render the optimistic update itself causes — so tapping Star would flash
   "Starred" for one frame and then silently revert, permanently. Found by a test that looked
   correct but intermittently failed only under the full monorepo `npm test` run (never in
   isolation) — chased through several false leads (cross-file store pollution, `localStorage`
   sharing, CPU-contention timeout tuning) before finding the real cause via direct debug logging:
   `starEntry` mock was being called and resolving successfully every time, but the DOM never
   updated. Fixed by keying the effect off `entryState.data` (stable — a property of `useResource`'s
   actual React state) instead of the wrapper. A second, related bug in the same code: every
   optimistic `setReaction` used `prev ? {...prev, ...} : prev` — silently a no-op if `prev` was
   still `null` (the seeding effect hadn't committed for the first time yet), which is exactly the
   window a fast tap or a slow device could hit. Fixed by falling back to the render's own live
   `starred`/`favorited`/`friendship`/`loadedEntry` values instead of passing through unchanged.
2. `useHiddenMembers`'s `s.hiddenByAccount[activeAccountId] ?? []` fallback allocated a _new_ empty
   array on every selector call. Zustand's hook is built on `useSyncExternalStore`, which compares
   snapshots by reference — a fresh `[]` every call trips its "getSnapshot should be cached"
   infinite-render-loop guard, and this is the _default_ case (any account that's never hidden
   anyone, i.e. almost every account). Fixed with one shared `EMPTY_HIDDEN` constant. Both bugs are
   the same shape — a fallback value that isn't referentially stable across otherwise-identical
   calls — worth remembering as a category for future stores/selectors, not just these two spots.

Also found, while chasing failure 1 above but not the root cause: a raw `element.click()` in a
test doesn't reliably synchronize with a handler that chains multiple `await`s before its first
`setState`, specifically under the CPU contention the full 24-file monorepo test run creates in
this sandbox — `@testing-library/user-event`'s `await userEvent.click(...)` does. Switched to it
for that one test; worth defaulting to `userEvent` over raw `.click()` for any future test
exercising a multi-await async handler, not just this one.

29 new tests across 4a/4b/c (hiddenMembersStore, WriteGuardRoute's anonymous/read-only branches,
reactionsFlow's error-code handling, and one per new/changed screen). Full monorepo
`typecheck && lint && test && build` green throughout — the flaky test above was re-run 6+ times
consecutively post-fix with zero failures before treating it as resolved, given how long the false
leads took. Committed (`feat(b-mobile): Phase 4a — hidden members, device prefs, write-gate fix`,
`37bd454`; `feat(b-mobile): Phase 4b/c — reactions, comments, report, hidden members UI`,
`959a20f`), pushed.

**Next:** Phase 5 — Profiles & connections (`SCR-17–22`, `FLW-09`). Read those screen/flow specs
first. This is the first phase to build `SCR-18` User Profile, which several earlier phases already
link to (`/user/:username` routes exist since Phase 1, currently `ScreenPlaceholder`) — and the
first real test of the hidden-member consistency requirement extending to a people-list context
(followers/following/pending-requests show a hidden member's name/avatar marked **Hidden**, per
rules.md, rather than suppressing them the way grids do). `SCR-30`'s account-switcher popover
(deferred since Phase 2, needs a persistent nav chrome — now exists) is worth picking up here too
if time allows, though it's not blocking.

## 2026-08-04 — Phase 5 complete: Profiles & connections

`data/users.ts` (profile + social-graph fetchers) and `flows/connectionsFlow.ts` (remove follower,
approve/refuse request, restore access) round out the API surface — every endpoint this phase
needed (`user/profile`, `entries/journal`/`entries/favorites` with a `username` param, `users/
followers`/`following`, `users/requests/pending`/`blocked`) already existed in `b-api`, no gaps
found this time.

**`SCR-17` (My Profile) and `SCR-18` (User Profile) share one `ProfileScreen` component.** The API
itself treats `username: undefined` as "the active account's own" for every relevant endpoint, and
the two screens are ~90% identical (header, About/Entries/Faves tabs, Followers/Following/Awards
links). Everything that differs is gated on one computed `isOwn` flag: the Follow/Unfollow button
and Hide never apply to your own profile. Decided Followers/Following/Awards are plain nav buttons
to `SCR-19`/`SCR-22`, not `IonSegment` tab content alongside About/Entries/Faves — the spec's own
wording ("list (→ SCR-19)") describes a navigation shortcut, not inline content, and only About/
Entries/Faves actually render something in place.

New screens: `SCR-19` Followers/Following (one component for both — identical data shape and
layout; Remove follower only offered on your own followers list), `SCR-20` Pending Requests
(Approve/Refuse gated on read-write; Refuse's confirmation states both effect and non-effect per
rules.md; Hide offered afterwards as a genuinely separate action, never automatic), `SCR-21`
Refused Followers (Allow restores access immediately, no confirmation — exactly as reversible as
`SCR-31`'s Unhide), `SCR-22` Awards (`user/awards` returns only an id + icon URL, no name/meaning
text at all — so "tap a badge for its meaning" resolves to opening the icon guide, `/help`, rather
than inventing per-badge copy the API doesn't provide).

New shared component `components/UserRow.tsx`: avatar + username for the three paged people lists.
Implements rules.md's _different_ treatment for people lists vs. grids/comments — a hidden member
is marked **"(Hidden)"** inline, never suppressed, since removing them here would make them
impossible to find in order to unhide. `CachedImage` gained an optional `style` prop (avatars need
inline sizing; there's no shared CSS Modules file for this cross-cutting a use case yet).

**One real UX bug found and fixed, via a test that wouldn't stay green rather than by inspection:**
the friendship-status button read "Following" while active — directly colliding with `SCR-18`'s own
"Following" nav-shortcut button rendered right below it, both visually (a real user could tap the
wrong one) and in the test (an ambiguous query). Relabelled both it and `EntryDetailScreen`'s
equivalent `SCR-06` follow button to **"Unfollow"** — the action the button performs, not the
current state, which is clearer regardless of the collision and matches the confirm-dialog's own
wording already used for the _action_ (rules.md: "Unfollow → confirm, then optimistic").

**TODO(Phase 5+), documented directly in `ProfileScreen.tsx`:** `SCR-18`'s "Remove follower" (spec:
"shown whenever they currently follow the active account") needs to know whether _they_ follow
_you_ — `getUserProfile`'s `friendship` object is viewer-relative (do you follow them), not the
reverse, and no cheap separate call provides that yet. Rather than guess or add a speculative
extra fetch, `SCR-18`'s overflow simply doesn't offer it; `SCR-19`'s Followers list (built this
phase) is the correct, already-working place for this action, since the list itself already
confirms who's a follower.

**Two IonAlert/testing-library patterns worth remembering for any future screen with a trigger
button and a same-labelled confirm button** (this phase had several: Remove, Refuse, Unfollow):

1. `IonAlert` renders its buttons into the DOM **unconditionally**, regardless of `isOpen` — a bare
   `screen.getByText('Remove')` can match the hidden alert's own confirm button just as easily as
   the visible trigger. Scope the trigger query with `{ selector: 'ion-button' }`.
2. The alert's own destructive/confirm button's text sits on a nested `<span class="alert-button-
inner">`, not directly on the `<button>` — Testing Library's `selector` option filters by which
   element _owns_ the matched text, so it can't be used to target the ancestor `<button>` this way.
   `document.querySelector('button.alert-button-role-destructive')` (a plain DOM query, bypassing
   text matching entirely) is simpler and reliable here, since a screen has at most one destructive
   alert open at a time.

21 new tests. Full monorepo `typecheck && lint && test && build` green throughout (330 tests,
6 repeated full-suite runs with zero failures). Committed
(`feat(b-mobile): Phase 5 — Profiles & connections (SCR-17–22, FLW-09)`, `e2f934d`), pushed.

**Next:** Phase 6 — Search & Map (`SCR-03/04`, `FLW-04/14`). Read those screen/flow specs first.
Key pieces: MapLibre GL JS behind a new `platform/mapTiles.ts`; `platform/geolocation.ts`
implemented for real against `@capacitor/geolocation` (currently a Phase-1 stub — `getCurrentPosition()`
always rejects — which is why Browse's Nearby tab, built in Phase 3, has never actually loaded
anything yet); application-layer request supersession for the map/search debounce (§7's
cancellation model, same pattern `useResource`/`usePagedResource` already use via request ids).
`SCR-03`'s People tab reuses the same hidden-member-marked-not-suppressed treatment `UserRow`
already implements — check whether `searchUsers` (confirmed to exist in `b-api`, not yet used
anywhere in `b-mobile`) returns the same lightweight `BlipUser` shape before building a new type.

## 2026-08-04 — Phase 6 complete: Search & Map

`platform/geolocation.ts` implemented for real against `@capacitor/geolocation` (newly installed,
`^8.2.0` — matches the rest of the app's first-party plugin pins; `8.2.1` doesn't exist as a
release, only `-next`, so `8.2.0` is the true latest stable). It ships its own web implementation
(backed by `navigator.geolocation`), so — unlike `platform/browser.ts` — it needs no manual
`Capacitor.isNativePlatform()` branch; `vite dev` in a desktop browser gets a real, permission-
prompting implementation for free. Contract: resolves with coordinates on success, resolves `null`
when permission is held but no fix could be obtained (GPS off/timeout — distinct from a refusal),
and rejects when permission is refused. Reads the _current_ permission state on every call rather
than remembering a past answer, per rules.md. Fixed a real, previously-undiscoverable bug this
surfaced immediately: `BrowseScreen`'s `NearbyTab` (built in Phase 3 against the always-rejecting
stub) only had a reject handler, so a `null` resolution left it spinning forever instead of showing
the "needs location access" message — folded both cases into the same branch, with a regression
test.

**Map tile provider: MapTiler's free tier**, per `app-architecture.md`'s own Q7 decision (already
made before this phase — not a new choice, just the first phase to actually need it). Confirmed the
reasoning still holds before wiring it up: no billing account required (unlike Google Maps
Platform's current tiered pricing), tolerates a public/extractable key (§18's "anything in the
bundle is extractable" honesty requirement — the same reason `VITE_BLIPFOTO_CLIENT_ID` is unsecret),
and needs nothing beyond a style URL to hand to MapLibre GL JS. `platform/mapTiles.ts` is one
function, `getMapStyleUrl()`, returning `https://api.maptiler.com/maps/streets-v2/style.json?key=…`
or **`null` when no key is configured** — which is what drives `SCR-04`'s "Maps/location
unavailable" state deliberately, rather than letting the map silently fail to load tiles with no
explanation. `maplibre-gl` (`6.1.0`, exactly the version app-architecture.md pins) newly installed.
This is the one platform file that gets a direct unit test (`platform/__tests__/mapTiles.test.ts`)
rather than only being exercised through a mocked consumer — unlike every other `platform/*.ts`
module, it wraps no Capacitor plugin and has no async/device dependency, so it's pure logic (§19
layer 1), same class as the error mapper or the BBCode preset.

**Debounce: one small shared hook, `data/useDebounce.ts` (`useDebouncedValue`), not a new
request-cancellation mechanism.** Per PLAN.md's explicit instruction for this phase: debounce the
_input_ (the search term, the map's raw viewport bounds) and let `useResource`/`usePagedResource`'s
existing request-id supersession handle the actual fetch race, rather than building a second
cancellation scheme. `SCR-04`'s bounds-fetch effect follows the identical shape to every other
resource hook in the app: a request-id ref discards any response that's no longer the newest, since
`CapacitorHttp` can't abort in flight (§7).

**`SCR-03` Search.** Entries tab is exactly what PLAN.md predicted — `EntryGrid`/`usePagedResource`,
same shape as every prior feed. People tab reuses `UserRow` directly: `searchUsers` returns the same
`BlipUser` shape (`username`, `avatar_url`, `icons`) `fetchFollowers`/`fetchFollowing` already
return, confirmed by reading `b-api`'s `searchUsers` before writing `fetchSearchUsersPage`, so no
new row component was needed. The query field is a plain native `<input type="search">` in a
`<form>`, not `IonSearchbar` — same reasoning as `SCR-15`'s plain `<textarea>` (Phase 4): this needs
a real `onSubmit` for the keyboard's search action (search immediately, dismiss the keyboard,
bypassing the debounce), which native form semantics give for free and reaching through Ionic's
shadow DOM would not. Submit-bypass is one extra piece of state (`submittedValue`, cleared on the
next keystroke) layered over `useDebouncedValue`, not a second debounce implementation.

**Each tab tracks its own "committed" term, synced from the shared term only while that tab is
active** — this is the one piece of real design work FLW-04's "switching tabs searches the new tab
for the current term if it has no results yet" needed beyond reusing existing hooks. Both tabs stay
mounted once visited (same `hidden`-not-unmounted pattern `BrowseScreen` uses for its five feeds,
rules.md's explicit session-caching allowance for both `SCR-02` and `SCR-03`), but an _inactive_
mounted tab does not refetch merely because the term changed elsewhere — its sync effect checks
`active` before committing the new term, so only the visible tab ever issues a request. Switching to
a not-yet-visited tab commits immediately on mount (first "switch" = mount), matching "search the
new tab for the current term."

**`SCR-04` Map.** MapLibre GL JS renders directly in the WebView — it isn't a Capacitor plugin, so
unlike geolocation/tile config it lives in the screen itself, not behind `platform/**`, and the
platform-boundary ESLint rule doesn't restrict it (confirmed by re-reading the rule before
importing it). Focused mode (`?entry=<id>`, parsed from `location.search` in `AppRoutes.tsx` since
screens may not import `react-router`) fetches the target entry's coordinates _before_ constructing
the `maplibregl.Map` at all, so it never flashes the default region first. Entries by a hidden
member get no marker created in the first place — filtered before markers exist, not rendered and
then hidden, per rules.md's "a placeholder pin would be noise." `SCR-06`'s overflow menu gained a
"Map" item (shown only when the entry has a location), completing `FLW-14`'s other entry point.

**Performance regression caught and fixed before it shipped:** the first working build put
`maplibre-gl` behind a static top-level import in `MapScreen.tsx`, which bundled it straight into
the main chunk — 2.38MB gzipped down to 570KB, but still one chunk covering every screen's first
paint. app-architecture.md §20 is explicit that MapLibre ("by far the largest dependency... ~19MB
unpacked") must be lazy-loaded since only two screens use it. Fixed by `React.lazy()`-wrapping just
the `/map` route's component in `AppRoutes.tsx` (with a `<Suspense>` fallback spinner) rather than
touching `MapScreen.tsx` itself — Vite code-splits at the dynamic `import()` boundary, so
`maplibre-gl`'s static import inside `MapScreen.tsx` now ships in its own ~946KB chunk, fetched only
when `/map` is actually visited. Caught by inspecting `npm run build`'s own chunk-size output, not
by a test — worth checking build output specifically for any future screen pulling in a large
dependency, since neither typecheck nor lint would ever flag this.

**Testing maplibre-gl itself: mocked wholesale, same principle as every platform-module consumer
test, applied to a WebView-rendered library instead of a Capacitor plugin.** jsdom has no
WebGL/canvas support (same class of gap as "no headless browser available in this sandbox"), so
`maplibre-gl` is replaced with a minimal fake `Map`/`Marker`/`Popup` (via `vi.hoisted`, since the
mock factory and the test's own assertions both need the same instance-tracking arrays) that
records what the component asked of it — constructor options, `on()` handlers (triggerable
manually, e.g. `mapInstances[0].trigger('load')`), `getBounds()`, `jumpTo()` calls, and every
constructed `Marker`. This tests `MapScreen`'s actual logic (bounds → fetch → markers, focused-mode
centring, hidden-member filtering, my-location recentring, the four map states) without needing a
real renderer.

**One new gotcha, `IonButton`'s `aria-label` prop, found writing the My-location test:** unlike a
plain HTML button, an `aria-label` passed to `IonButton` in this jsdom test setup didn't reach the
rendered `<ion-button>`'s DOM attributes, so `screen.getByLabelText(...)` couldn't find it —
`screen.getByText('My location', { selector: 'ion-button' })` (the same trigger-scoping pattern
Phase 5's `IonAlert` gotcha established) found it reliably instead. Same shape as the already-known
`IonLabel`-doesn't-render-children gap: an Ionic component whose props don't reliably reach the DOM
in this test environment. Worth checking for this specifically before reaching for
`getByLabelText`/`getByRole` on any future `IonButton`.

35 new tests: 1 regression test for the `NearbyTab` fix, 2 for `mapTiles.ts`, 11 for `SearchScreen`
(idle/debounce/submit/empty/error/tap-through for both tabs, tab-switch search-on-first-visit,
no-refetch-on-return, hidden-member marking), 7 for `MapScreen` (unavailable state, fetch-and-render,
empty region, non-blocking error, hidden-member suppression, focused-mode centring, my-location).
351 tests total, full monorepo `typecheck && lint && test && build` green throughout — `npm test`
run 9 times consecutively (6 before the lazy-loading fix, 3 after) with zero failures, and
`npm run build` (both the single-workspace and full monorepo forms) confirmed clean with the
`MapScreen` chunk split verified by inspecting its own output. Committed
(`feat(b-mobile): Phase 6 — Search & Map (SCR-03/04, FLW-04/14)`), pushed.

**Next:** Phase 7 — Compose & publish (`SCR-09–14`, `FLW-12/13/18`). Read those screen/flow specs
first. Key pieces per PLAN.md: `platform/upload.ts`'s hand-built multipart body (the seam and the
reasoning are already fully specified in `app-architecture.md` §7 — no spike needed, just
implementation), a durable `uploadQueueStore` + runner module (not a React component — §9), real
`platform/camera.ts` (still a Phase-1 stub, same shape as `geolocation.ts` was before this phase),
`react-easy-crop` (needs installing — not yet a dependency) for two genuinely different crop operations (`SCR-10`'s
coordinate-only entry crop vs. `SCR-25`'s client-side-cropped avatar — §15 is explicit these must
not be conflated), the BBCode editor toolbar (`SCR-11`, five buttons per §14's tag set, one
conditional), the location picker (`SCR-12`, likely the `MapScreen`/`mapTiles.ts` machinery just
built this phase, reused for a single-marker picker rather than a browsable region), and
`local-notifications` for `FLW-18`'s daily reminder (suppression by cancellation on successful
upload, never a fire-time network check — §12).

## 2026-08-04 — Phase 7 complete: Compose & publish

Installed `@capacitor/camera` (`^8.2.2`, unpinned by the spec — matched the caret-range convention
every other same-generation plugin already uses), `@capacitor/local-notifications` (`8.2.1`,
pinned exactly per §12) and `react-easy-crop` (`6.2.3`, pinned exactly per §15).

**`platform/upload.ts`'s multipart body**, built exactly to §7's spec: fields then file bytes,
written to a temp `Directory.Cache` file, uploaded via `FileTransfer.uploadFile()` with an
explicit `Content-Type: multipart/form-data; boundary=…` header so the plugin skips its own
field-dropping-on-iOS multipart handling. Body construction itself is pure logic in
`data/multipartBody.ts` (+ `data/binary.ts`'s base64⇄bytes helpers), kept out of `platform/upload.ts`
specifically so it gets a direct unit test — the same "one platform-adjacent module tested
directly" shape `platform/mapTiles.ts` established in Phase 6, applied here to the multipart
assembly instead of a whole platform wrapper. `platform/upload.ts` also now owns the upload
queue's file lifecycle end to end: `copyPhotoToAppStorage` (enqueue-time copy into
`Directory.Data`, §9 — a picker/camera URI is a temporary grant), `readQueuedFileAsSource` (native:
a path reference for `mutateMultipart`; web: an in-memory `Blob`, since the default `FormData` path
can't read a native filesystem path), `deleteQueuedFile`, and `resolveQueuedFileDisplaySrc` for
`SCR-14`'s thumbnail (native only — no web equivalent to `Capacitor.convertFileSrc` for the
`Filesystem` web implementation's own storage, so desktop-browser dev shows title/status with no
thumbnail image, which is all `SCR-14`'s acceptance criteria actually require).

**A real bug found and fixed before it shipped, the load-bearing one of this phase:**
`FileTransfer.uploadFile()` _rejects_ on an HTTP error status (4xx/5xx), unlike `fetch()`, which
resolves and lets the caller inspect `response.ok`. But a 4xx/5xx from Blipfoto's API still carries
a parseable error envelope that `BlipfotoClient.mutateMultipart`'s own `parseEnvelopeBody` needs to
see, exactly like the default `fetch` path already handles for a non-2xx response. Treating every
rejection as a transport failure would have misclassified every write/validation/forced-logout
error from a native publish/edit as a `NetworkError` — defeating `data/errors.ts`'s entire outcome
mapping for every multipart call, silently, since nothing would ever have exercised it without a
device. Fixed in the `multipartImpl`: a rejection carrying an `httpStatus` and a `body` (the server
was reached and responded) is returned as a normal result instead of rethrown; only a rejection
with neither (a genuine transport failure) propagates. Documented prominently in the code, not just
here, since it's exactly the kind of thing an implementer chasing TODO H's "closed by source-reading"
note could plausibly miss.

**The durable upload queue** (`state/uploadQueueStore.ts` + `flows/uploadQueueRunner.ts`, a plain
module per §9, not a React component): one item at a time, serial, a monotonic backoff schedule
(5s/15s/45s/2m/5m, capped, giving up after 6 attempts) for `transport` outcomes only — every other
`mapApiError` outcome moves straight to `failed`. `startUploadQueueRunner()` (called once from
`AppShell.tsx`, not any one screen) resets any item stuck `uploading` from a killed process back to
`waiting` before draining — §9's "honest limitation" made concrete. `data/client.ts` gained
`getClientForAccount(accountId)`, since the runner must keep uploading for account A even if the
user switches the active account to B mid-upload — `getClient()` only ever reads the _active_
account, which is the wrong thing here. `flows/composeFlow.ts`'s `enqueueDraft()` is the one place
a `composeDraftStore` draft turns into a queue item, shared by `SCR-10` (publish) and `SCR-13`
(edit) — same shape, `PublishQueueFields`/`EditQueueFields` (`Omit<...Params, 'image'>`) picked by
`draft.mode`.

**`platform/camera.ts`** uses the plugin's _current_ API (`takePhoto`/`chooseFromGallery`,
8.1.0+), not the deprecated `getPhoto`/`pickImages` — confirmed by reading the plugin's own type
defs before writing anything, same "check what a method actually returns before building on it"
discipline every prior phase's gotcha list already establishes. This turned out to remove a whole
piece of planned work: the current API's `MediaResult.metadata` (`includeMetadata: true`) already
gives `creationDate` (ISO 8601) and `resolution` (`"WxH"`), which is exactly what `SCR-10`'s "date
pre-filled from EXIF, else today" and too-small validation need — **no hand-rolled binary EXIF
parser was written**, a deliberate scope reduction over what RESUME.md's plan implied might be
needed. What's genuinely not available is _parsed_ GPS coordinates (`metadata.exif` is a raw,
unparsed string) — `SCR-10`/`SCR-12`'s "location pre-filled from EXIF... when available" is
satisfied only via `platform/geolocation.ts`'s device-location path, not from the photo itself;
documented in `platform/camera.ts`'s own header comment so nobody goes looking for a GPS field
that isn't there. Camera-permission-refused-permanently offers no "open Settings" button either —
there's no cross-platform settings-deep-link plugin in this app's current dependency set, and
adding one for a single button would be exactly the kind of speculative abstraction the ground
rules warn against; the screen explains the situation in words instead.

**Cropping**: `components/PhotoCropper.tsx` wraps `react-easy-crop` (square aspect, both
operations), reporting the live crop rect on every change. `data/imageCrop.ts` is the pure-logic
half — `cropToProportions()` (percentage rect → `thumbnail_crop`'s `x,y,w`, `SCR-10`, wired this
phase) and `cropToJpegBlob()` (pixel rect → canvas-drawn, re-encoded JPEG `Blob`, `SCR-25`'s avatar
path — built now per the Phase 7 plan, since the cropper component is shared, but not wired to any
screen until Phase 8 exists to call it). `SCR-10` only offers the crop button to members
(`fetchUserProfile().details.member`, the same field `SCR-17`/`SCR-18` already read — no cheaper
source exists).

**`data/journal.ts`**: `toDayEligibility()` is pure logic mapping `BlipDay.state` to `SCR-10`'s own
wording table exactly, including the deliberate "suspended reads identically to already-an-entry,
but only state 1 gets the jump-to-that-entry affordance" distinction. `fetchMonthEligibility()` and
`fetchDayEligibility()` map to the two separate endpoints `SCR-10`'s own touchpoints list —
`journal/month` drives `components/MonthDatePicker.tsx`'s greyed-out days (fetched once per
_visited month_, cached for the component's lifetime, never per date change — the literal
requirement), `journal/day` separately confirms the _currently selected_ date and is what actually
gates Upload. `MonthDatePicker` is a small hand-rolled month grid, not a library — a plain
`<input type="date">` can't grey out individual dates (no such native API), and pulling in a
calendar-widget dependency for one screen's one field would be the reverse of this phase's "don't
add speculative abstractions" instruction.

**`FLW-18`'s reminder is a deliberate refinement of §12's literal wording, not a literal
implementation of it — and this is the second real bug this phase caught before it shipped.** §12
says to schedule `on: {hour, minute}, repeats: true` and, on a successful publish, "cancel today's
occurrence and schedule tomorrow's." But a plain `on:`-pattern schedule has no notion of "skip just
today": cancelling and re-issuing the _identical_ pattern doesn't skip today at all if today's
reminder time hasn't passed yet — the plugin just recomputes the next `hour:minute` match from
_now_, which is still today. That silently fails to suppress the reminder for exactly the case the
feature exists for (publish in the morning, reminder set for the evening). Fixed by anchoring at an
explicit `at` `Date` combined with `every: 'day'` instead: `platform/localNotifications.ts` computes
the _next occurrence_ itself (today if not yet passed, else tomorrow — or always tomorrow for the
post-publish reschedule, `rescheduleReminderSkippingToday`), which the plugin then repeats
natively every day with no further app involvement — satisfying FLW-18's "fires reliably without
the app having been opened that day" the same way `repeats: true` would have, while actually
achieving the "skip today" behaviour §12 describes. Documented prominently in the module's own
header comment, the same treatment as the multipart/HTTP-error bug above.

`state/devicePrefsStore.ts` gained `reminders: Record<accountId, {enabled, hour, minute}>` (Phase-8
UI, data model and scheduling built now — the same "gate built ahead of its screen" shape
`confirmAccountBeforeReaction` established in Phase 4). `flows/reminderFlow.ts` is the one place
that reads/writes it: `setReminderEnabled()` (not called by anything yet — no `SCR-25` toggle),
`onEntryPublished()` (called from the upload queue runner on every successful publish/edit),
`cancelReminderForAccount()` (wired into `accountsFlow.ts`'s `removeAccount` and the
downgraded-to-read-only branch of `changeAccountMode` — a read-only account can't publish, so any
reminder it had is cancelled the moment it stops being read-write). `AppShell.tsx` gained a
`ReminderTapListener` (mounted inside `IonReactRouter`, so it has `useHistory()`) implementing
FLW-18's "tapping it switches to that account, then opens SCR-09" — self-contained, not routed
through the not-yet-built `deepLinkResolver.ts` (§16, still open beyond the OAuth round), since
`@capacitor/local-notifications` fires its own distinct `localNotificationActionPerformed` event.

**`SCR-06`'s overflow menu gained `FLW-13`'s Edit details / Replace photo / Delete entry**,
owner-only _and_ only read-write (ownership doesn't imply write access) — `Delete` never routes
through `SCR-13` at all, per `FLW-13`'s own diagram (confirm+delete happens directly from the
overflow menu), implemented right there with a new `data/entries.ts#deleteEntry()`. `Edit`/`Replace
photo` push to `/entry/:id/edit` with a `{mode}` router-state flag `AppRoutes.tsx` extracts, into
`SCR-13`'s `EditEntryScreen` — which sits behind `WriteGuardRoute` as a second, redundant-by-design
gate on top of the overflow menu's own `canWrite` check, the same "never trust one call site"
posture `WriteGuardRoute` exists for everywhere else.

**A third real bug, found only by a test that wouldn't stay green:** `EditEntryScreen`'s
mount-effect used to depend on `isCurrentDraft` (`draft?.mode === 'edit' && draft.entryId ===
entryId`) to decide whether to skip refetching. But `Save`'s own `clearDraft()` sets `draft` to
`null`, which flips `isCurrentDraft` back to `false` — and since the effect had it in its
dependency array, that _re-triggered a pointless refetch-and-reseed_ immediately after a successful
save, briefly resurrecting the just-cleared draft before the route change unmounted the screen.
Fixed with a `useRef` seeded once from `isCurrentDraft` at mount instead of a reactive dependency —
same "a ref survives an internal state change without re-running the effect" fix shape as `SCR-06`'s
Phase-4 optimistic-update bug, different root cause (an effect dependency reacting to its own
side effect's aftermath, not a wrapper object's referential instability).

**`components/BBCodeToolbar.tsx`**: extracted from `SCR-15`'s comment editor (Phase 4 left an
explicit TODO to do this once `SCR-11` needed the same behaviour) — `wrapSelection()` plus a small
presentational toolbar, parameterized by which tags to show. `SCR-15` passes `BBCODE_TAGS` minus
`url` (comments exclude the link tag, unchanged behaviour); `SCR-11` passes the full five. Rendered
as plain `<button>`s, not `IonButton` — sidesteps the already-known `IonButton`-in-jsdom gotchas
(`aria-label` not reaching the DOM) preemptively, the same choice `UserRow.tsx` made in Phase 5.

**One new gotcha, found writing `SCR-06`'s delete-entry test:** several _simultaneously-present_
destructive `IonAlert`s can coexist on one screen (`SCR-06` now has four: Unfollow, Hide, delete-
comment, delete-entry) — and per the already-known "`IonAlert` renders its buttons into the DOM
unconditionally regardless of `isOpen`" gotcha, a bare
`document.querySelector('button.alert-button-role-destructive')` matches whichever one happens to
render first in source order, not necessarily the one actually open. The existing gotcha's own
"a screen has at most one destructive alert open at a time" assumption doesn't hold once a screen
has _multiple distinct_ destructive alerts defined at all, even if only one is ever open. Fixed by
scoping through the alert's own `header` attribute:
`document.querySelector('ion-alert[header="…"] button.alert-button-role-destructive')`. Worth
remembering as the general form: scope by the alert's `header`, not just its button role, on any
screen with more than one destructive confirmation.

**Chunk-size check, per this phase's explicit instruction (`react-easy-crop`/`maplibre-gl`
watch-list):** `npm run build`'s own output confirms both are correctly excluded from the eager
bundle. `maplibre-gl` (942KB minified/244KB gzip) is one chunk shared between `SCR-04` and `SCR-12`
(both lazy-loaded in `AppRoutes.tsx`, same `React.lazy()` pattern as Phase 6) — absent from
`index.html`'s own script list. `react-easy-crop` is folded into `ComposeEntryScreen`'s own lazy
chunk (32KB total, verified by grepping for its minified-but-still-present internal method names
like `computeSizes` — absent from every eager chunk). The one chunk that _is_ eager and large
(~1.05MB minified/217KB gzip, oddly named after `useAppNavigate.ts` — a bundler chunk-naming
artifact, not its actual contents) is `@ionic/react`/`@ionic/core`'s own framework code, confirmed
by grepping for `IonRouterOutlet`/`ionicons` inside it and cross-checked against `@ionic/core`'s
unminified dist size (2.4MB) — a pre-existing cost of the Ionic framework choice (§5, made in
Phase 1) that this phase didn't add to, not a new regression. `@capacitor/camera` and
`@capacitor/local-notifications` show up only as the expected handful of small (<10KB) plugin-shim
chunks alongside every other first-party Capacitor plugin already in the tree.

85 new tests (436 total, up from 351): pure-logic coverage for `toDayEligibility` (every `BlipDay`
state), `bytesToBase64`/`base64ToBytes` round-trips, `buildMultipartBody`'s exact byte layout,
`cropToProportions`/`thumbnailCropToField`, `validatePickedPhoto`, `nextBackoffMs`'s exact backoff
schedule; the upload-queue runner's full retry/success/forced-logout/kill-recovery matrix against a
fake client; `reminderFlow`'s enable/disable/publish-triggers-reschedule/cancel behaviour against a
mocked `platform/localNotifications.ts`; `uploadQueueStore`'s `cancelForAccount`; one test file per
new screen (`SCR-09`–`SCR-14`) covering its own loading/empty/error/success states per §19, plus
new owner-only-overflow tests added to `SCR-06`'s existing suite. Full monorepo
`typecheck && lint && test && build` green throughout; `npm test` run 3 times consecutively with
zero failures. Committed
(`feat(b-mobile): Phase 7 — Compose & publish (SCR-09-14, FLW-12/13/18)`), pushed.

**Next:** Phase 8 — Settings & device-level screens (`SCR-25/29`, `FLW-17`) per `PLAN.md`'s phase
list: `devicePrefsStore`'s remaining fields (`SCR-25`'s General/Journal/Misc sections, the
`confirmAccountBeforeReaction` toggle UI, the reminder on/off + time picker UI now that
`flows/reminderFlow.ts` is fully built), `config/countries`/`locales`, an opt-in web-link
`<activity-alias>` toggle (pulled forward from Phase 10), privacy-policy/delete-account links, and
`SCR-25`'s avatar crop screen — `components/PhotoCropper.tsx` and `data/imageCrop.ts`'s
`cropToJpegBlob()` are already built and waiting for it (this phase's "cropper component built now,
even though the screen isn't" plan point).
