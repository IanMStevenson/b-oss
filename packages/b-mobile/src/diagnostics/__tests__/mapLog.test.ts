// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#697: the map's diagnostic lines (format, cap, redaction, desktop only).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const logError = vi.fn();
let desktop = true;
vi.mock('../../platform/diagnostics.js', () => ({
  hasErrorDiagnostics: () => desktop,
  logError: (info: unknown) => logError(info),
}));

import {
  formatFetchLine,
  formatLoadLine,
  formatSizeLine,
  logMapLine,
  resetMapLog,
  MAP_LOG_CAP,
  type MapSnapshot,
} from '../mapLog.js';

const snap = (over: Partial<MapSnapshot> = {}): MapSnapshot => ({
  container: { w: 1139, h: 1001 },
  map: { w: 1139, h: 1001 },
  zoom: 2,
  center: { lat: 20, lng: 0 },
  bounds: { minLat: -78.06198918, maxLat: 84.12497319, minLon: -164.53125, maxLon: 164.53125 },
  invalidated: 1,
  ...over,
});

describe('map diagnostic lines', () => {
  beforeEach(() => {
    logError.mockReset();
    desktop = true;
    resetMapLog();
  });

  it('formats a load line with both sizes, view, raw bounds and the invalidate count', () => {
    expect(formatLoadLine(snap())).toBe(
      'load container=1139x1001 mapSize=1139x1001 size=same zoom=2 center=20,0 ' +
        'rawBounds=[lat -78.062..84.125 lon -164.5313..164.5313] invalidateSizeCalls=1',
    );
  });

  it('says DIFFERENT when the map and its container disagree', () => {
    expect(formatSizeLine('observer', snap({ map: { w: 300, h: 150 } }))).toContain(
      'size-change(observer) container=1139x1001 mapSize=300x150 size=DIFFERENT',
    );
  });

  it('formats a fetch line with the ranges actually sent, counts and the snapshot', () => {
    const line = formatFetchLine(
      {
        requestId: 3,
        ranges: [
          { minLat: -78, maxLat: 84, minLon: -180, maxLon: 0 },
          { minLat: -78, maxLat: 84, minLon: 0, maxLon: 180 },
        ],
        received: 100,
        entries: 100,
        undrawable: [],
        markers: 100,
        requestCount: 3,
      },
      snap(),
    );
    expect(line).toContain(
      'fetch #3 requests=2 sent=[lat -78..84 lon -180..0]+[lat -78..84 lon 0..180]',
    );
    expect(line).toContain(
      'received=100 entries=100 undrawable=0 markers=100 totalRequests=3 container=1139x1001',
    );
  });

  it('reports undrawable entries with their ids and coordinates', () => {
    const line = formatFetchLine(
      {
        requestId: 1,
        ranges: [{ minLat: 0, maxLat: 1, minLon: 0, maxLon: 1 }],
        received: 100,
        entries: 98,
        undrawable: ['7@90,0', '8@90,0'],
        markers: 98,
        requestCount: 1,
      },
      snap(),
    );
    expect(line).toContain('received=100 entries=98 undrawable=2[7@90,0 8@90,0] markers=98');
  });

  it('writes to the log with source "map", and stops at the cap', () => {
    for (let i = 0; i < MAP_LOG_CAP + 10; i++) logMapLine(`line ${i}`);
    expect(logError).toHaveBeenCalledTimes(MAP_LOG_CAP);
    expect(logError.mock.calls[0]?.[0]).toEqual({ source: 'map', message: 'line 0' });
    expect((logError.mock.calls[MAP_LOG_CAP - 1]?.[0] as { message: string }).message).toContain(
      'suppressed',
    );
  });

  it('does nothing off the desktop shell', () => {
    desktop = false;
    logMapLine('x');
    expect(logError).not.toHaveBeenCalled();
  });
});
