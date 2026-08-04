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
5. **Profiles & connections — DONE, commit `e2f934d`.** `data/users.ts` + `flows/
connectionsFlow.ts` (every endpoint already existed in `b-api`). `SCR-17`/`SCR-18` share one
   `ProfileScreen` (the API treats `username: undefined` as "own"); real `SCR-19`/`SCR-20`/
   `SCR-21`/`SCR-22`. New `components/UserRow.tsx` implements people lists' hidden-member
   treatment (marked "(Hidden)", never suppressed — distinct from grids/comments). Found and
   fixed a real UX bug (the friendship-status button's "Following" label collided with the
   profile's own "Following" nav link; relabelled to "Unfollow" in both `SCR-06` and `SCR-18`).
   `SCR-18`'s "Remove follower" deferred (documented TODO — needs data `getUserProfile` doesn't
   provide; `SCR-19`'s list is the correct place for it instead). Full detail in `AGENT_LOG.md`'s
   Phase 5 entry, including two reusable IonAlert/testing-library patterns worth keeping for
   future screens.
6. **Search & Map — DONE.** `data/entries.ts`/`data/users.ts` gained `fetchSearchEntriesPage`/
   `fetchSearchUsersPage` (reusing `EntryGrid`/`UserRow` unchanged — `searchUsers` returns the same
   `BlipUser` shape every other people list already does). Real `SCR-03` (debounced entries/people
   tabs, each tracking its own "committed" term synced from the shared term only while active, so
   an inactive mounted tab never refetches on a term change elsewhere) and `SCR-04` (MapLibre GL JS
   `6.1.0` behind new `platform/mapTiles.ts` — MapTiler's free tier, per the Q7 decision already on
   record — and `platform/geolocation.ts` finally implemented for real against
   `@capacitor/geolocation`, which also makes `SCR-02`'s Nearby tab functional for the first time).
   New shared `data/useDebounce.ts` (`useDebouncedValue`) — debounces the _input_ to
   `useResource`/`usePagedResource`'s existing request-id supersession rather than a second
   cancellation mechanism, used by both the search term and the map's pan/zoom bounds. `SCR-06`'s
   overflow menu gained a "Map" item for geotagged entries, completing `FLW-14`'s other entry
   point. Found and fixed a real bug the always-rejecting Phase-1 geolocation stub had been
   masking: `NearbyTab` only handled a _rejected_ position promise, so a real device with granted
   permission but no GPS fix (`getCurrentPosition()` resolving `null`, a real, valid outcome) would
   have spun forever instead of showing the location-needed message. Found and fixed a real
   performance regression before it shipped: a static top-level `maplibre-gl` import bundled the
   library into the main chunk, violating app-architecture.md §20's explicit lazy-load requirement
   — fixed with `React.lazy()` on the `/map` route in `AppRoutes.tsx` (not in `MapScreen.tsx`
   itself), verified by inspecting `npm run build`'s own chunk output rather than by a test. 35 new
   tests, including `platform/mapTiles.ts`'s pure-logic test (the one `platform/*.ts` module with a
   direct unit test, since it wraps no Capacitor plugin) and a wholesale `maplibre-gl` mock for
   `MapScreen`'s tests (jsdom has no WebGL/canvas, same class of gap as the sandbox's missing
   headless browser). Full detail in `AGENT_LOG.md`'s Phase 6 entry.
7. **Compose & publish — DONE.** Real `SCR-09`–`SCR-14`, `FLW-12`/`13`/`18`. `platform/upload.ts`
   hand-builds the multipart body over `@capacitor/file-transfer` exactly to §7's spec, with a real
   bug found and fixed in the process: `FileTransfer.uploadFile()` rejects on an HTTP error status
   (unlike `fetch`), so the native `multipartImpl` must return a rejection carrying an
   `httpStatus`/`body` as a normal result rather than rethrowing it as a transport failure, or every
   write/validation/forced-logout error from a native publish gets misclassified. A durable
   `uploadQueueStore` + non-React `uploadQueueRunner` (§9) drains one item at a time with capped
   exponential backoff for transport failures only and killed-process recovery on launch. Real
   `platform/camera.ts` uses `@capacitor/camera`'s _current_ API (`takePhoto`/`chooseFromGallery`,
   not the deprecated `getPhoto`/`pickImages`), whose `metadata.creationDate`/`resolution` avoided
   needing a hand-rolled EXIF parser for `SCR-10`'s date default and size validation — GPS
   coordinates aren't exposed that way, so location pre-fill is device-location-only, not
   EXIF-derived (documented scope reduction). `react-easy-crop` + new `components/PhotoCropper.tsx`
   - `data/imageCrop.ts` implement `SCR-10`'s coordinate crop (wired) and `SCR-25`'s avatar JPEG
     crop (built, not yet wired — Phase 8's job). `components/BBCodeToolbar.tsx` extracted from
     `SCR-15`'s comment editor and reused for `SCR-11`'s full five-tag toolbar. `SCR-12` reuses
     `SCR-04`'s MapLibre machinery for a single-marker picker, lazy-loaded the same way `SCR-04` is.
     New `state/composeDraftStore.ts` (§6 "Draft state") is shared, in-memory state for `SCR-10`–
     `SCR-13` — the one deliberate exception to this app's usual "screens refetch, never depend on a
     prior screen's data" rule, since `SCR-11`/`SCR-12` write results into an in-progress draft with
     no deep-link case to resolve instead. `FLW-18`'s reminder required a real design deviation from
     app-architecture.md §12's literal wording: a plain `on: {hour, minute}, repeats: true` schedule
     can't "skip just today" on cancel-and-reschedule if today's time hasn't passed yet, so
     `platform/localNotifications.ts` anchors at an explicit `at` `Date` (+ `every: 'day'`) computed by
     app code instead — same reliability, correct suppression. `SCR-06`'s overflow menu gained
     `FLW-13`'s owner-only, read-write-only Edit details/Replace photo/Delete entry (Delete
     implemented directly there, never routing through `SCR-13`, per `FLW-13`'s own diagram). One more
     real bug found by a flaky test: an effect depending on a value its own success path clears
     (`EditEntryScreen`'s `isCurrentDraft`) re-triggered itself right after a successful save — fixed
     with a `useRef` seeded once, not a reactive dependency. Chunk-size check confirmed `maplibre-gl`
     and `react-easy-crop` both stay out of the eager bundle; the one large eager chunk is
     `@ionic/react` itself, a pre-existing Phase-1 cost, not a new regression. 85 new tests (436
     total). Full detail in `AGENT_LOG.md`'s Phase 7 entry, including a new IonAlert-testing gotcha
     (multiple simultaneous destructive alerts on one screen need `header`-scoped selectors).
8. **Settings & device-level screens — DONE.** Real `SCR-25` (one hub component,
   `SettingsScreen.tsx`, plus a `sections/*.tsx` file per General/Journal/Profile/Notifications/
   Reminders/Misc — not eight separate `SCR`-numbered screens) and real `SCR-29`
   (`HelpInfoScreen.tsx`, same hub-plus-pushed-sections shape). `devicePrefsStore` gained
   `uploadFullSize` (defaults `true` — matches actual current behaviour, since no client-side photo
   downscaling exists anywhere in this app yet, a real pre-existing gap this phase documented
   rather than silently papering over), `openBlipfotoLinksInApp` (turned out to **be** the opt-in
   `<activity-alias>` toggle, not a separate feature — `SCR-29`'s UI and app-architecture.md §16's
   native mechanism are the same feature from two sides; no `android/` project exists yet to hold
   the actual manifest entry, Phase 10's job), and `notificationPollingIntervalMinutes` (local only,
   5-minute floor enforced client-side, no live `b-push` registration to PATCH yet). `config/
countries`/`config/locales` (`data/config.ts`) are the one deliberate, spec-sanctioned exception
   to rules.md's "no caching for display" — fetched once per app launch, not per screen visit.
   Avatar crop wired end to end (`ProfileSection.tsx` → `cropToJpegBlob()` → `saveUserSettings({
avatar: {blob}})`); biography editing resolved a TODO Phase 7 planted specifically for this phase
   (`DescriptionEditorScreen`'s new `target="bio"` mode). **Scope decision**: built the Notifications
   section's master switch and Feed/Push toggles for real (reusing `SCR-30`'s already-working
   `changeAccountMode`, and `b-api`'s already-working `user/settings/notifications` endpoints — no
   `b-push` dependency for either), leaving only the Advanced polling-interval control local-only
   pending Phase 9's live registration. Full detail, including the `IonLabel`-children jsdom gotcha
   reproduced firsthand on two new screens, in `AGENT_LOG.md`'s Phase 8 entry.
9. **Notifications: `b-push` + client — DONE.** `SCR-23/24`, `FLW-15/16`. New peer package
   `b-push` (`packages/b-push`, Cloudflare Worker + D1): counts-only 1-minute activity poll,
   hourly preference refresh, the full registration contract (`POST`/`PATCH`/`DELETE`/`GET`/
   `refresh-preferences`), FCM HTTP v1 push (Web Crypto JWT signing, no SDK), `reauth-required`.
   Zero runtime npm dependencies beyond `@b-oss/b-api` (reused for the two Blipfoto calls it's
   allowed to make); tested against a real in-memory SQLite database (`node:sqlite`), not a
   hand-rolled fake or miniflare — never deployed, per the phase's explicit scope boundary. App
   side: real `platform/push.ts`, `flows/pushFlow.ts` (registration lifecycle, permission-before-
   auth sequencing, launch backstop, FCM-token-rotation handling), real `SCR-23`/`SCR-24` with
   asymmetric hidden-member suppression (best-effort href-parsing vs. exact structural filtering)
   and the first-page-unread-snapshot pattern, `flows/accountsFlow.ts`'s five `TODO(Phase 9)`
   markers replaced with real calls, `SCR-25`'s Advanced polling-interval control wired to a live
   `PATCH`. Found and fixed two real bugs during this phase (see AGENT_LOG.md's Phase 9 entry):
   `changeAccountMode`'s notifications-on branch would have re-POSTed (creating a new zombie
   registration) on every idempotent call; the hourly prefs-refresh cron would have marked a dead
   token `read-token-invalid` and made it invisible to the 1-minute activity poll that's actually
   supposed to raise the reauth-required alert. Also documented, not fixed (out of this phase's
   scope): `platform/http.ts`'s native `CapacitorHttp` transport is still an unimplemented stub
   left over from Phase 1 — every native GET, not just this phase's, would throw on a real device.
10. **Android project & platform polish — DONE.** `android/` checked in (`cap add android`,
    `@capacitor/android` added for real). Manifest: `allowBackup=false`, the four §17 permissions,
    `bmobile://` + `SEND`/`image/*` intent filters, the disabled `<activity-alias>` for
    `https://www.blipfoto.com`. Two new local (non-npm) plugins: `BlipfotoLinksPlugin` (finally
    gives `devicePrefsStore.openBlipfotoLinksInApp` a real effect, synced at both toggle time and
    hydrate time) and `AccessibilityPlugin` (`Configuration.fontScale`, backing
    `platform/accessibility.ts#applyFontScale()` — a real root font-size multiplier applied at
    launch, plus two hardcoded-px inline styles found and fixed along the way). Four notification
    channels created natively, wired end to end (`b-push`'s `fcm.ts` now sets
    `android.notification.channel_id` per payload kind, `platform/localNotifications.ts` sets one
    on the reminder schedule). Adaptive icon + splash generated via `@capacitor/assets` (run once
    via `npx`, deliberately not added as a dependency — see `scripts/generate-android-assets.sh`),
    background color corrected from the tool's white default to the brand green. **Also closed
    Phase 1's long-open gap**: `platform/http.ts`'s native `CapacitorHttp` transport is now
    implemented (forces `responseType: 'text'`, constructs a real `Response` so `b-api`'s
    `headers instanceof Headers` check holds, narrow body-type allow-list). Verified with a real
    `./gradlew assembleDebug` (400 tasks, a real APK produced) — no device/emulator available in
    this sandbox, so §19 layer 3's on-device checklist itself remains untested. Full detail in
    `AGENT_LOG.md`'s Phase 10 entry.
11. **Testing hardening — DONE.** Four-state sweep: two screens (`SignInScreen`, `AccountsScreen`)
    had zero tests at all — new files add 14 tests between them (reproducing RESUME.md's
    `IonLabel`-in-jsdom gotcha firsthand on `AccountsScreen`, fixed the same way every other
    screen has). Five more screens (`SCR-17-18`/`19`/`20`/`21`/`25`) were missing `loading` and/or
    `error` coverage their own component code visibly has; two more (`SCR-03`/`22`) were missing
    only `loading` — 11 more tests. Pure-logic sweep against §19's own named list: real,
    previously-untested gaps closed for `data/errors.ts#mapApiError` (7 tests), the write-gate
    selector `state/accountsStore.ts#useCanWrite` (8 tests, `WriteGuardRoute.test.tsx` had only
    ever mocked it away), and `platform/imageCache.ts#resolveImage`'s TTL arithmetic (6 tests) —
    plus `data/dates.ts` (5 tests, its own header comment flags local-vs-UTC formatting as the
    thing to get right). `data/bbcode.ts` checked and found already fully covered via
    `BBCodeText.test.tsx`, not duplicated. **The sweep's largest finding wasn't a test gap at
    all**: `flows/deepLinkResolver.ts`, which app-architecture.md §16 requires to handle
    `bmobile://entry/:id`/`user/:username` links and the share intent, was never built —
    `platform/deepLinks.ts` has exactly one consumer anywhere (the OAuth redirect, and only
    mid-round), so a shared link or share-to-Blipfoto intent currently does nothing at all.
    Documented prominently, not fixed (a real feature addition, not testing-hardening scope).
    No device/emulator was available this phase either, so §19 layer 3 remains unattempted — the
    Phase 10 APK is still the closest available substitute. 51 new tests, 661 → 712, full monorepo
    `typecheck && lint && test && build` green twice. Full detail in `AGENT_LOG.md`'s Phase 11
    entry.

Phases 7+ are sequenced but will get more detailed sub-planning here as I reach them. No Phase 12
is defined yet — see `AGENT_LOG.md`'s Phase 11 entry for real candidates (the deep-link resolver
above is the front-runner).

## Architecture decisions of note (beyond what's already in `ImplementationSpec/`)

- `--color-danger` added to `b-visual`'s base palette (see audit point 2).
- `FileSource` shape (b-api, Phase 0.3): `{blob: Blob} | {path: string; mimeType: string}`, used
  as the type of `mutateMultipart`'s file-field value. Web default impl only handles `blob`
  (throws on `path` — nothing to read a filesystem path from in a browser); a configured
  `multipartImpl` handles both by delegating entirely (fields + file ref + method + URL in,
  `{status, headers?, body}` out — `b-api` still does the envelope parsing and error-code
  mapping, identically to the default fetch path).
- **`platform/upload.ts`'s `multipartImpl` must treat a `FileTransfer.uploadFile()` rejection that
  carries an `httpStatus`/`body` as a normal result, not a transport failure** (Phase 7) —
  `FileTransfer.uploadFile()` rejects on HTTP error statuses, unlike `fetch()`; rethrowing every
  rejection would misclassify every write/validation/forced-logout error from a native
  publish/edit as `NetworkError`. See AGENT_LOG.md's Phase 7 entry for the full reasoning.
- **`FLW-18`'s reminder schedule is `at: <next occurrence>` + `every: 'day'`, not a literal
  `on: {hour, minute}, repeats: true`** (Phase 7, a deliberate deviation from app-architecture.md
  §12's exact wording) — the latter can't skip today's occurrence on cancel-and-reschedule if
  today's time hasn't passed yet, which defeats the whole suppression feature. App code computes
  the next occurrence explicitly (today or tomorrow) at the two moments it's actually running
  (enabling the reminder, a successful publish); the plugin's own `every: 'day'` then repeats it
  natively with no further app involvement, so reliability-without-the-app-running still holds.
- **`state/composeDraftStore.ts`** (Phase 7, app-architecture.md §6 "Draft state") is shared,
  in-memory state across `SCR-10`–`SCR-13` — the one deliberate exception to this app's usual
  "screens refetch, never depend on a prior screen's in-memory data" rule (§5's deep-link-
  resilience posture), since `SCR-11`/`SCR-12` need to write results into an in-progress,
  not-yet-submitted draft that has no deep-link case to resolve instead.
- **`SCR-25`'s Notifications section is split across two phases, not deferred wholesale to
  Phase 9** (Phase 8) — the master switch (reusing `flows/accountsFlow.ts#changeAccountMode()`,
  already built in Phase 2 for `SCR-30`) and the Feed/Push toggle groups (`user/settings/
notifications`, a real `b-api` endpoint with no `b-push` dependency) were built for real in
  Phase 8; only the Advanced polling-interval control is local-only pending Phase 9's live
  registration id to `PATCH`. See AGENT_LOG.md's Phase 8 entry for why this split, not an
  all-or-nothing read of Phase 9's "Notifications: `b-push` + client" title, is correct.
- **`devicePrefsStore.openBlipfotoLinksInApp` (Phase 8) is the opt-in `<activity-alias>` toggle**
  app-architecture.md §16 describes, not a second, separate feature — `SCR-29`'s spec text and
  §16's native mechanism describe the same toggle from the UI side and the native side
  respectively. The boolean is persisted now; it has no native effect until Phase 10 checks in an
  `android/` project (none exists yet) to hold the actual `<activity-alias>` manifest entry.
- **`b-push` reuses `@b-oss/b-api`'s `BlipfotoClient` rather than a second hand-rolled HTTP
  client** (Phase 9) — `b-api` has zero Node/Electron/browser-specific dependencies (just fetch/
  URL/URLSearchParams, all Worker globals too), so it's exactly as safe to import from a
  Cloudflare Worker as from `b-mobile`. Reusing it keeps envelope parsing and error-code semantics
  (`BlipfotoError.isTokenInvalid`) identical between the two rather than risking drift.
- **`b-push`'s D1 access is typed against a small hand-rolled `DbLike` interface, not the full
  `@cloudflare/workers-types` `D1Database`** (Phase 9, `packages/b-push/src/db.ts`) — every
  business-logic function takes only `{prepare(query): {bind, first, run, all}}`. A real
  `D1Database` satisfies this structurally with no cast (it has strictly more methods); tests pass
  a `node:sqlite`-backed fake satisfying the same minimal shape, exercising `src/schema.sql`'s
  real SQL rather than a second, parallel re-implementation of what it says.
- **`b-push`'s registration row is seeded with the account's _current_ unread totals and push-
  configured flag at `POST` time** (Phase 9, `routes/registrations.ts#createRegistration`) — not
  in notification-service.md's own prose, but a one-off extra call at registration time (using the
  read token the request already carries) avoids a false-positive "N new comments" push on the
  very first activity-poll tick for pre-existing unread items the user already knew about.
- **`b-push`'s hourly prefs-refresh cron never itself marks a registration `read-token-invalid`**
  (Phase 9, `prefsRefresh.ts`) — only the 1-minute activity poll does, since that's the only tick
  that also sends the `reauth-required` push. If the hourly job flipped the status on a dead
  token, the next activity-poll tick's `listDueRegistrations` (which only selects `status =
'active'`) would silently skip the row forever, so the reauth-required alert would never fire.
- **`data/pushService.ts`'s push-event gating is coarse (the `push` channel's on/off flag only),
  not per-event-type** (Phase 9) — a push from this service is a bare count delta with no event
  type attached (notification-service.md), and `NotificationChannel.settings`'s per-event keys are
  server-defined with no fixed list (Phase 8's finding), so there's no reliable way to map an
  aggregated stream total back onto one specific key. Precision the underlying signal can't
  support wasn't attempted.
- **`flows/accountsFlow.ts`'s notification-enabling branches now check push permission _before_
  any interactive OAuth round for the service token** (Phase 9, `signInDeliberate`/
  `changeAccountMode`) — rules.md's "never authorize something already known to be undeliverable."
  A refusal skips the whole notifications branch, including a second sign-in step that would
  otherwise run for nothing.
- **A real, pre-existing gap found (not fixed) in Phase 9: `platform/http.ts`'s native
  `CapacitorHttp` transport is still `platform/http.ts: not implemented until Phase 2`**, verbatim
  from the Phase 1 skeleton — every native GET request (not just this phase's `b-push` calls)
  would throw on a real device. No later phase closed it despite Phases 3–8 building real
  device-facing data-fetching screens. Out of Phase 9's scope (unrelated to notifications, and a
  foundational file too risky to touch as a side effect) — documented here so it isn't
  re-discovered from scratch; whichever phase does real on-device testing needs to close it first.

## Full plan file

The complete phase-by-phase plan as originally approved lives at
`/home/ims/.claude/plans/cosmic-foraging-scroll.md` (outside the repo). This file is the
in-repo mirror and the one that stays current as work progresses — if they ever diverge, this
file wins.
