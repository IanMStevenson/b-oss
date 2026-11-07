// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Handheld layouts must not move (b-oss#671, epic b-oss#633): every rule in wide.css has to sit in the
// "window at least 900px wide" media query and be scoped to a fine pointer, so a phone, a touch tablet
// or a narrow window never matches it. The before/after screenshots check the rendering; this pins
// the structure so a later edit cannot add an ungated rule.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../wide.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

describe('wide.css', () => {
  it('is one media query, (min-width: 900px), and nothing outside it', () => {
    const outside = css.replace(/@media \(min-width: 900px\)\s*\{[\s\S]*\}\s*$/, '').trim();
    expect(outside).toBe('');
    expect(css.match(/@media/g)).toHaveLength(1);
  });

  it("every selector starts with :root[data-pointer='fine']", () => {
    const inner = css.slice(css.indexOf('{') + 1, css.lastIndexOf('}'));
    const selectors = [...inner.matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(','));
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector.trim().startsWith(":root[data-pointer='fine'] ")).toBe(true);
    }
  });
});
