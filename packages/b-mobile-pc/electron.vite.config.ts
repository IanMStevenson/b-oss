// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { defineConfig } from 'electron-vite';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { appVersion, type GeneratedVersion } from '../b-mobile/src/appVersion.js';

// The shell's build identifier (b-oss#696): exactly what b-mobile's vite.config.ts computes for the
// web build's __APP_VERSION__ (same function, same version.generated.json), so a shell and a web build
// made together carry equal strings and the web app can tell when they are not.
function shellBuild(): string {
  const stampPath = resolve(__dirname, '../../version.generated.json');
  const stamp = existsSync(stampPath)
    ? (JSON.parse(readFileSync(stampPath, 'utf8')) as GeneratedVersion)
    : null;
  const webPkg = JSON.parse(
    readFileSync(resolve(__dirname, '../b-mobile/package.json'), 'utf8'),
  ) as {
    version: string;
  };
  return appVersion(webPkg.version, stamp);
}

// Main + preload only: the renderer is b-mobile's own web build, served by the main process
// (src/main/app-protocol.ts), so there is nothing to bundle for it here.
// Workspace packages are bundled from source: their package `main` points at compiled dist/, which
// a fresh checkout has not built (same alias idea as packages/b-mobile/vite.config.ts).
const workspaceSource = [
  { find: /^@b-oss\/b-api$/, replacement: resolve(__dirname, '../b-api/src/index.ts') },
  {
    find: /^@b-oss\/b-notify-core$/,
    replacement: resolve(__dirname, '../b-notify-core/src/index.ts'),
  },
];

export default defineConfig({
  main: {
    resolve: { alias: workspaceSource },
    define: { __SHELL_BUILD__: JSON.stringify(shellBuild()) },
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
