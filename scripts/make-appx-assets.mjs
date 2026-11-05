// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
//
// Regenerates the Microsoft Store (MSIX) logo PNGs from the b-ark app icon. electron-builder
// falls back to its own sample (Electron) images when assets/icons/appx/ (copied to packages/b-ark/resources/appx/ by scripts/copy-icons.mjs) lacks these
// four files. Run: node scripts/make-appx-assets.mjs   (needs `sharp`, already in node_modules)
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'assets/icons/icon-ico/256.png');
const out = path.join(root, 'assets/icons/appx');
mkdirSync(out, { recursive: true });

const square = (size) => sharp(src).resize(size, size).png();
await square(50).toFile(path.join(out, 'StoreLogo.png'));
await square(44).toFile(path.join(out, 'Square44x44Logo.png'));
await square(150).toFile(path.join(out, 'Square150x150Logo.png'));

// Wide tile: the icon centred on the icon's own background colour.
const { data } = await sharp(src)
  .extract({ left: 128, top: 4, width: 1, height: 1 })
  .raw()
  .toBuffer({ resolveWithObject: true });
const background = { r: data[0], g: data[1], b: data[2], alpha: 1 };
await sharp({ create: { width: 310, height: 150, channels: 4, background } })
  .composite([{ input: await square(150).toBuffer(), gravity: 'centre' }])
  .png()
  .toFile(path.join(out, 'Wide310x150Logo.png'));
console.log(
  'background',
  background,
  '#' + [data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, '0')).join(''),
);
