// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { appIconPath, trayIconPath } from '../tray-icon.js';

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const builder = JSON.parse(readFileSync(join(pkgDir, 'electron-builder.json'), 'utf8')) as {
  extraResources: { from: string; to: string }[];
};

describe('tray icon packaging (b-oss#640)', () => {
  it('the packaged path is delivered by extraResources, and the source file exists', () => {
    const packaged = trayIconPath({ packaged: true, resourcesPath: '/r', mainDir: '/x' });
    const rel = relative('/r', packaged).split('\\').join('/');
    const entry = builder.extraResources.find((e) => rel.startsWith(e.to));
    expect(entry, `no extraResources entry delivers ${rel}`).toBeDefined();
    const source = join(pkgDir, entry!.from, rel.slice(entry!.to.length));
    expect(existsSync(source), `${source} is missing`).toBe(true);
    expect(readFileSync(source).length).toBeGreaterThan(100);
    // Electron picks these by display scale; they travel in the same directory.
    for (const scale of ['@1.5x', '@2x', '@3x']) {
      expect(existsSync(source.replace('.png', `${scale}.png`))).toBe(true);
    }
  });

  it('the fallback app icon is packaged too, and exists', () => {
    const rel = relative('/r', appIconPath({ packaged: true, resourcesPath: '/r', mainDir: '/x' }))
      .split('\\')
      .join('/');
    const entry = builder.extraResources.find((e) => e.to === rel);
    expect(entry, `no extraResources entry delivers ${rel}`).toBeDefined();
    expect(existsSync(join(pkgDir, entry!.from))).toBe(true);
  });

  it('the dev path resolves to the same committed file', () => {
    const dev = trayIconPath({
      packaged: false,
      resourcesPath: '/r',
      mainDir: join(pkgDir, 'dist/main'),
    });
    expect(existsSync(dev)).toBe(true);
    const app = appIconPath({
      packaged: false,
      resourcesPath: '/r',
      mainDir: join(pkgDir, 'dist/main'),
    });
    expect(existsSync(app)).toBe(true);
  });
});
