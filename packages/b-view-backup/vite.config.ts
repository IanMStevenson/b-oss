// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function readGeneratedVersion(): string {
  const path = resolve(__dirname, '../../version.generated.json');
  if (!existsSync(path)) return '0.0.0-dev';
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { version: string };
  return parsed.version;
}

const appVersion = readGeneratedVersion();

export default defineConfig(({ mode }) => ({
  define: {
    ...(mode === 'development' ? { 'process.env.NODE_ENV': '"development"' } : {}),
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    {
      name: 'file-protocol-compat',
      transformIndexHtml(html: string) {
        return html
          .replace(/<script\s+type="module"/g, '<script defer')
          .replace(/\s+crossorigin(?:="[^"]*")?/g, '');
      },
    },
  ],
  root: 'src/spa',
  base: './',
  resolve: {
    dedupe: ['react', 'react-dom'],
    // @b-oss/backup-engine's package.json "main" points at compiled dist/index.js, which a
    // `--workspace` build never recompiles — bundling dist would ship stale backup-engine
    // code. See b-ark-chrome/vite.config.ts for the same fix and full rationale.
    alias: [
      {
        find: /^@b-oss\/backup-engine$/,
        replacement: resolve(__dirname, '../backup-engine/src/index.ts'),
      },
    ],
  },
  build: {
    outDir: '../../dist-app',
    assetsDir: 'b-view',
    emptyOutDir: true,
    minify: mode !== 'development',
    target: 'es2015',
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
}));
