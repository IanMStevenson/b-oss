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

describe('density tokens', () => {
  /** The declarations inside a block whose selector is exactly `selector`. */
  function block(selector: string): Map<string, string> {
    const re = new RegExp(`${selector.replace(/[[\]'.]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'g');
    const found = new Map<string, string>();
    for (const m of css.matchAll(re)) {
      for (const d of m[1].matchAll(/(--[\w-]+):\s*([^;]+);/g)) found.set(d[1], d[2].trim());
    }
    return found;
  }
  const all = block(':root');
  const touch = new Map(
    [...all].filter(([k]) => /^--(control|segment|field|row|list-row|tile)-/.test(k)),
  );
  // The density tokens only: the maximum-width tokens (below) also have a fine-pointer block.
  const fine = new Map(
    [...block(":root[data-pointer='fine']")].filter(([k]) =>
      /^--(control|segment|field|row|list-row|tile)-/.test(k),
    ),
  );

  // The touch values are what the app shipped with before density existed; touch devices must not
  // move (b-oss#637).
  it('the touch values are the original sizes', () => {
    expect(Object.fromEntries(touch)).toEqual({
      '--control-height': '40px',
      '--control-padding-x': '20px',
      '--control-padding-x-small': '16px',
      '--control-font-size': '0.9375rem',
      '--control-font-size-small': '0.875rem',
      '--segment-button-height': '34px',
      '--field-height': '48px',
      '--field-padding': '12px',
      '--row-height': '56px',
      '--list-row-height': '64px',
      '--tile-height': '128px',
    });
  });

  it('every touch token has a compact value, and compact is never larger', () => {
    expect([...fine.keys()].sort()).toEqual([...touch.keys()].sort());
    for (const [name, compact] of fine) {
      const unit = /[a-z]+$/.exec(compact)?.[0];
      expect(unit).toBe(/[a-z]+$/.exec(touch.get(name) ?? '')?.[0]);
      expect(parseFloat(compact)).toBeLessThanOrEqual(parseFloat(touch.get(name) ?? '0'));
    }
  });
});

describe('maximum width tokens (b-oss#671)', () => {
  it('are unbounded by default, so touch devices and narrow windows keep full-width layouts', () => {
    expect(cssValue('--action-max-width')).toBe('none');
    expect(cssValue('--content-max-width')).toBe('none');
  });

  it('are capped only for a mouse on a wide window', () => {
    const gated =
      /@media \(min-width: 900px\)\s*\{\s*:root\[data-pointer='fine'\]\s*\{([^}]*)\}/.exec(css);
    expect(gated?.[1]).toMatch(/--action-max-width:\s*320px;/);
    expect(gated?.[1]).toMatch(/--content-max-width:\s*720px;/);
  });
});
