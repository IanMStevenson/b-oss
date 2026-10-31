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

const caps = vi.hoisted((): { location: 'os' | 'pick-only'; kind: string; outcome: string[] } => ({
  location: 'os',
  kind: 'android',
  outcome: [],
}));
vi.mock('../capabilities.js', () => ({
  locationControlAvailable: () => caps.location === 'os',
  recordDesktopLocationOutcome: (o: string) => caps.outcome.push(o),
}));
vi.mock('../platformKind.js', () => ({ platformKind: () => caps.kind }));
const logged = vi.hoisted(() => [] as { source: string; message: string }[]);
vi.mock('../diagnostics.js', () => ({
  logError: (info: { source: string; message: string }) => logged.push(info),
}));

import { getCurrentPosition, LocationUnavailableError } from '../geolocation.js';

beforeEach(() => {
  vi.resetAllMocks();
  caps.location = 'os';
  caps.kind = 'android';
  caps.outcome = [];
  logged.length = 0;
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

describe('desktop (b-oss#672)', () => {
  beforeEach(() => {
    caps.kind = 'desktop';
    caps.location = 'os'; // the control is available until a first attempt fails
  });

  it('skips the permission calls, logs the attempt without exact coordinates, records success', async () => {
    plugin.getCurrentPosition.mockResolvedValue({
      coords: { latitude: 51.5074, longitude: -0.1278, accuracy: 40 },
    });
    await expect(getCurrentPosition()).resolves.toEqual({ lat: 51.5074, lon: -0.1278 });
    expect(plugin.checkPermissions).not.toHaveBeenCalled();
    expect(caps.outcome).toEqual(['ok']);
    expect(logged).toHaveLength(1);
    expect(logged[0].source).toBe('geolocation');
    expect(logged[0].message).toContain('ok (coarse 51.5,-0.1');
    expect(logged[0].message).not.toContain('51.5074');
  });

  it('a failed first attempt logs code and message, records failure and throws the friendly error', async () => {
    plugin.getCurrentPosition.mockRejectedValue({ code: 2, message: 'Network location provider' });
    await expect(getCurrentPosition()).rejects.toBeInstanceOf(LocationUnavailableError);
    await expect(getCurrentPosition()).rejects.toThrow(/Windows location is off/);
    expect(caps.outcome).toEqual(['failed', 'failed']);
    expect(logged[0].message).toBe(
      'location attempt: failed code=2 message=Network location provider',
    );
  });
});
