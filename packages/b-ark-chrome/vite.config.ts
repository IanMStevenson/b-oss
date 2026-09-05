// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const ENV_DIR = resolve(__dirname, '../..');

function readGeneratedVersion(): string {
  const path = resolve(__dirname, '../../version.generated.json');
  if (!existsSync(path)) return '0.0.0-dev';
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version: string };
  return parsed.version;
}

function readGeneratedRelease(): boolean {
  const path = resolve(__dirname, '../../version.generated.json');
  if (!existsSync(path)) return false;
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { isRelease?: boolean };
  return parsed.isRelease ?? false;
}

export default defineConfig(({ mode }) => {
  // Fail the build/dev server outright rather than silently shipping an
  // extension that builds cleanly but has sign-in permanently, silently
  // broken - the previous behaviour of this missing var (empty string baked
  // in, failing only at runtime with no visible error) cost real debugging
  // time on 2026-09-05. CI never runs `build`/`dev` (only typecheck/lint/
  // test), so this can't break CI.
  const env = loadEnv(mode, ENV_DIR, '');
  if (!env.VITE_CHROME_CLIENT_ID) {
    throw new Error(
      'VITE_CHROME_CLIENT_ID is not set. Add it to .env.local at the repo root ' +
        '(see .env.example) — without it, Blipfoto sign-in silently does nothing at runtime.',
    );
  }

  return {
    envDir: ENV_DIR,
    define: {
      __APP_VERSION__: JSON.stringify(readGeneratedVersion()),
      __RELEASE__: JSON.stringify(readGeneratedRelease()),
    },
    resolve: {
      dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
      // Resolve the workspace UI packages to their LIVE src (like b-view already does via
      // its package "main"). Their package.json "main" points at compiled dist/index.js,
      // which a `--workspace` build never recompiles — so bundling dist would ship stale
      // components. Anchored regexes match only the bare specifier, leaving explicit
      // subpath imports (e.g. `@b-oss/b-ark-ui-chrome/src/styles.css`) untouched.
      alias: [
        {
          find: /^@b-oss\/b-ark-ui-chrome$/,
          replacement: resolve(__dirname, '../b-ark-ui-chrome/src/index.ts'),
        },
        {
          find: /^@b-oss\/b-ark-ui-components$/,
          replacement: resolve(__dirname, '../b-ark-ui-components/src/index.ts'),
        },
        {
          find: /^@b-oss\/backup-engine$/,
          replacement: resolve(__dirname, '../backup-engine/src/index.ts'),
        },
      ],
    },
    plugins: [react(), crx({ manifest })],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          'backup-page': resolve(__dirname, 'src/backup-page.html'),
        },
      },
    },
  };
});
