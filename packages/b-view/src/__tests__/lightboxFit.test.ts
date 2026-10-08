// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { fitContain } from '../lightboxFit.js';
import { formatLongDate } from '../entryDates.js';

describe('fitContain', () => {
  const phone = { width: 412, height: 860 };

  it('fits a portrait photo to the width of a portrait screen, keeping its ratio', () => {
    const r = fitContain({ width: 800, height: 1200 }, phone);
    expect(r.width).toBeCloseTo(412);
    expect(r.height).toBeCloseTo(618);
  });

  it('fits a landscape photo to the width of a portrait screen', () => {
    const r = fitContain({ width: 1200, height: 800 }, phone);
    expect(r.width).toBeCloseTo(412);
    expect(r.height).toBeCloseTo(274.67, 1);
  });

  it('fits a portrait photo to the height of a landscape screen (not a narrow band)', () => {
    const r = fitContain({ width: 800, height: 1200 }, { width: 1280, height: 720 });
    expect(r.height).toBeCloseTo(720);
    expect(r.width).toBeCloseTo(480);
  });

  it('fits a landscape photo to the height of a short, wide screen', () => {
    const r = fitContain({ width: 1200, height: 800 }, { width: 1280, height: 720 });
    expect(r.height).toBeCloseTo(720);
    expect(r.width).toBeCloseTo(1080);
  });

  it('scales a small image up to fill the limiting dimension', () => {
    const r = fitContain({ width: 100, height: 200 }, phone);
    expect(r.width).toBeCloseTo(412);
    expect(r.height).toBeCloseTo(824);
  });

  it('gives 0×0 until both sizes are known', () => {
    expect(fitContain({ width: 0, height: 0 }, phone)).toEqual({ width: 0, height: 0 });
    expect(fitContain({ width: 10, height: 10 }, { width: 0, height: 0 })).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe('formatLongDate', () => {
  it('formats an ISO date for the lightbox header', () => {
    expect(formatLongDate('2026-10-02')).toBe('2nd Oct 2026');
  });
  it('returns malformed input unchanged', () => {
    expect(formatLongDate('nope')).toBe('nope');
  });
});
