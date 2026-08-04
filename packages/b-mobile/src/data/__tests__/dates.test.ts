// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — dates.ts's own comment flags local-vs-UTC formatting as "the one place that has
// to get local-vs-UTC right," and gmtOffsetMinutes' sign negation (JS's getTimezoneOffset() is
// minutes *west*, Blipfoto's gmt_offset is minutes *east*) is exactly the kind of thing easy to
// get backwards silently.

import { describe, it, expect } from 'vitest';
import { formatLocalDate, gmtOffsetMinutes, todayDate } from '../dates.js';

describe('formatLocalDate', () => {
  it('formats using local getters, not toISOString (which would shift across a UTC day boundary)', () => {
    // 23:30 local time on 2026-03-01 — toISOString() on a positive-UTC-offset system would already
    // have rolled over to 2026-03-02, which is exactly the bug this function exists to avoid.
    const date = new Date(2026, 2, 1, 23, 30);
    expect(formatLocalDate(date)).toBe('2026-03-01');
  });

  it('zero-pads single-digit months and days', () => {
    expect(formatLocalDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('todayDate() matches formatLocalDate(new Date()) for "now"', () => {
    expect(todayDate()).toBe(formatLocalDate(new Date()));
  });
});

describe('gmtOffsetMinutes', () => {
  it('negates Date.getTimezoneOffset() — JS reports minutes west, Blipfoto wants minutes east', () => {
    const date = new Date();
    expect(gmtOffsetMinutes(date)).toBe(-date.getTimezoneOffset());
  });

  it('defaults to the current time when no date is given', () => {
    expect(typeof gmtOffsetMinutes()).toBe('number');
  });
});
