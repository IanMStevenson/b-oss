// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

function readGeneratedVersion(): string {
  const path = resolve(__dirname, '../../version.generated.json');
  if (!existsSync(path)) return '0.0.0-dev';
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version: string };
  return parsed.version;
}

export default defineConfig({
  envDir: resolve(__dirname, '../..'),
  define: {
    __APP_VERSION__: JSON.stringify(readGeneratedVersion()),
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
    ],
  },
  plugins: [react(), crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        backup: resolve(__dirname, 'src/backup.html'),
        'backup-page': resolve(__dirname, 'src/backup-page.html'),
      },
    },
  },
});
