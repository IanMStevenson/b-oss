# Prompt 1 — b-oss Monorepo Scaffold

## What you are building

You are setting up the complete repository scaffold for **b-oss** (Blipfoto Open Source Software), an open-source monorepo containing tools for backing up Blipfoto photography journals. This is Prompt 1 of 6. You are creating structure and configuration only — no business logic yet.

The monorepo contains five packages (to be implemented in later prompts):

| Package | Role |
|---|---|
| `packages/blipfoto-api` | Blipfoto REST API client (no Node/Electron deps) |
| `packages/backup-engine` | Backup algorithm and data model (no Electron deps) |
| `packages/b-view` | Shared React viewer components + standalone SPA |
| `packages/b-ark-ui` | b-ark React UI (portable, no Electron deps) |
| `packages/b-ark` | Electron desktop app shell |

## Naming conventions

Project names are always **lowercase and hyphenated**: b-oss, b-ark, b-view. Never capitalised, even at the start of a sentence.

## Your task

Create the complete monorepo scaffold in the current directory. Initialize a git repository with `main` as the default branch (`git init -b main`). Create all configuration files, tooling, CI workflows, documentation stubs, and empty package structures. Do **not** implement any business logic — package `src/index.ts` files contain only a comment and a placeholder export.

---

## Root-level files to create

### `package.json`

```json
{
  "name": "b-oss",
  "private": true,
  "version": "0.1.0",
  "description": "Blipfoto Open Source Software — tools for backing up Blipfoto journals",
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "typecheck": "tsc --build packages/blipfoto-api packages/backup-engine packages/b-view packages/b-ark-ui packages/b-ark --noEmit",
    "lint": "eslint packages --ext .ts,.tsx --max-warnings 0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "format": "prettier --write \"packages/**/*.{ts,tsx,css,json}\"",
    "setup": "node scripts/setup.js",
    "prepare": "husky"
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "eslint": "^8.57.0",
    "eslint-plugin-import": "^2.29.0",
    "eslint-plugin-react": "^7.34.0",
    "eslint-plugin-react-hooks": "^4.6.0",
    "husky": "^9.0.0",
    "lint-staged": "^15.0.0",
    "prettier": "^3.2.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "npm": ">=10.0.0"
  },
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --max-warnings 0 --fix", "prettier --write"],
    "*.{json,css,md}": ["prettier --write"]
  }
}
```

### `tsconfig.base.json`

```json
{
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "lib": ["ES2022", "DOM"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

### `eslint.config.cjs`

```js
// @ts-check
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const reactPlugin = require('eslint-plugin-react');
const reactHooksPlugin = require('eslint-plugin-react-hooks');
const importPlugin = require('eslint-plugin-import');

/** @type {import('eslint').Linter.FlatConfig[]} */
module.exports = [
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/*.js', '**/*.cjs', '**/*.mjs'],
  },
  {
    files: ['packages/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { project: true },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react': reactPlugin,
      'react-hooks': reactHooksPlugin,
      'import': importPlugin,
    },
    rules: {
      ...tsPlugin.configs['recommended-type-checked'].rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Enforce architecture boundaries
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['electron'], message: 'Only packages/b-ark may import from electron.' }
        ]
      }],
    },
    settings: {
      react: { version: 'detect' },
    },
  },
];
```

### `.prettierrc`

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

### `.nvmrc`

```
20
```

### `.env.example`

```
# Blipfoto developer app credentials
# Register your app at https://www.blipfoto.com/developer/apps
# Register as "distributed app" type with redirect URI: b-ark://oauth/callback
# Must be prefixed VITE_ so electron-vite exposes it via import.meta.env
VITE_BLIPFOTO_CLIENT_ID=
```

### `.gitignore`

```
# Dependencies
node_modules/

# Build output
dist/
out/
.vite/

# Environment — never commit real credentials
.env.local
.env.*.local

# Electron builder output
release/

# Test coverage
coverage/

# OS
.DS_Store
Thumbs.db

# Editors
.idea/
*.swp

# TypeScript build info
*.tsbuildinfo
```

---

## CLAUDE.md

Create `CLAUDE.md` at the repo root:

```markdown
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
- All Blipfoto _id fields: always use the _str string variant, store as string
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
- Folder structure: entries/YYYY/YYYY-MM-DD.*
```

---

## `.claude/settings.json`

Create this file to configure post-edit hooks:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "npm run typecheck 2>&1 | tail -30"
          }
        ]
      }
    ]
  }
}
```

---

## `.vscode/` directory

### `.vscode/settings.json`

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  },
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "vitest.enable": true,
  "vitest.commandLine": "npx vitest"
}
```

### `.vscode/extensions.json`

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-typescript-next",
    "vitest.explorer",
    "eamodio.gitlens"
  ]
}
```

### `.vscode/launch.json`

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Electron Main",
      "type": "node",
      "request": "launch",
      "cwd": "${workspaceFolder}/packages/b-ark",
      "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron",
      "runtimeArgs": ["--inspect=5858", "."],
      "windows": { "runtimeExecutable": "${workspaceFolder}/node_modules/.bin/electron.cmd" },
      "env": { "NODE_ENV": "development" }
    },
    {
      "name": "Vitest",
      "type": "node",
      "request": "launch",
      "autoAttachChildProcesses": true,
      "skipFiles": ["<node_internals>/**", "**/node_modules/**"],
      "program": "${workspaceFolder}/node_modules/vitest/vitest.mjs",
      "args": ["run", "--reporter=verbose"],
      "smartStep": true
    }
  ]
}
```

### `.vscode/tasks.json`

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "typecheck",
      "type": "shell",
      "command": "npm run typecheck",
      "group": "build",
      "presentation": { "reveal": "always" }
    },
    {
      "label": "test",
      "type": "shell",
      "command": "npm test",
      "group": "test"
    }
  ]
}
```

---

## GitHub Actions workflows

### `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  ci:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run typecheck
      - run: npm run lint
      - run: npm test
```

### `.github/workflows/release-win.yml`

```yaml
name: Release (Windows)

on:
  push:
    tags: ['v*']

jobs:
  release-win:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run build
      - name: Build and publish Electron app
        env:
          VITE_BLIPFOTO_CLIENT_ID: ${{ secrets.BLIPFOTO_CLIENT_ID }}  # VITE_ prefix required by electron-vite
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
        run: npm run release --workspace=packages/b-ark
```

### `.github/workflows/release-mac.yml`

```yaml
# MAC BUILD — DISABLED
# Requires a macOS runner and Apple code signing credentials.
# Enable this workflow when a Mac contributor is available to own and validate it.
# See CONTRIBUTING.md for details.
#
# name: Release (Mac)
# on:
#   push:
#     tags: ['v*']
# jobs:
#   release-mac:
#     runs-on: macos-latest
#     steps:
#       - uses: actions/checkout@v4
#       - uses: actions/setup-node@v4
#         with:
#           node-version: '20'
#           cache: 'npm'
#       - run: npm ci
#       - run: npm run build
#       - env:
#           VITE_BLIPFOTO_CLIENT_ID: ${{ secrets.BLIPFOTO_CLIENT_ID }}
#           GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
#           APPLE_ID: ${{ secrets.APPLE_ID }}
#           APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
#           APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
#         run: npm run release --workspace=packages/b-ark
```

---

## Husky setup

Run: `npx husky init`

Create `.husky/pre-commit`:
```sh
npx lint-staged
```

---

## Package scaffolds

Create the following directory structure and files for each package. Each `src/index.ts` contains only a comment placeholder — implementation comes in later prompts.

### `packages/blipfoto-api/`

**`package.json`**:
```json
{
  "name": "@b-oss/blipfoto-api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "msw": "^2.0.0",
    "vitest": "^1.6.0"
  }
}
```

**`tsconfig.json`**:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

**`src/index.ts`**: `// blipfoto-api — implemented in Prompt 2`

**`src/__tests__/`**: empty directory

### `packages/backup-engine/`

**`package.json`**:
```json
{
  "name": "@b-oss/backup-engine",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@b-oss/blipfoto-api": "*"
  },
  "devDependencies": {
    "vitest": "^1.6.0"
  }
}
```

**`tsconfig.json`**: same pattern as blipfoto-api, `outDir: dist`, `rootDir: src`

**`src/index.ts`**: `// backup-engine — implemented in Prompt 3`

### `packages/b-view/`

**`package.json`**:
```json
{
  "name": "@b-oss/b-view",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build:lib": "tsc",
    "build:app": "vite build",
    "build": "npm run build:lib && npm run build:app",
    "dev": "vite",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "lucide-react": "^0.383.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@testing-library/react": "^15.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.0.0",
    "jsdom": "^24.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.6.0"
  }
}
```

**`tsconfig.json`**: extends base, `outDir: dist`, `rootDir: src`

**`src/index.ts`**: `// b-view components — implemented in Prompt 4`

**`index.html`**: minimal HTML shell (Vite entry point for standalone SPA)

### `packages/b-ark-ui/`

**`package.json`**:
```json
{
  "name": "@b-oss/b-ark-ui",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@b-oss/b-view": "*",
    "lucide-react": "^0.383.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@testing-library/react": "^15.0.0",
    "@testing-library/user-event": "^14.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "vitest": "^1.6.0"
  }
}
```

**`src/index.ts`**: `// b-ark-ui — implemented in Prompt 5`

### `packages/b-ark/`

**`package.json`**:
```json
{
  "name": "b-ark",
  "version": "0.1.0",
  "private": true,
  "main": "dist/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "electron-vite typecheck",
    "release": "electron-builder",
    "test": "vitest run"
  },
  "dependencies": {
    "@b-oss/b-ark-ui": "*",
    "@b-oss/backup-engine": "*",
    "@b-oss/b-view": "*",
    "electron-store": "^10.0.0",
    "electron-updater": "^6.0.0",
    "lucide-react": "^0.383.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^2.0.0",
    "vite": "^5.0.0",
    "vitest": "^1.6.0"
  }
}
```

**`electron.vite.config.ts`**: placeholder — full config implemented in Prompt 6

**`src/main/index.ts`**: `// b-ark main process — implemented in Prompt 6`

**`src/preload/index.ts`**: `// b-ark preload — implemented in Prompt 6`

**`src/renderer/index.html`**: minimal HTML entry point

**`src/renderer/main.tsx`**: `// b-ark renderer — implemented in Prompt 6`

---

## Documentation stubs

### `README.md`

```markdown
# b-oss

> Blipfoto Open Source Software

b-oss is a family of open-source tools for backing up and viewing [Blipfoto](https://www.blipfoto.com) journals.

## Applications

- **b-ark** — desktop app (Windows, Mac coming soon) that backs up your Blipfoto journals to local disk
- **b-view** — browser-based viewer for a b-ark backup, can be deployed to any static web host

## Status

Under active development. Not yet released.

## Getting started (development)

```bash
git clone https://github.com/YOUR_USERNAME/b-oss.git
cd b-oss
nvm use
npm run setup
```

## License

GPLv3 — see [LICENSE](LICENSE)
```

### `LICENSE`

Full GPLv3 licence text. Use the standard GPLv3 text from https://www.gnu.org/licenses/gpl-3.0.txt — reproduce it in full.

### `CONTRIBUTING.md`

```markdown
# Contributing to b-oss

## Getting started

1. Clone the repo and run `nvm use && npm run setup`
2. Copy `.env.example` to `.env.local` and set `VITE_BLIPFOTO_CLIENT_ID` to your Blipfoto client ID
   (Register a **distributed app** at https://www.blipfoto.com/developer/apps,
   redirect URI: `b-ark://oauth/callback` — no client secret needed)
3. Run `npm run dev` to start b-ark in development mode

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md) for the package structure and design principles.

## Mac build

Mac builds require a macOS runner with Apple code signing — this cannot be cross-compiled.
The Mac GitHub Actions workflow is present but disabled. We are looking for a Mac contributor
to enable, validate, and own the Mac build pipeline. See `.github/workflows/release-mac.yml`.

## Code style

- TypeScript strict mode everywhere — no `any`
- Run `npm run typecheck && npm run lint` before submitting a PR
- All names lowercase hyphenated: b-ark, b-view, b-oss

## Licence

By contributing you agree your contributions are licensed under GPLv3.
```

### `ARCHITECTURE.md`

```markdown
# b-oss Architecture

## Package dependency graph

```
b-ark (Electron shell)
  └── b-ark-ui (React UI, BackendContext interface)
        └── b-view (shared React components)
  └── backup-engine (backup algorithm, PlatformIO interface)
        └── blipfoto-api (HTTP client)
```

## Two abstraction boundaries

### 1. PlatformIO (backend I/O)
`backup-engine` defines `PlatformIO` — an interface for filesystem and download operations.
`b-ark` implements `ElectronPlatformIO` using Node's `fs/promises`.
A future React Native port would implement a different `PlatformIO` — the backup logic is unchanged.

### 2. BackendContext (UI shell)
`b-ark-ui` defines `BackendContext` — a React context interface for all "native" operations.
`b-ark` implements `ElectronBackend` using Electron IPC (contextBridge).
A future Capacitor/iPad port would implement a different `BackendContext` — the UI is unchanged.

## IPC security rules

- All IPC channels typed in `packages/b-ark/src/preload/index.ts`
- Renderer accesses native operations only via `window.api` (contextBridge)
- Access tokens never leave the main process
- No raw Node APIs exposed to the renderer

## File naming in backup folders

- `YYYY-MM-DD.json` — full entry data
- `YYYY-MM-DD.jpg` — original image
- `YYYY-MM-DD-t.jpg` — user-selected thumbnail
- Folder: `entries/YYYY/` — one subfolder per year
```

### `CHANGELOG.md`

```markdown
# Changelog

All notable changes to b-oss will be documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Initial project structure
```

### `docs/releasing.md`

```markdown
# Releasing b-ark

## Prerequisites
- GitHub Secrets configured: `BLIPFOTO_CLIENT_ID`, `GH_TOKEN` (automatic)
- Code signing cert in Secrets: `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (before public release)

## Steps

1. Update `CHANGELOG.md` — move items from Unreleased to a new version section
2. Bump version: `npm version patch|minor|major` at repo root
3. Push: `git push && git push --tags`
4. GitHub Actions `release-win.yml` triggers on the `v*` tag:
   - Builds all packages
   - Runs `electron-builder` targeting Windows
   - Uploads the installer + `latest.yml` manifest to a GitHub Release draft
5. Go to the GitHub Releases page, review the draft, add release notes, publish
6. Existing b-ark installs will detect the new version on next launch via `electron-updater`

## Recovering from a bad release

1. Delete the GitHub Release draft (Releases → Edit → Delete)
2. Delete the tag: `git tag -d vX.Y.Z && git push origin :vX.Y.Z`
3. Fix the issue, re-tag, re-push
```

---

## `scripts/setup.js`

```js
#!/usr/bin/env node
import { execSync } from 'child_process';
import { existsSync, copyFileSync } from 'fs';
import { join } from 'path';

const root = new URL('..', import.meta.url).pathname;

console.log('🔧 b-oss setup\n');

// Check Node version
const major = parseInt(process.versions.node.split('.')[0], 10);
if (major < 20) {
  console.error(`❌ Node 20+ required. Current: ${process.versions.node}`);
  process.exit(1);
}
console.log(`✓ Node ${process.versions.node}`);

// Install dependencies
console.log('📦 Installing dependencies...');
execSync('npm install', { cwd: root, stdio: 'inherit' });

// Copy .env.example → .env.local if not present
const envLocal = join(root, '.env.local');
const envExample = join(root, '.env.example');
if (!existsSync(envLocal)) {
  copyFileSync(envExample, envLocal);
  console.log('✓ Created .env.local (copy of .env.example)');
}

// Typecheck
console.log('🔍 Type-checking...');
execSync('npm run typecheck', { cwd: root, stdio: 'inherit' });

console.log('\n✅ Setup complete!');
console.log('👉 Edit .env.local and add your VITE_BLIPFOTO_CLIENT_ID');
console.log('   (Register at https://www.blipfoto.com/developer/apps)');
console.log('   App type: distributed | Redirect URI: b-ark://oauth/callback');
```

---

## Acceptance criteria

Before finishing, verify:

- [ ] `git init -b main` has been run; default branch is `main`; `.gitignore` is in place
- [ ] `npm install` runs without errors from the root
- [ ] `npm run typecheck` runs (may emit errors on stubs — that is acceptable at this stage)
- [ ] `npm run lint` runs without crashing (warnings on stubs are acceptable)
- [ ] `npm test` runs (no tests yet, but vitest exits cleanly)
- [ ] All five `packages/*/package.json` files exist and reference each other correctly via `"*"` workspace deps
- [ ] `.env.local` is gitignored and `.env.example` is committed
- [ ] `CLAUDE.md`, `LICENSE`, `README.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `CHANGELOG.md` all exist
- [ ] `docs/releasing.md` exists
- [ ] All three `.github/workflows/` files exist (Mac workflow is fully commented out)
- [ ] `.vscode/` folder has all four config files
- [ ] `.claude/settings.json` exists with the PostToolUse hook

## Do NOT

- Do not implement any business logic in packages
- Do not add React component code, API clients, or backup algorithms
- Do not commit `.env.local`
