// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Regenerates build/tray/ from b-mobile's own store icon: tray-icon.png (16 px) with @1.5x, @2x and
// @3x siblings (24/32/48 px), which Electron picks by display scale. PNG everywhere, including
// Windows: an .ico loaded as empty in Electron on Linux, so it was not shipped untested.
// Committed output; run with
//   node packages/b-mobile-pc/scripts/make-tray-icons.mjs
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '../../b-mobile/store/graphics/icon-512.png');
const out = join(here, '../build/tray');
mkdirSync(out, { recursive: true });

const variants = {
  'tray-icon.png': 16,
  'tray-icon@1.5x.png': 24,
  'tray-icon@2x.png': 32,
  'tray-icon@3x.png': 48,
};
for (const [name, size] of Object.entries(variants)) {
  const png = await sharp(src).resize(size, size, { kernel: 'lanczos3' }).png().toBuffer();
  writeFileSync(join(out, name), png);
}
