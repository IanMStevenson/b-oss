# b-oss — Claude Code Instructions

## Project overview

b-oss is a monorepo of Blipfoto backup tools. b-ark is the Electron desktop app.
b-view is the browser-based journal viewer. All names are lowercase and hyphenated.

## Package structure

```
packages/blipfoto-api   No Node or Electron deps. Blipfoto HTTP client.
packages/backup-engine  No Electron deps. Backup algorithm. Uses PlatformIO interface.
packages/b-view         No Node or Electron deps. React components + standalone SPA.
packages/b-ark-ui       No Electron deps. React UI. Uses BackendContext interface.
packages/b-ark          Electron shell only. Implements PlatformIO and BackendContext.
```

## Architecture rules (never violate these)

- blipfoto-api, backup-engine, b-view, b-ark-ui must NEVER import from 'electron'
- b-ark-ui components must NEVER call window.api directly — use useBackend() hook only
- Access tokens: handled in main process only, never sent to renderer via IPC
- All Blipfoto \_id fields: always use the \_str string variant, store as string
- Atomic file writes: write to `path + '.tmp'` then rename to final path
- Naming: always lowercase hyphenated — b-ark, b-view, b-oss. Never capitalised.
- TypeScript: strict mode always. Never use `any`.

## Commands

```bash
npm run typecheck   # tsc --noEmit across all packages — run after every change
npm run lint        # ESLint --max-warnings 0
npm test            # Vitest across all packages
npm run build       # Build all packages
```

## Key Blipfoto API facts

- Base URL: https://api.blipfoto.com/4/
- OAuth authorize: https://www.blipfoto.com/oauth/authorize
- Auth flow: distributed app type, response_type=token, redirect to b-ark://oauth/callback
- Rate limits: 15-minute windows; check X-RateLimit-Remaining on every response
- 64-bit IDs: always use entry_id_str (not entry_id integer)

## File naming in backup folders

- Entry JSON: YYYY-MM-DD.json
- Entry image (original): YYYY-MM-DD.jpg
- Entry thumbnail: YYYY-MM-DD-t.jpg
- Folder structure: entries/YYYY/YYYY-MM-DD.\*
