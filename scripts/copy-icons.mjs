// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Copies the master icon set (assets/icons/) into each consumer package.
// The copied versions are gitignored — assets/icons/ is the single source of truth.
// Run automatically by each package's build/dev scripts (and the root prebuild).

import { cpSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const master = resolve(repoRoot, 'assets/icons');

if (!existsSync(master)) {
  console.error(`[copy-icons] master icon source not found: ${master}`);
  process.exit(1);
}

// 1) b-ark (Electron) — full icon set into resources/ (electron-builder buildResources
//    + window/tray icons read from here).
cpSync(master, resolve(repoRoot, 'packages/b-ark/resources'), { recursive: true });

// 2) b-ark-chrome — extension + toolbar icons.
const chromeIcons = resolve(repoRoot, 'packages/b-ark-chrome/icons');
mkdirSync(chromeIcons, { recursive: true });
for (const size of ['16', '32', '48', '128']) {
  copyFileSync(resolve(master, `icon-ico/${size}.png`), resolve(chromeIcons, `${size}.png`));
}

// 3) b-view — favicon (referenced by src/spa/index.html).
const bviewSpa = resolve(repoRoot, 'packages/b-view/src/spa');
mkdirSync(bviewSpa, { recursive: true });
copyFileSync(resolve(master, 'icon-ico/128.png'), resolve(bviewSpa, 'favicon.png'));

console.log('[copy-icons] master assets/icons → b-ark, b-ark-chrome, b-view');
