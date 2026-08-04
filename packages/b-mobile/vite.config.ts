// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

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

export default defineConfig({
  envDir: resolve(__dirname, '../..'),
  define: {
    __APP_VERSION__: JSON.stringify(readGeneratedVersion()),
    __RELEASE__: JSON.stringify(readGeneratedRelease()),
  },
  resolve: {
    dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
    alias: [
      // @b-oss/b-api's package.json "main" points at compiled dist/, which a --workspace
      // build never recompiles automatically — bundling that would ship stale code.
      // @b-oss/b-view and @b-oss/b-visual already point "main" straight at src, no alias needed.
      { find: /^@b-oss\/b-api$/, replacement: resolve(__dirname, '../b-api/src/index.ts') },
    ],
  },
  server: {
    // Blipfoto serves no CORS headers, so a browser fetch() to api.blipfoto.com is blocked in
    // `vite dev`. This proxy is dev-only — on device everything goes through native HTTP
    // (platform/http.ts, §7) instead, and this has no production counterpart. The client
    // factory (src/data/client.ts, Phase 2) is what actually points at `/api/blipfoto` when
    // running in a desktop browser.
    proxy: {
      '/api/blipfoto': {
        target: 'https://api.blipfoto.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/blipfoto/, ''),
      },
    },
  },
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    setupFiles: [resolve(__dirname, 'src/test-setup.ts')],
  },
});
