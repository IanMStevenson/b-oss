// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#669: the API rejects longitudes outside [-180, 180] (form.min_lon_invalid), and a wide
// viewport zoomed out reports them. Pins the normaliser, including the numbers from the failure.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchEntriesInBounds, normaliseBounds } from '../map.js';

const client = { searchEntries: vi.fn() };

vi.mock('../client.js', () => ({
  withRateLimitFallback: (fn: (c: typeof client) => Promise<unknown>) => fn(client),
}));

const b = (minLon: number, maxLon: number, minLat = -10, maxLat = 10) => ({
  minLat,
  maxLat,
  minLon,
  maxLon,
});

describe('normaliseBounds', () => {
  it('leaves in-range bounds exactly as they were (handheld behaviour)', () => {
    const x = b(-3.2, 4.8, 50.1, 58.6);
    expect(normaliseBounds(x)).toEqual([x]);
    expect(normaliseBounds(b(-180, 180))).toEqual([b(-180, 180)]);
  });

  it('queries the whole world when the span is 360 or more (west -251, east 160)', () => {
    expect(normaliseBounds(b(-251, 160))).toEqual([b(-180, 180)]);
    expect(normaliseBounds(b(-200, 160))).toEqual([b(-180, 180)]);
  });

  it('wraps a west edge below -180 into range', () => {
    expect(normaliseBounds(b(-190, -170))).toEqual([b(170, 180), b(-180, -170)]);
  });

  it('wraps an east edge above 180 and splits at the antimeridian', () => {
    expect(normaliseBounds(b(170, 190))).toEqual([b(170, 180), b(-180, -170)]);
  });

  it('wraps a view lying entirely beyond 180 into one range', () => {
    expect(normaliseBounds(b(190, 200))).toEqual([b(-170, -160)]);
  });

  it('clamps latitude', () => {
    expect(normaliseBounds(b(0, 10, -95, 91))).toEqual([b(0, 10, -90, 90)]);
  });
});

describe('fetchEntriesInBounds', () => {
  beforeEach(() => client.searchEntries.mockReset());

  it('never sends a longitude outside [-180, 180]', async () => {
    client.searchEntries.mockResolvedValue({ entries: [] });
    await fetchEntriesInBounds(b(-251, 160));
    await fetchEntriesInBounds(b(170, 190));
    for (const [arg] of client.searchEntries.mock.calls as [
      { min_lon: number; max_lon: number },
    ][]) {
      expect(arg.min_lon).toBeGreaterThanOrEqual(-180);
      expect(arg.max_lon).toBeLessThanOrEqual(180);
    }
    expect(client.searchEntries).toHaveBeenCalledTimes(3);
  });

  it('merges the two halves of an antimeridian view without duplicates', async () => {
    const e = (id: string) => ({
      entry_id_str: id,
      title: id,
      username: 'u',
      thumbnail_url: '',
      location: { lat: 1, lon: 179 },
    });
    client.searchEntries
      .mockResolvedValueOnce({ entries: [e('a'), e('b')] })
      .mockResolvedValueOnce({ entries: [e('b'), e('c')] });
    const out = await fetchEntriesInBounds(b(170, 190));
    expect(out.map((m) => m.entry_id)).toEqual(['a', 'b', 'c']);
  });
});
