// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// tokens.ts is documented as "the same values as tokens.css, kept in sync by hand" — nothing
// enforced that, so a value changed in one and not the other would only show up as a visual
// mismatch between a CSS consumer and a JS consumer (e.g. an Ionic theme mapping). This pins it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokens } from '../tokens.js';

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, '../tokens.css'), 'utf8');
const fontsCss = readFileSync(resolve(here, '../fonts.css'), 'utf8');

/** camelCase key → the custom-property name: greenNNN → --green-NNN, muted2 → --muted-2,
 * text2xl → --text-2xl, fontWeightLight → --font-weight-light. */
function cssName(key: string): string {
  return (
    '--' +
    key
      .replace(/([A-Z])/g, '-$1')
      .replace(/([a-z])(\d)/g, '$1-$2')
      .toLowerCase()
  );
}

function cssValue(name: string): string | undefined {
  const m = new RegExp(`${name}:\\s*([^;]+);`).exec(css);
  return m?.[1]?.trim();
}

describe('tokens.ts mirrors tokens.css', () => {
  for (const [key, value] of Object.entries(tokens)) {
    it(`${key} (${cssName(key)})`, () => {
      expect(cssValue(cssName(key))).toBe(value);
    });
  }
});

describe('fonts', () => {
  it('tokens.css pulls in the self-hosted font faces', () => {
    expect(css).toMatch(/@import\s+'\.\/fonts\.css'/);
  });

  it('bundles exactly Roboto Light/Regular/Medium (latin + latin-ext), nothing external', () => {
    for (const weight of [300, 400, 500]) {
      expect(fontsCss).toContain(`@fontsource/roboto/latin-${weight}.css`);
      expect(fontsCss).toContain(`@fontsource/roboto/latin-ext-${weight}.css`);
    }
    expect(fontsCss).not.toMatch(/https?:\/\//);
  });

  it('--font-sans leads with Roboto and keeps a system fallback', () => {
    expect(tokens.fontSans.startsWith("'Roboto'")).toBe(true);
    expect(tokens.fontSans).toMatch(/sans-serif$/);
  });
});
