// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { formatStripDate, ordinalSuffix } from '../entryDates.js';

describe('ordinalSuffix', () => {
  it.each([
    [1, 'st'],
    [2, 'nd'],
    [3, 'rd'],
    [4, 'th'],
    [11, 'th'],
    [12, 'th'],
    [13, 'th'],
    [21, 'st'],
    [22, 'nd'],
    [23, 'rd'],
    [30, 'th'],
    [31, 'st'],
  ])('%i → %s', (day, suffix) => {
    expect(ordinalSuffix(day)).toBe(suffix);
  });
});

describe('formatStripDate', () => {
  it('formats the date tile as ordinal day over "Mon, yy" (Blipfoto style)', () => {
    expect(formatStripDate('2026-10-02')).toEqual({ day: '2nd', monthYear: 'Oct, 26' });
    expect(formatStripDate('2009-01-11')).toEqual({ day: '11th', monthYear: 'Jan, 09' });
  });

  it('does not shift with the local timezone (parsed from the string, not via Date)', () => {
    expect(formatStripDate('2026-03-01')).toEqual({ day: '1st', monthYear: 'Mar, 26' });
  });

  it('returns null for anything that is not a well-formed date', () => {
    expect(formatStripDate('')).toBeNull();
    expect(formatStripDate('2026-13-01')).toBeNull();
    expect(formatStripDate('2026-00-10')).toBeNull();
    expect(formatStripDate('2 Oct 2026')).toBeNull();
  });
});
