// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A font-weight with no bundled face makes the browser synthesise faux bold (or pick the nearest
// face), which renders smeared at 100% on low-density Windows displays (b-oss#676). This scans
// the source of every package that renders in b-mobile for the weights it uses and checks each
// has a real Roboto face imported by b-visual's fonts.css.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkgs = resolve(here, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules' || name === 'dist') continue;
      walk(p, out);
    } else if (/\.(css|tsx?)$/.test(name) && !/\.(test|generated)\./.test(name)) out.push(p);
  }
  return out;
}

const bundled = new Set(
  [
    ...readFileSync(resolve(pkgs, 'b-visual/src/fonts.css'), 'utf8').matchAll(
      /@fontsource\/roboto\/latin-(\d+)\.css/g,
    ),
  ].map((m) => Number(m[1])),
);

function used(): Map<number, string[]> {
  const found = new Map<number, string[]>();
  const add = (w: number, file: string) => found.set(w, [...(found.get(w) ?? []), file]);
  for (const pkg of ['b-mobile', 'b-view', 'b-visual']) {
    for (const file of walk(resolve(pkgs, pkg, 'src'))) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(
        /font-?[wW]eight(?:-\w+)?['"]?\s*[:=]\s*['"]?(\d{3}|bold|normal)\b/g,
      )) {
        const v = m[1];
        add(v === 'bold' ? 700 : v === 'normal' ? 400 : Number(v), file.slice(pkgs.length + 1));
      }
      // Conditional weights, e.g. fontWeight: active ? 600 : undefined
      for (const m of text.matchAll(/fontWeight:[^,}\n]*\?\s*(\d{3})\s*:/g)) {
        add(Number(m[1]), file.slice(pkgs.length + 1));
      }
    }
  }
  return found;
}

describe('font weights', () => {
  it('every font-weight used in the app has a bundled Roboto face', () => {
    const missing = [...used()].filter(([w]) => !bundled.has(w));
    expect(missing.map(([w, f]) => `${w}: ${[...new Set(f)].join(', ')}`)).toEqual([]);
  });

  it('the scan finds the weights it should (guards the scan itself)', () => {
    const w = [...used().keys()];
    expect(w).toEqual(expect.arrayContaining([600, 700]));
  });
});
