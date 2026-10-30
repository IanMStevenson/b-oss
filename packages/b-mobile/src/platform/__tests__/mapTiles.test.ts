// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Pure logic (§19 layer 1) — no Capacitor plugin involved, unlike every other platform/*.ts
// module, so this is the one platform file that gets a direct unit test rather than only being
// exercised through a mocked consumer.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { getTileLayerConfig } from '../mapTiles.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getTileLayerConfig', () => {
  it('returns null when no key is configured — drives SCR-04\'s "unavailable" state rather than a silently-failing map', () => {
    vi.stubEnv('VITE_GEOAPIFY_KEY', '');
    expect(getTileLayerConfig()).toBeNull();
  });

  it('builds a Geoapify raster URL template carrying the configured key, with the retina token', () => {
    vi.stubEnv('VITE_GEOAPIFY_KEY', 'test-key-123');
    const config = getTileLayerConfig();
    expect(config?.urlTemplate).toMatch(
      /^https:\/\/maps\.geoapify\.com\/v1\/tile\/[a-z-]+\/\{z\}\/\{x\}\/\{y\}\{r\}\.png\?apiKey=test-key-123$/,
    );
    expect(config?.maxZoom).toBe(20);
  });

  it("carries the attribution Geoapify's Free plan requires", () => {
    vi.stubEnv('VITE_GEOAPIFY_KEY', 'k');
    const attribution = getTileLayerConfig()?.attribution ?? '';
    expect(attribution).toContain('Powered by <a href="https://www.geoapify.com/">Geoapify</a>');
    expect(attribution).toContain('https://www.openstreetmap.org/copyright');
    expect(attribution).toContain('https://openmaptiles.org/');
  });
});
