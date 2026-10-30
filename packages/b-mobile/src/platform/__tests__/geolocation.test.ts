// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Where the platform has no OS location (desktop), getCurrentPosition refuses up front, like a
// refused permission, without touching the plugin (b-oss#636). Elsewhere it is unchanged.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const plugin = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
  getCurrentPosition: vi.fn(),
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: plugin }));

const caps = vi.hoisted((): { location: 'os' | 'pick-only' } => ({ location: 'os' }));
vi.mock('../capabilities.js', () => ({ capabilities: () => ({ location: caps.location }) }));

import { getCurrentPosition } from '../geolocation.js';

beforeEach(() => {
  vi.resetAllMocks();
  caps.location = 'os';
});

describe('getCurrentPosition', () => {
  it('rejects without calling the plugin when the platform has no OS location', async () => {
    caps.location = 'pick-only';
    await expect(getCurrentPosition()).rejects.toThrow(/not available/);
    expect(plugin.checkPermissions).not.toHaveBeenCalled();
    expect(plugin.getCurrentPosition).not.toHaveBeenCalled();
  });

  it('returns coordinates when permission is held', async () => {
    plugin.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    plugin.getCurrentPosition.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    await expect(getCurrentPosition()).resolves.toEqual({ lat: 1, lon: 2 });
  });

  it('rejects when permission is refused, and resolves null when no fix can be had', async () => {
    plugin.checkPermissions.mockResolvedValue({ location: 'denied', coarseLocation: 'denied' });
    await expect(getCurrentPosition()).rejects.toThrow(/refused/);
    plugin.checkPermissions.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
    plugin.getCurrentPosition.mockRejectedValue(new Error('timeout'));
    await expect(getCurrentPosition()).resolves.toBeNull();
  });

  it('rejects (rather than throwing something unexpected) when the plugin cannot even check', async () => {
    plugin.checkPermissions.mockRejectedValue(new Error('Not implemented on web.'));
    await expect(getCurrentPosition()).rejects.toThrow();
  });
});
