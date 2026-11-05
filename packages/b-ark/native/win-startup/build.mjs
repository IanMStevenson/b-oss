// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
//
// Builds the Windows start-at-sign-in add-on and copies it to dist/win-startup.node, where
// electron-builder.store.json packs it. Windows x64 only; run by the MSIX workflows (needs Rust).
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
execFileSync('cargo', ['build', '--release', '--locked'], { cwd: here, stdio: 'inherit' });
const dll = join(here, 'target', 'release', 'b_ark_win_startup.dll');
if (!existsSync(dll)) throw new Error(`Expected ${dll} after cargo build`);
mkdirSync(join(here, 'dist'), { recursive: true });
copyFileSync(dll, join(here, 'dist', 'win-startup.node'));
console.log('Built dist/win-startup.node');
