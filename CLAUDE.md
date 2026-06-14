# b-oss — Claude Code Instructions

## Project overview

b-oss is a monorepo of Blipfoto backup tools. b-ark is the Electron desktop app.
b-ark-chrome is the Chrome-extension sibling (single-account, folder-based backup via
the File System Access API). b-view is the browser-based journal viewer. All names are
lowercase and hyphenated.

## Package structure

```
packages/b-api          No Node or Electron deps. Blipfoto HTTP client.
packages/backup-engine  No Electron deps. Backup algorithm. Defines PlatformIO interface.
packages/b-view             No Node or Electron deps. React components + standalone SPA.
packages/b-ark-ui-components No Electron deps. Shared, prop-driven presentational kit. Defines BackendContext interface + view types.
packages/b-ark-ui-electron  No Electron deps. Desktop React shell (multi-account App, Sidebar, AppContext reducer) + container wrappers around the kit; includes ElectronBackend (wraps window.api).
packages/b-ark              Electron shell only. Implements PlatformIO (ElectronPlatformIO); wires up ElectronBackend from b-ark-ui-electron.
packages/b-ark-ui-chrome    No Electron deps. Browser React shell (BackupPage) + BrowserBackend (wraps chrome.*) implementing BackendContext, BrowserPlatformIO (File System Access), and the mountChip content-script. Exports the Chrome platform primitives for the shell to reuse.
packages/b-ark-chrome       Chrome extension shell only — service worker (sw.ts), OAuth capture, content scripts. Should consume BrowserBackend/BrowserPlatformIO and the platform primitives from b-ark-ui-chrome.
```

The Chrome side mirrors the Electron split: `b-ark-chrome` is to `b-ark-ui-chrome` what
`b-ark` is to `b-ark-ui-electron` (extension shell over a no-platform-deps React/backend kit).

## Architecture rules (never violate these)

- b-api, backup-engine, b-view, b-ark-ui-components, b-ark-ui-electron, b-ark-ui-chrome must NEVER import from 'electron'
- b-api, backup-engine, b-view, b-ark-ui-components, b-ark-ui-electron must NEVER reference 'chrome'/`chrome.*` — Chrome APIs live only in b-ark-ui-chrome and b-ark-chrome
- b-ark-ui components must NEVER call window.api directly — use useBackend() hook only
- Access tokens: handled in main process only (Electron), never sent to renderer via IPC. On Chrome, tokens are AES-GCM encrypted at rest and handed straight to BackupEngine — never broadcast over chrome.runtime messages
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
  Holds `backup_folder` path, `app.startWithWindows`, encrypted `tokens` (keyed by
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

## Commands

```bash
npm run typecheck      # tsc --noEmit across all packages — run after every change
npm run lint           # ESLint --max-warnings 0
npm test               # Vitest across all packages
npm run build          # Build all packages (also bumps the local build counter)
npm run build:release  # Build with RELEASE=1 — version shown as bare 1.0.0
```

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
