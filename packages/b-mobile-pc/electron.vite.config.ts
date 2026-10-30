// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig } from 'electron-vite';
import { resolve } from 'node:path';

// Main + preload only: the renderer is b-mobile's own web build, served by the main process
// (src/main/app-protocol.ts), so there is nothing to bundle for it here.
export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main',
      rollupOptions: { input: { index: resolve(__dirname, 'src/main/index.ts') } },
    },
  },
  preload: {
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
        // Electron loads preload scripts as CommonJS even with contextIsolation.
        output: { format: 'cjs', entryFileNames: '[name].js' },
      },
    },
  },
});
