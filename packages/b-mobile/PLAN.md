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
   `b-tokens`' base layer, Phase 0 adds a semantic `--color-danger` (same hex, `#d04545`) to
   `b-tokens`' base palette and repoints `EntryDetail.module.css` at it.
3. **The multipart seam's blast radius is zero outside `b-api`.** `publishEntry`, `updateEntry`,
   `updateUserSettings` have no callers anywhere else in the repo yet — safe to redesign their file
   parameter (`Blob` → `MultipartFileRef` union) without touching any other package's call sites.
4. **`BlipfotoClient`'s constructor is positional**, called as `new BlipfotoClient(token)`
   elsewhere. Adding `fetchImpl`/`multipartImpl` as further optional positional params (defaulting
   to today's web behaviour) keeps every existing call site unchanged.
5. **No pre-existing style-guide document exists in the repo.** `b-tokens`' written style guidance
   has to be authored from what `b-ark-ui-electron`'s CSS actually does, not migrated.

## Phase breakdown

### Phase 0 — Prerequisite `b-oss` refactor (own worktree/branch/PR — NOT this branch)

Worktree `../b-oss-b-mobile-prereqs`, branch `b-mobile-prereqs`, cut from `origin/main`. Must land
(PR opened, full monorepo `typecheck && lint && test && build` green) before `b-mobile-initial`
starts consuming `b-view`. `b-mobile-initial` merges `origin/main` back in once Phase 0 lands.

- **0.1 `b-tokens`** — new package: base-layer `tokens.css` (palette minus `--rag-*`, plus
  `--color-danger`), `tokens.ts` (same values in TS), `docs/style-guide.md` (spacing/radii/
  interaction conventions written up from `b-ark-ui-electron`'s CSS).
- **0.2 `b-view` / `b-view-backup` split** — new `b-view-backup` (backup hooks + SPA, depends on
  `b-view` + `backup-engine`). `b-view` keeps presentational components, gets its own view-model
  types, drops `backup-engine` dependency, imports `tokens.css` from `b-tokens`. Repoint
  `b-ark-ui-electron`, `b-ark-ui-chrome`, `b-ark/src/main/b-view-files.ts` per audit point 1.
- **0.3 `b-api` seams** — `fetchImpl` (transport) + `multipartImpl` (multipart) as optional
  constructor params; new `MultipartFileRef` type; `publishEntry`/`updateEntry`/
  `updateUserSettings` file params switch to it.
- **0.4 Verify** — full monorepo gate, open PR, **stop for explicit merge confirmation.**

### Phases 1–11 — `b-mobile` itself (this branch, `b-mobile-initial`)

No PRs opened against `main` for these — commits land directly on `b-mobile-initial`, pushed
regularly. Order follows dependency, not spec priority tags.

1. **Package skeleton & platform foundation** — `package.json`/`tsconfig.json`/`vite.config.ts`
   (with dev CORS proxy)/`capacitor.config.ts`/`index.html`; `src/platform/*` stubs with web
   fallbacks; `src/app/` shell (Ionic `IonApp`/`IonMenu`/`IonRouterOutlet`, route table to
   placeholder screens, `OverlayProvider` stub); `src/data/client.ts` + `errors.ts`;
   `accountsStore` skeleton; ESLint `no-restricted-imports` on `src/platform/**`; `.env.example`
   additions (all blank). Verify: `vite dev` boots to empty Browse route.
2. **Auth & accounts** — `FLW-01/02/20/21/22`, `SCR-01/30`. OAuth round (§8), full
   `accountsStore` + `useCanWrite()`, write-gating route guard. Unblocks every write screen.
3. **Browse & entry viewing core** — `SCR-02/05/06/07/08`, `FLW-03/05`. `useResource`/
   `usePagedResource`, `imageCache` + `CachedImage`, `b-view` integration via the live adapter,
   BBCode render-only.
4. **Light social actions** — `FLW-06/07/08/10/11`, `SCR-15/16/31`. Optimistic updates,
   `hiddenMembersStore`, hidden-placeholder-tile convention on surfaces live so far.
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

- `--color-danger` added to `b-tokens`' base palette (see audit point 2).
- `MultipartFileRef` shape (b-api, Phase 0.3): `{ fieldName, filename, mimeType } & ({ blob: Blob
  } | { path: string })`. Web default impl only handles `blob`; a Capacitor `multipartImpl`
  handles both by delegating entirely (it decides how to build the body).

## Full plan file

The complete phase-by-phase plan as originally approved lives at
`/home/ims/.claude/plans/cosmic-foraging-scroll.md` (outside the repo). This file is the
in-repo mirror and the one that stays current as work progresses — if they ever diverge, this
file wins.
