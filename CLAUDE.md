# b-oss — Claude Code Instructions

## Project overview

b-oss is a monorepo of Blipfoto backup tools. b-ark is the Electron desktop app.
b-ark-chrome is the Chrome-extension sibling (single-account, folder-based backup via
the File System Access API). b-view is the shared journal-viewer component kit, and
b-view-backup is the backup-folder data layer plus the standalone viewer SPA built on it.
b-mobile is the Capacitor (Android) app for browsing and posting to Blipfoto, b-mobile-pc is the
Electron shell that runs b-mobile's web build as a Windows desktop app, b-push is its
Cloudflare Worker notification service, b-status is the Cloudflare Worker monitor behind the unofficial
Blipfoto status page (hosted in b-site), and b-visual holds the shared design tokens and style
guide. All names are lowercase and hyphenated.

## Package structure

```
packages/b-api          No Node or Electron deps. Blipfoto HTTP client.
packages/backup-engine  No Electron deps. Backup algorithm. Defines PlatformIO interface.
packages/b-view             No Node or Electron deps. Source-agnostic, prop-driven React components (ThumbnailGrid, EntryDetail, Lightbox). Uses b-visual tokens.
packages/b-view-backup      No Electron deps. Backup-folder data hooks + the standalone SPA viewer; adapts backup-engine data to b-view's props.
packages/b-visual           No runtime deps. Shared design tokens (tokens.css/tokens.ts) and the style guide. Consumed by b-view and b-mobile.
packages/b-ark-ui-components No Electron deps. Shared, prop-driven presentational kit. Defines BackendContext interface + view types.
packages/b-ark-ui-electron  No Electron deps. Desktop React shell (multi-account App, Sidebar, AppContext reducer) + container wrappers around the kit; includes ElectronBackend (wraps window.api).
packages/b-ark              Electron shell only. Implements PlatformIO (ElectronPlatformIO); wires up ElectronBackend from b-ark-ui-electron.
packages/b-ark-ui-chrome    No Electron deps. Browser React shell (BackupPage) + BrowserBackend (wraps chrome.*) implementing BackendContext, BrowserPlatformIO (File System Access), and the mountChip content-script. Exports the Chrome platform primitives for the shell to reuse.
packages/b-ark-chrome       Chrome extension shell only — service worker (sw.ts), OAuth capture, content scripts. Should consume BrowserBackend/BrowserPlatformIO and the platform primitives from b-ark-ui-chrome.
packages/b-mobile           Capacitor/Ionic Android app. Depends on b-api, b-view, b-visual only (no backup-engine). All `@capacitor/*` imports live in src/platform/**; the rest of the app uses those wrappers.
packages/b-win-startup      Rust Node-API add-on (Windows x64 only) that reads/changes an MSIX startup task (start at sign-in in the Store builds). No JS deps; consumed as build output (`dist/win-startup.node`, copied by electron-builder.store.json) by b-ark and b-mobile-pc, never imported. Built by `build.mjs`; the MSIX workflows run it.
packages/b-mobile-pc        Electron main process + preload that package b-mobile's web build as a desktop app (epic b-oss#605). Serves the build on a private app:// origin and proxies the Blipfoto API on it; keeps secrets in the OS keystore; runs the sign-in window; polls for unread counts and shows OS notifications (b-oss#610, via b-notify-core). Consumes b-mobile/dist as build output (no source dependency); never imports @capacitor/*.
packages/b-site             The b-oss project website (static Astro site, GitHub Pages). Shared Layout/Header/Footer; pages keep their `.html` URLs. No dependency on other packages.
packages/b-notify-core      No Node, Electron or Capacitor deps. The notification-polling rule shared with the desktop shell: unread-totals fetch (messages/totals/unread, counts only) + the pure count-diff rule. Depends on b-api only. Used by the desktop shell (b-mobile-pc) and b-push, so the rule has one copy.
packages/b-push             Cloudflare Worker + D1 notification service for b-mobile. Depends on b-api and b-notify-core only. Design in packages/b-push/ARCHITECTURE.md; deployed manually, see packages/b-push/README.md.
packages/b-status           Cloudflare Worker + D1 monitor behind the unofficial Blipfoto status page (probes the public website, a photo and the API every 15 minutes; takes visitor reports). Depends on no other package. Design in packages/b-status/ARCHITECTURE.md; operating it (deploy, secrets, logs) in packages/b-status/README.md; deployed manually.
```

b-mobile does not share the PlatformIO/BackendContext abstractions: it is its own app shell with a
Capacitor platform layer (`src/platform/`). Its design record is
`packages/b-mobile/docs/ImplementationSpec/app-architecture.md`; what it currently does (and the
SCR-/FLW- id index cited in source comments) is `packages/b-mobile/docs/BEHAVIOUR.md`.

The Chrome side mirrors the Electron split: `b-ark-chrome` is to `b-ark-ui-chrome` what
`b-ark` is to `b-ark-ui-electron` (extension shell over a no-platform-deps React/backend kit).

## Architecture rules (never violate these)

- b-api, backup-engine, b-view, b-view-backup, b-visual, b-ark-ui-components, b-ark-ui-electron, b-ark-ui-chrome, b-mobile, b-notify-core, b-push, b-status must NEVER import from 'electron' (only b-ark and b-mobile-pc, the Electron shells, may)
- b-api, backup-engine, b-view, b-view-backup, b-visual, b-ark-ui-components, b-ark-ui-electron, b-mobile, b-notify-core, b-push, b-status must NEVER reference 'chrome'/`chrome.*` — Chrome APIs live only in b-ark-ui-chrome and b-ark-chrome
- Every package except b-mobile (b-api, backup-engine, b-view, b-view-backup, b-visual, b-ark-ui-*, b-ark, b-ark-chrome, b-mobile-pc, b-notify-core, b-push, b-status) must NEVER import `@capacitor/*` — Capacitor APIs are for b-mobile only, and within b-mobile only `src/platform/**` may import them (enforced by ESLint). b-view's components take host behaviour (e.g. link-click handling) as injectable props/callbacks instead, so they stay usable from a Capacitor host without depending on it
- b-push must NEVER depend on b-mobile, and no package may depend on b-mobile or b-push. (b-mobile-pc packages b-mobile's built `dist/` as a file, not as a package dependency, so it does not break this.) b-push runs on Cloudflare Workers: no Node-only APIs.
- b-status depends on no other package and no package may depend on it (b-site copies the snapshot types by hand). b-status runs on Cloudflare Workers: no Node-only APIs. It reads only public Blipfoto pages and the API with the monitor's own app id; never user credentials or user data.
- b-ark-ui components must NEVER call window.api directly — use useBackend() hook only
- Access tokens: in b-ark, handled in main process only (Electron), never sent to renderer via IPC. (b-mobile and b-mobile-pc work differently: the web app holds the token, as it does in Android's WebView, and the shell only stores it at rest in the OS keystore and runs the sign-in window; the token is never logged or put in prefs.) On Chrome, tokens are AES-GCM encrypted at rest and handed straight to BackupEngine — never broadcast over chrome.runtime messages
- All Blipfoto \_id fields: always use the \_str string variant, store as string
- Atomic file writes: write to `path + '.tmp'` then rename to final path (Electron). The Chrome
  `BrowserPlatformIO` relies instead on the File System Access API's own write semantics —
  `createWritable()`/`close()` swap the file in atomically — so its `atomicWrite` is just `writeFile`
- Naming: always lowercase hyphenated — b-ark, b-view, b-oss. Never capitalised.
- TypeScript: strict mode always. Never use `any`.

## Settings storage (shared model)

Settings live in two places:

- **Portable** — `{backup_folder}/b-ark-settings.json` (schema_version: 1). Holds the
  shared schedule, delay, gap-check, redo, accounts list (identity only), account order,
  and thumbnail size. Follows the folder between machines.
- **Machine-local** — `userData/b-ark-config.json` (electron-store, schema_version: 2).
  Holds `backup_folder` path, `app.autoUpdateEnabled`, encrypted `tokens` (keyed by
  username), and per-account `status` (last_backup_at, RAG, error_message, totals).

The unified log lives at `{backup_folder}/_log.ndjson`. The scheduler is one shared
timer; when it fires, every account is backed up sequentially in `account_order`.

### Settings storage (Chrome extension variant)

The Chrome extension is **single-account** and has no electron-store; it stores state differently:

- **Portable** — `{backup_folder}/b-ark-settings.json`, same schema as desktop, written/read
  through the File System Access API on the user-granted folder handle.
- **Machine-local** — `chrome.storage.local`, keyed by:
  - `b_ark_settings` — the account's settings mirror + UI prefs
  - `b_ark_status` — backup RAG state, error message, last_backup_at, totals
  - `tokenCiphertext` / `tokenIv` — AES-GCM-encrypted OAuth token (the non-extractable
    CryptoKey lives in IndexedDB, never `chrome.storage`)
  - `chip_*` — draggable status-chip state (rag, progress, error kind, last backup, avatar)
  - `folder_ready`, `backup_lifecycle`, `backup_on_publish` — lifecycle/feature flags
  - `backup_tab_id` — id of the one canonical backup-page tab (the SW focuses it via
    `tabs.get(id)` instead of a URL query, so no `tabs` permission is needed)
  - `backup_lock`, `settings_lock` — cross-tab guards (owning tab id) preventing two tabs
    running a backup or editing settings at once
- **FSA handle** — the granted `FileSystemDirectoryHandle` is persisted in IndexedDB
  (`b-ark-ui-chrome/src/fsa-persistence.ts`); permission is re-queried on each use.

## Maintainer's environment (read only if it applies)

The maintainer's own machines (Mutagen dev loops to Windows, the egress proxy, where credentials live) are
described in [docs/MAINTAINER-ENVIRONMENT.md](docs/MAINTAINER-ENVIRONMENT.md). **Agents: assume you are
NOT in that environment.** Run `hostname`; only if it starts with `ims-dev-` does that file apply to you.
Otherwise ignore it and everything it refers to.

The release, deploy and store-listing docs (`RELEASING*.md`, `store/*.md`, the b-push and b-status runbooks) are
likewise maintainer-only and say so at the top: do not act on them for a contribution.

## Commands

```bash
npm run typecheck      # tsc --noEmit across all packages — run after every change
npm run lint           # ESLint --max-warnings 0
npm test               # Vitest across all packages
npm run build          # Build all packages (also bumps the local build counter)
npm run build:release  # Build with RELEASE=1 — version shown as bare 1.0.0
./scripts/build-win-docker.sh [--release]  # Build b-ark's Windows .exe on Linux, no Wine on
                                            # the host — see RELEASING.md §3
```

CI (PRs and pushes to `main`) runs typecheck, lint and test only for the packages a change can
affect (changed packages plus their dependents), planned by `scripts/ci-scope.mjs`; root config
changes run everything. Run the same scoped task locally with
`node scripts/ci-scope.mjs run <typecheck|lint|test> --packages b-status,b-push`.

CI does not run the b-mobile-pc e2e suite or the Android emulator rig below; run them locally when a
change touches the desktop shell or b-mobile's native/WebView behaviour.

### Test harnesses (b-mobile, b-mobile-pc; local only)

```bash
npm run e2e -w @b-oss/b-mobile-pc   # real Electron shell in Docker + virtual display, stub API; Linux + Docker
packages/b-mobile/scripts/emulator/emu.sh setup && packages/b-mobile/scripts/emulator/emu.sh start   # headless Android emulator
node packages/b-mobile/scripts/emulator/run-checks.mjs --main <old.apk> --integ <new.apk> --sender <sender.apk> --out <dir>
node packages/b-mobile/scripts/flow-runner.mjs <outDir> [baseUrl] [flow,...]   # scripted flows vs scripts/stub-api.mjs; diff two runs with scripts/flow-diff.mjs
node packages/b-mobile/scripts/compare-shots.mjs --a <dirA> --b <dirB> --out <outDir>   # screenshot diff of two worktrees' builds
```

Emulator rig: needs `/dev/kvm`, the Android SDK and ~2 GB first download (setup ~20 min through the proxy);
cold boot ~75 s, a full check run ~3 min, ~4.3 GB RAM for one emulator at a time. It catches update-over-data,
deep links, share intents, Back and resume on the real WebView; FCM push and real-account flows stay manual.
Setup, the check list and limits: `packages/b-mobile/scripts/emulator/README.md`. e2e details (several runs at
once, variants): `packages/b-mobile-pc/e2e/README.md`. `flow-runner.mjs` and `compare-shots.mjs` need
`playwright-core` and an `npm ci`'d worktree; their header comments give the stub and dev-server setup.

### Local Android build + lint check (b-mobile; no CI)

Run before merging anything that touches `packages/b-mobile/android/**`, the manifest, or a Capacitor
plugin/SDK version — it catches manifest, SDK and plugin breakage that vitest can't:

```bash
export ANDROID_HOME=$HOME/Android/Sdk && npm run build -w @b-oss/b-mobile && (cd packages/b-mobile && npx cap sync android) && (cd packages/b-mobile/android && ./gradlew assembleRelease lintRelease)
```

Takes ~2 min cold; produces an unsigned APK (`app-release-unsigned.apk`), nothing is uploaded. Gradle's JVM
ignores `HTTP(S)_PROXY`, so behind a proxy set `systemProp.http(s).proxyHost/proxyPort` in
`~/.gradle/gradle.properties`. `lintRelease` currently fails on one error
(`PermissionImpliesUnsupportedChromeOsHardware`: the CAMERA permission lacks a
`<uses-feature android:name="android.hardware.camera" android:required="false"/>`), tracked on b-oss#330.

### Regenerating the b-mobile native Android licence list

After a Capacitor/plugin/native dependency change, with an Android SDK and the proxy set up as above:

```bash
export ANDROID_HOME=$HOME/Android/Sdk && npm run build -w @b-oss/b-mobile && (cd packages/b-mobile && npx cap sync android) && npm run licences:native -w @b-oss/b-mobile
```

(The build + `cap sync` first are needed on a fresh checkout so Gradle can configure.) Commit the updated
`native-licences.generated.json`. Licence texts live in `packages/b-mobile/scripts/licence-texts/`; a new
non-Apache licence needs a matching entry/file in `scripts/native-licences.mjs`.

## Testing records

- Testing still to do (device checks, verifying something just built) goes in a GitHub issue or the
  PR description.
- `packages/b-mobile/docs/DECIDED_NOT_TO_TEST.md` is ONLY for things the owner has explicitly said
  they are not testing. Never add to it on your own judgement, and don't use it as a testing log.

## Local build credentials (`.env.local`)

`MAIN_VITE_BLIPFOTO_CLIENT_ID` (b-ark) and `VITE_CHROME_CLIENT_ID`
(b-ark-chrome) are read from a `.env.local` at the **repo root** (`vite.config.ts`/
`electron.vite.config.ts` set `envDir` there — see `.env.example` for the full
list and where to register each app). `.env.local` is gitignored, so it only
exists wherever someone manually put it.

**Keep `.env.local` in step with `.env.example`.** `.env.local` is gitignored, so a copy made into a worktree
goes stale when `.env.example` gains a key on main (found 2026-10-31: no `VITE_GEOAPIFY_KEY`, so the map said
"unavailable"). To see what a worktree lacks:
`diff <(grep -oE '^[A-Z0-9_]+=' .env.example | sort -u) <(grep -oE '^[A-Z0-9_]+=' .env.local | sort -u)`. The
b-mobile-pc Windows build script (`packages/b-mobile-pc/scripts/build-win-docker.sh`) runs
`packages/b-mobile-pc/scripts/env-check.mjs`, which does that comparison for you: it names (never prints values
of) every key `.env.local` lacks, notes the ones marked `# optional` in `.env.example`, and stops the build for
the rest unless `BMPC_ALLOW_MISSING_ENV=1`. The e2e `run.sh` runs it warn-only. Mark a new key `# optional`
in `.env.example` if a build can do without it.

**Worktree gotcha:** `git worktree add` only populates tracked files from the
checked-out branch — gitignored files like `.env.local` are not copied into a
new worktree automatically, because each worktree is a separate directory on
disk. A worktree without its own `.env.local` builds successfully (no error,
no warning) but with an empty client ID, and the "Sign in to Blipfoto" button
then does nothing at all - no console output anywhere (page, popup, or service
worker), because `startOAuthFlow` treats a missing client ID as a silent,
logged-to-storage-only error rather than throwing. Confirmed on 2026-09-05
after exactly this happened on a fresh build. Copy or symlink
`.env.local` from the main checkout into any new worktree before relying on
OAuth-related functionality there.

## Debug build beside the Play build (b-mobile)

The Play release is `uk.co.salientpoint.bmobile`; the debug build is
`uk.co.salientpoint.bmobile.debug` ("b-mobile (debug)", scheme `bmobile-debug://`), so both install
on one phone with separate data. Build it with `npm run build:android-debug` (not `npm run build`),
`npx cap sync android`, `./gradlew assembleDebug`. It reads `.env.android-debug.local` for its own
Blipfoto client ID and redirect; `google-services.json` must hold a client for both package names.
Details in `.env.example`. Release builds (the `b-mobile-v*` workflow) are unaffected.

`google-services.json` is gitignored (`packages/b-mobile/android/.gitignore`) and a build without it
succeeds but silently has no push notifications. Put your own (from your Firebase project, with a client
for each package name you build) at `packages/b-mobile/android/app/google-services.json`. A new worktree
needs it, `.env.local` and `.env.android-debug.local` copied or symlinked in from the main checkout.

## Versioning

Display version format: `{pkg.major}.{pkg.minor}.{pkg.patch}[.{commits}.{build}]`.

- Dev builds show e.g. `1.0.0.347.12` — third digit is `git rev-list --count HEAD`
  (timeline position, stable per commit), fourth digit is a local per-machine counter
  bumped every `npm run build` (proves the build ran on your box).
- Release builds (`RELEASE=1 npm run build` or `npm run build:release`) drop the
  suffix and show bare `1.0.0`.
- `scripts/version.mjs` runs as the root `prebuild`, writes `version.generated.json`
  at the repo root, which both `vite.config.ts` (b-view) and `electron.vite.config.ts`
  (b-ark) inject as the `__APP_VERSION__` define.
- `package.json` versions stay at the baseline (`1.0.0`) — installer filenames and
  `app.getVersion()` are unaffected. Bumping `package.json` is a real release action.
- Both `.build-counter` and `version.generated.json` are gitignored.
- Single-workspace builds (`npm run build --workspace=…`) skip the root `prebuild`;
  run `npm run version:bump` first if a fresh counter tick matters.

## Key Blipfoto API facts

- Base URL: https://api.blipfoto.com/4/
- OAuth authorize: https://www.blipfoto.com/oauth/authorize
- Auth flow: distributed app type, response_type=token, redirect to b-ark://oauth/callback
- Chrome extension auth: same distributed/implicit-grant flow but redirects to
  `bark-chrome://oauth/callback` (scope `read`), captured via `chrome.webRequest.onBeforeRedirect`.
  The distinct scheme avoids colliding with the desktop `b-ark://` handler.
- Rate limits: 15-minute windows; check X-RateLimit-Remaining on every response
- 64-bit IDs: always use entry_id_str (not entry_id integer)

## File naming in backup folders

- Entry JSON: YYYY-MM-DD.json
- Entry display image: YYYY-MM-DD.jpg
- Entry thumbnail: YYYY-MM-DD-t.jpg
- Entry original-quality image: YYYY-MM-DD-o.jpg
- Entry hires image: YYYY-MM-DD-h.jpg
- Folder structure: entries/YYYY/YYYY-MM-DD.\*
- Date collisions (multiple entries on same date): suffix with entry ID, e.g. YYYY-MM-DD-{entry_id}.json
