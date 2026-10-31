// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it } from 'vitest';
import { parseChromiumFlags, parseRenderVariants } from '../render-variants.js';

describe('render variants (b-oss#676)', () => {
  it('honours the variant switch in a packaged app, but not arbitrary Chromium flags', () => {
    expect([...parseRenderVariants('lcd-text').variants]).toEqual(['lcd-text']);
    expect(parseChromiumFlags('--disable-lcd-text', true)).toEqual([]);
  });

  it('parses known variants and reports unknown ones', () => {
    const r = parseRenderVariants('no-gpu, no-zoom-lock,bogus,');
    expect([...r.variants]).toEqual(['no-gpu', 'no-zoom-lock']);
    expect(r.unknown).toEqual(['bogus']);
  });

  it('does nothing when unset', () => {
    expect(parseRenderVariants(undefined).variants.size).toBe(0);
    expect(parseChromiumFlags(undefined, false)).toEqual([]);
  });

  it('splits Chromium flags into name and value', () => {
    expect(parseChromiumFlags('--a --b=c=d junk -x', false)).toEqual([
      ['a', undefined],
      ['b', 'c=d'],
    ]);
  });
});
