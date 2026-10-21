// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { isBackSwallowedAt, BROWSE_BACK_PRIORITY } from '../hardwareBack.js';

describe('isBackSwallowedAt', () => {
  it('swallows Back on Browse only', () => {
    expect(isBackSwallowedAt('/browse')).toBe(true);
    expect(isBackSwallowedAt('/browse/')).toBe(true);
    expect(isBackSwallowedAt('/entry/123')).toBe(false);
    expect(isBackSwallowedAt('/search')).toBe(false);
    expect(isBackSwallowedAt('/settings')).toBe(false);
  });

  it('ranks above the router (0) and below the menu (99)', () => {
    expect(BROWSE_BACK_PRIORITY).toBeGreaterThan(0);
    expect(BROWSE_BACK_PRIORITY).toBeLessThan(99);
  });
});
