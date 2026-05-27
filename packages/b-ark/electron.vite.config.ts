// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig } from 'electron-vite';
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

export default defineConfig({
  main: {
    envDir,
    define: versionDefine,
    build: {
      outDir: 'dist/main',
      externalizeDeps: { exclude: ['electron-store'] },
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
});
