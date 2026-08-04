# b-mobile — master plan

Source of truth for what we're building and why. Keep this current — update it whenever a
significant decision is made or the plan changes. A fresh Claude Code session should be able to
pick up work from this file, `AGENT_LOG.md`, and `RESUME.md` alone, without asking questions.

## What this is

`b-mobile` is a new Capacitor app (Android + iOS) for Blipfoto, a personal photo-journal service,
in the `b-oss` monorepo alongside the existing backup tools (`b-ark`, `b-ark-chrome`, `b-view`).
The full functional and implementation spec is already written and three-times reviewed —
`docs/AppSpec/` (what it does) and `docs/ImplementationSpec/` (how it's built, entry point
`docs/ImplementationSpec/app-architecture.md`). This is a build task, not a design task.

Read order for a fresh session: this file → `AGENT_LOG.md` (last 20 entries) → `RESUME.md` →
`docs/ImplementationSpec/app-architecture.md` (the spec's own entry point) as needed per phase.

## Ground rules carried from the user's brief

- Build the whole app in one pass — `AppSpec/`'s Must/Should/Could tags are informational, not a
  shipping order. Don't stage work by MoSCoW tag.
- Follow the root `CLAUDE.md` architecture rules (package boundaries, `useBackend()`-equivalent
  platform boundary, TypeScript strict, lowercase-hyphenated naming) unless `app-architecture.md`
  explicitly overrides for something Capacitor-specific.
- `VITE_BLIPFOTO_CLIENT_ID` / `VITE_OAUTH_REDIRECT_URI` (`bmobile://oauth/` — trailing slash is
  required, exact-string match) go in `.env.example` as **blank placeholders only**. Never invent
  or commit a real client id.
- Run autonomously through the build: self-verify with `typecheck`/`lint`/`test`/`build`, fix what
  breaks, don't check in at every step. **One exception**: Phase 0 touches packages `b-ark` and
  `b-ark-chrome` already depend on, so its PR gets an explicit merge-confirmation gate rather than
  being merged autonomously. Everything after that proceeds without further check-ins. Real
  device/browser testing is the user's own pass once there's something to run.

## Codebase audit — corrections to the spec's own assumptions

Found by reading the current repo state before starting Phase 0; these refine (not contradict)
`app-architecture.md` §2/§21:

1. **`b-view` is imported for backup types/hooks by more than `b-ark-ui-electron`.** The spec says
   only `b-ark-ui-electron` needs repointing at `b-view-backup`. In fact `b-ark-ui-chrome` also
   imports `BlipEntry`/`JournalMetadata`/`EntryState` (type-only) in `useFsaJournal.ts`,
   `journal-source.ts`, `BackupPage.tsx`. Both packages need their backup-type/hook imports
   repointed; their `ThumbnailGrid`/`EntryDetail` imports stay on `b-view`.
   `b-ark/src/main/b-view-files.ts` only resolves the **built SPA** package path (for bundling
   into Electron), not a source import — it moves to resolve `@b-oss/b-view-backup` once the SPA
   lives there.
2. **`b-view`'s own CSS depends on a RAG token.** `EntryDetail.module.css` uses `--rag-red` for its
   error-state colour. Since RAG tokens are backup-status vocabulary that doesn't belong in
   `b-visual`' base layer, Phase 0 adds a semantic `--color-danger` (same hex, `#d04545`) to
   `b-visual`' base palette and repoints `EntryDetail.module.css` at it.
3. **The multipart seam's blast radius is zero outside `b-api`.** `publishEntry`, `updateEntry`,
   `updateUserSettings` have no callers anywhere else in the repo yet — safe to redesign their file
   parameter (`Blob` → `FileSource` union) without touching any other package's call sites.
4. **`BlipfotoClient`'s constructor is positional**, called as `new BlipfotoClient(token)`
   elsewhere. Adding `fetchImpl`/`multipartImpl` as further optional positional params (defaulting
   to today's web behaviour) keeps every existing call site unchanged.
5. **No pre-existing style-guide document exists in the repo.** `b-visual`' written style guidance
   has to be authored from what `b-ark-ui-electron`'s CSS actually does, not migrated.

## Phase breakdown

### Phase 0 — Prerequisite `b-oss` refactor — **DONE, merged into `main` 2026-08-04**

Landed on its own worktree/branch/PR (`../b-oss-b-mobile-prereqs`, branch `b-mobile-prereqs`, cut
from `origin/main`), per the plan — kept separate from this branch since it touched packages
`b-ark`/`b-ark-chrome` already ship. PR #62, merged after explicit user confirmation (the one
check-in point in the whole plan) and a clean `gh pr checks` pass. Pulled into `b-mobile-initial`
via `git merge origin/main` — clean, no conflicts, re-verified green here too.

- **0.1 `b-visual`** (renamed from `b-tokens` mid-Phase-0 — the name describes what consumers use
  it for, not just its file contents) — new package: base-layer `tokens.css` (palette minus
  `--rag-*`, plus `--color-danger`), `tokens.ts` (same values in TS), `docs/style-guide.md`
  (spacing/radii/interaction conventions written up from `b-ark-ui-electron`'s CSS).
- **0.2 `b-view` / `b-view-backup` split** — new `b-view-backup` (backup hooks + SPA, depends on
  `b-view` + `backup-engine`). `b-view` keeps presentational components, gets its own view-model
  types, drops `backup-engine` dependency, imports `tokens.css` from `b-visual`. Repointed
  `b-ark-ui-electron`, `b-ark-ui-chrome`, `b-ark/src/main/b-view-files.ts`, and (found only during
  implementation, not the original audit) `b-ark-chrome`'s own `copy-b-view.mjs` build step.
- **0.3 `b-api` seams** — `fetchImpl` (transport) + `multipartImpl` (multipart) as optional
  constructor params; new `FileSource` type (`{blob: Blob} | {path: string; mimeType: string}`);
  `publishEntry`/`updateEntry`/`updateUserSettings` file params switch to it. `multipartImpl`
  returns raw transport parts, not a pre-parsed envelope — `b-api` keeps error-code semantics
  centralized (see the Phase 0.3 `AGENT_LOG.md` entry for the reasoning).
- **0.4 Verify** — full monorepo gate, PR opened, explicit merge confirmation obtained, merged,
  pulled into `b-mobile-initial`, re-verified. **Complete.**

Full detail (including two TypeScript/build gotchas worth knowing before Phase 3) is in
`AGENT_LOG.md`'s 2026-08-03/04 entries.

### Phases 1–11 — `b-mobile` itself (this branch, `b-mobile-initial`)

No PRs opened against `main` for these — commits land directly on `b-mobile-initial`, pushed
regularly. Order follows dependency, not spec priority tags.

1. **Package skeleton & platform foundation — DONE, commit `77285db`.** `package.json`/
   `tsconfig.json`/`vite.config.ts` (dev CORS proxy to `/api/blipfoto`)/`capacitor.config.ts`/
   `index.html`; all 12 `src/platform/*` modules (real web fallbacks where the spec calls for
   one — `browser.ts`, `prefs.ts`; native-only paths throw a labelled not-yet error rather than
   no-op); `src/app/` shell (`AppShell`, full 28-screen route table on placeholders,
   `WriteGuardRoute`, `useAppNavigate()`, `OverlayProvider` stub); `src/data/client.ts` +
   `errors.ts`; `accountsStore` shape + `useCanWrite()`; two new ESLint
   `no-restricted-imports` rules (`@capacitor/*` → `platform/**` only, `react-router*` →
   `routes/**` + `AppShell.tsx` only); `.env.example` additions (all blank). Verified via a
   jsdom-rendered smoke test (no headless browser available in this sandbox — see
   `RESUME.md`'s gotchas) plus full typecheck/lint/test/build. Only `@capacitor/core` is
   installed so far; each plugin package lands with the phase that implements it for real.
2. **Auth & accounts — DONE, commit `e1dd621`.** OAuth round (`flows/oauthRound.ts`), real
   `platform/secureStorage.ts`/`browser.ts`/`deepLinks.ts` (installed
   `@aparajita/capacitor-secure-storage`, `@capacitor/browser`, `@capacitor/app`), full
   `accountsStore` + `useCanWrite()`, `flows/accountsFlow.ts` implementing FLW-01/02/20/21/22 via
   general rules against auth.md's token-lifecycle table (one documented deviation — see the file
   itself), real `SCR-01`/`SCR-30` screens, `WriteGuardRoute`'s real upgrade-prompt (an `IonAlert`,
   not yet the full imperative overlay). Fixed a real gap found in `b-api`: `verifyToken()` didn't
   return the granted `scope` auth.md requires reading back. 17 new unit tests covering every
   FLW-01/02/20/21/22 rule. **Deliberately deferred, each tagged with the phase that picks it up**:
   notification-service registration (Phase 9 — `b-push` doesn't exist yet), the first-run mode
   explainer and copy-deck polish, the account-switcher popover (Phase 3+, needs a persistent nav
   chrome), `SCR-01`'s gated shape (no caller yet — no write action exists before Phase 4 to gate;
   `signInGated()` is ready). Full detail in `AGENT_LOG.md`'s Phase 2 entry.
3. **Browse & entry viewing core — DONE, commit `4cb8fa1`.** `useResource`/`usePagedResource`
   (§6); `platform/imageCache.ts` implemented for real (`@capacitor/filesystem` +
   `file-transfer`, SHA-256-keyed, 15-min TTL) + `<CachedImage>`; `data/viewModel.ts`, the live
   adapter (§2) mapping `b-api` responses into `b-view`'s view-model types — first cross-package
   `.tsx` import from `b-view`. Real `SCR-02`/`SCR-05`/`SCR-06`/`SCR-07`/`SCR-08`. `SCR-06` built
   from scratch (not `b-view`'s `EntryDetail`, which uses `dangerouslySetInnerHTML` — conflicts
   with §14) rendering raw BBCode through a new `<BBCodeText>` (`@bbob/react`, 5-tag preset,
   `onlyAllowTags` so unknown tags degrade to literal text). New `EntryGrid` component (not
   `b-view`'s `ThumbnailGrid` — windowed Prev/Next pagination doesn't fit any `b-mobile` feed's
   infinite scroll). `SCR-07`/`SCR-08` independently fetch via `useLiveEntry` rather than being
   handed the entry from `SCR-06` — deep-link resilience over the spec's literal "no API calls"
   wording. `AppShell`'s placeholder `IonMenu` replaced with the full primary nav. 29 new tests
   (one per screen per state, §19). Full detail in `AGENT_LOG.md`'s Phase 3 entry.
4. **Light social actions — DONE, commits `37bd454` (foundation) + `959a20f` (actions).**
   `flows/reactionsFlow.ts` (star/favourite/follow/unfollow/report) + `flows/commentsFlow.ts`
   (post/edit/delete comment) as pure API wrappers; error-codes.md 221/222 resolve as success,
   223 surfaces as `FavoriteQuotaError`. `flows/useAccountConfirmGate.tsx` implements the
   confirm-account dialog against a new `devicePrefsStore` (off by default — no `SCR-25` toggle
   yet). `SCR-06`'s real action bar (optimistic star/favourite/follow, inline comment
   Reply/Edit/Delete/Report from server action flags, an overflow menu); real `SCR-15`/`SCR-16`/
   `SCR-31`. New `state/hiddenMembersStore.ts` + `EntryGrid`'s hidden-placeholder tile (via a new
   optional `username` on `b-view`'s `EntryIndex`). `platform/prefs.ts` implemented for real
   (`@capacitor/preferences`) — was still throwing on native despite Phase 2 depending on it.
   `WriteGuardRoute` fixed to route anonymous through sign-in rather than the read-only upgrade
   prompt. Two real bugs found and fixed: an unstable effect dependency that silently reverted
   every optimistic update, and an unstable empty-array selector fallback that could infinite-loop
   render. Full detail (including the debugging path for the first bug) in `AGENT_LOG.md`'s
   Phase 4 entry.
5. **Profiles & connections** — `SCR-17–22`, `FLW-09`.
6. **Search & Map** — `SCR-03/04`, `FLW-04/14`. MapLibre behind `platform/mapTiles.ts`.
7. **Compose & publish** — `SCR-09–14`, `FLW-12/13/18`. `platform/upload.ts` hand-built multipart
   body, durable `uploadQueueStore` + runner, camera/crop (two distinct crop operations — don't
   conflate), BBCode editor toolbar, location picker, local-notifications for the daily reminder.
8. **Settings & device-level screens** — `SCR-25/29`, `FLW-17`. `devicePrefsStore`,
   `config/countries`/`locales`, opt-in web-link `<activity-alias>` toggle (pulled forward from
   Phase 10), privacy-policy/delete-account links.
9. **Notifications: `b-push` + client** — `SCR-23/24`, `FLW-15/16`. New peer package `b-push`
   (Cloudflare Worker + D1, counts-only polling, registration contract, `reauth-required`).
   App side: `platform/push.ts`, permission-before-auth sequencing, the two inboxes' asymmetric
   hidden-member suppression, first-page-unread-snapshot trap.
10. **Android project & platform polish** — `android/` checked in, manifest/permissions,
    activity-alias wiring, notification channels, adaptive icon/splash, SDK levels. Accessibility
    font-scale pass (smoke-tested as early as Phase 3, not deferred entirely).
11. **Testing hardening** — sweep for missing four-state screen tests, pure-logic coverage gaps,
    manual on-device checklist (OAuth redirect, multipart upload, reminder timing).

Phases 7+ are sequenced but will get more detailed sub-planning here as I reach them.

## Architecture decisions of note (beyond what's already in `ImplementationSpec/`)

- `--color-danger` added to `b-visual`'s base palette (see audit point 2).
- `FileSource` shape (b-api, Phase 0.3): `{blob: Blob} | {path: string; mimeType: string}`, used
  as the type of `mutateMultipart`'s file-field value. Web default impl only handles `blob`
  (throws on `path` — nothing to read a filesystem path from in a browser); a configured
  `multipartImpl` handles both by delegating entirely (fields + file ref + method + URL in,
  `{status, headers?, body}` out — `b-api` still does the envelope parsing and error-code
  mapping, identically to the default fetch path).

## Full plan file

The complete phase-by-phase plan as originally approved lives at
`/home/ims/.claude/plans/cosmic-foraging-scroll.md` (outside the repo). This file is the
in-repo mirror and the one that stays current as work progresses — if they ever diverge, this
file wins.
