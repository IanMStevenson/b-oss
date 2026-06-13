# b-oss — Claude Code Instructions

## Project overview

b-oss is a monorepo of Blipfoto backup tools. b-ark is the Electron desktop app.
b-view is the browser-based journal viewer. All names are lowercase and hyphenated.

## Package structure

```
packages/b-api          No Node or Electron deps. Blipfoto HTTP client.
packages/backup-engine  No Electron deps. Backup algorithm. Defines PlatformIO interface.
packages/b-view             No Node or Electron deps. React components + standalone SPA.
packages/b-ark-ui-components No Electron deps. Shared, prop-driven presentational kit. Defines BackendContext interface + view types.
packages/b-ark-ui-electron  No Electron deps. Desktop React shell (multi-account App, Sidebar, AppContext reducer) + container wrappers around the kit; includes ElectronBackend (wraps window.api).
packages/b-ark              Electron shell only. Implements PlatformIO (ElectronPlatformIO); wires up ElectronBackend from b-ark-ui-electron.
```

## Architecture rules (never violate these)

- b-api, backup-engine, b-view, b-ark-ui-components, b-ark-ui-electron must NEVER import from 'electron'
- b-ark-ui components must NEVER call window.api directly — use useBackend() hook only
- Access tokens: handled in main process only, never sent to renderer via IPC
- All Blipfoto \_id fields: always use the \_str string variant, store as string
- Atomic file writes: write to `path + '.tmp'` then rename to final path
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
