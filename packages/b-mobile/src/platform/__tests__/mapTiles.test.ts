// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Pure logic (§19 layer 1) — no Capacitor plugin involved, unlike every other platform/*.ts
// module, so this is the one platform file that gets a direct unit test rather than only being
// exercised through a mocked consumer.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { getMapStyleUrl } from '../mapTiles.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getMapStyleUrl', () => {
  it('returns null when no key is configured — drives SCR-04\'s "unavailable" state rather than a silently-failing map', () => {
    vi.stubEnv('VITE_MAP_TILES_KEY', '');
    expect(getMapStyleUrl()).toBeNull();
  });

  it('builds a MapTiler style URL carrying the configured key', () => {
    vi.stubEnv('VITE_MAP_TILES_KEY', 'test-key-123');
    const url = getMapStyleUrl();
    expect(url).toContain('api.maptiler.com');
    expect(url).toContain('key=test-key-123');
  });
});
