// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Handheld rendering must not change (b-oss#676, epic b-oss#633): every rule in crisp-text.css has to
// be scoped to a fine pointer, so a phone or a touch tablet never matches it, and the file only
// ever resets Ionic's layer-promoting hints. The e2e (b-mobile-pc) measures the actual text.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const css = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../crisp-text.css'),
  'utf8',
).replace(/\/\*[\s\S]*?\*\//g, '');

describe('crisp-text.css', () => {
  it("every selector starts with :root[data-pointer='fine']", () => {
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].flatMap((m) => m[1].split(','));
    expect(selectors.length).toBeGreaterThan(0);
    for (const selector of selectors) {
      expect(selector.trim().startsWith(":root[data-pointer='fine'] ")).toBe(true);
    }
  });

  it('has no at-rules and only declares transform: none or will-change: auto', () => {
    expect(css).not.toContain('@');
    const declarations = [...css.matchAll(/\{([^{}]*)\}/g)].flatMap((m) =>
      m[1]
        .split(';')
        .map((d) => d.trim().replace(/\s+/g, ' '))
        .filter(Boolean),
    );
    expect(declarations.length).toBeGreaterThan(0);
    for (const d of declarations) expect(['transform: none', 'will-change: auto']).toContain(d);
  });
});
