// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { isSearchableTag } from '../tagSearch.js';

describe('isSearchableTag', () => {
  it('accepts letters, digits and underscore', () => {
    expect(isSearchableTag('Arthursseat')).toBe(true);
    expect(isSearchableTag('sky_2026')).toBe(true);
  });
  it('rejects spaces, hyphens, accents and empty', () => {
    expect(isSearchableTag('arthurs seat')).toBe(false);
    expect(isSearchableTag('arthurs-seat')).toBe(false);
    expect(isSearchableTag('café')).toBe(false);
    expect(isSearchableTag('')).toBe(false);
  });
});
