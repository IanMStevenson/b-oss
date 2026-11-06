// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
//
// Regenerates the Microsoft Store (MSIX) logo PNGs in build/appx/ from build/icon.png. electron-builder
// falls back to its own sample (Electron) images when buildResources/appx/ lacks these four files.
// Run: node packages/b-mobile-pc/scripts/make-appx-assets.mjs   (needs `sharp`, already in node_modules)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const pkg = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(pkg, 'build/icon.png');
const out = path.join(pkg, 'build/appx');
mkdirSync(out, { recursive: true });

const square = (size) => sharp(src).resize(size, size).png();
await square(50).toFile(path.join(out, 'StoreLogo.png'));
await square(44).toFile(path.join(out, 'Square44x44Logo.png'));
await square(150).toFile(path.join(out, 'Square150x150Logo.png'));

// Wide tile: the icon centred on the icon's own corner colour.
const { data } = await sharp(src)
  .extract({ left: 2, top: 2, width: 1, height: 1 })
  .raw()
  .toBuffer({ resolveWithObject: true });
const background = { r: data[0], g: data[1], b: data[2], alpha: 1 };
await sharp({ create: { width: 310, height: 150, channels: 4, background } })
  .composite([{ input: await square(150).toBuffer(), gravity: 'centre' }])
  .png()
  .toFile(path.join(out, 'Wide310x150Logo.png'));
console.log('wrote', out);
