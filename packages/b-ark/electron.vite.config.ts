// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig } from 'electron-vite';
import { loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

// .env.local lives at the repo root (../..), not at packages/b-ark/.
const envDir = resolve(__dirname, '../..');

function readGeneratedVersion(): string {
  const path = resolve(__dirname, '../../version.generated.json');
  if (!existsSync(path)) return '0.0.0-dev';
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version: string };
  return parsed.version;
}

const versionDefine = { __APP_VERSION__: JSON.stringify(readGeneratedVersion()) };

export default defineConfig(({ mode }) => {
  // Fail the build/dev server outright rather than silently shipping an app
  // with sign-in permanently broken - see the matching check in
  // packages/b-ark-chrome/vite.config.ts for the sibling bug this guards
  // against (2026-09-05). CI never runs `build`/`dev` (only typecheck/lint/
  // test), so this can't break CI.
  const env = loadEnv(mode, envDir, '');
  if (!env.MAIN_VITE_BLIPFOTO_CLIENT_ID) {
    throw new Error(
      'MAIN_VITE_BLIPFOTO_CLIENT_ID is not set. Add it to .env.local at the repo root ' +
        '(see .env.example) — without it, Blipfoto sign-in fails for every account added.',
    );
  }

  return {
    main: {
      envDir,
      define: versionDefine,
      resolve: {
        // Resolve to LIVE src, not the compiled dist/index.js `package.json`
        // "main" points at - a `--workspace`-scoped build never recompiles
        // backup-engine, so bundling dist can silently ship stale backup
        // logic (see packages/b-ark-chrome/vite.config.ts for the sibling
        // fix, #87/#88). Anchored regex matches only the bare specifier.
        // Also requires excluding it from externalizeDeps below - alias
        // alone does nothing, since main.build's default externalization
        // (everything in package.json "dependencies") runs first and
        // leaves `require("@b-oss/backup-engine")` for Node/electron to
        // resolve at runtime via node_modules, past the alias entirely.
        alias: [
          {
            find: /^@b-oss\/backup-engine$/,
            replacement: resolve(__dirname, '../backup-engine/src/index.ts'),
          },
        ],
      },
      build: {
        outDir: 'dist/main',
        externalizeDeps: { exclude: ['electron-store', '@b-oss/backup-engine'] },
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/main/index.ts') },
        },
      },
    },
    preload: {
      envDir,
      define: versionDefine,
      build: {
        outDir: 'dist/preload',
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/preload/index.ts') },
          // Electron loads preload scripts as CommonJS even with contextIsolation.
          output: { format: 'cjs', entryFileNames: '[name].js' },
        },
      },
    },
    renderer: {
      envDir,
      define: versionDefine,
      root: 'src/renderer',
      resolve: {
        dedupe: ['react', 'react-dom'],
      },
      build: {
        outDir: 'dist/renderer',
        rollupOptions: {
          input: { index: resolve(__dirname, 'src/renderer/index.html') },
        },
      },
      plugins: [react()],
    },
  };
});
