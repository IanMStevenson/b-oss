// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// b-oss#669 on the Leaflet map (b-oss#655): a wide window zoomed out shows more than one copy of the
// world, and Leaflet's own getBounds()/getWest()/getEast() report longitudes beyond ±180 (it does not
// wrap them), which the API rejects (`form.min_lon_invalid`). SCR-04 passes those raw values to
// fetchEntriesInBounds, so this pins both halves: what Leaflet really reports, and that
// normaliseBounds turns it into ranges the API accepts.

import { describe, it, expect, afterEach } from 'vitest';
import * as L from 'leaflet';
import { normaliseBounds } from '../map.js';
import type { MapBounds } from '../map.js';

let map: L.Map | null = null;
afterEach(() => {
  map?.remove();
  map = null;
});

/** A Leaflet map in a container of the given size (jsdom has no layout, so the size is stubbed). */
function mapOfSize(width: number, height: number, center: [number, number], zoom: number): L.Map {
  const el = document.createElement('div');
  Object.defineProperty(el, 'clientWidth', { value: width });
  Object.defineProperty(el, 'clientHeight', { value: height });
  document.body.appendChild(el);
  map = L.map(el, { center, zoom, zoomControl: false, attributionControl: false });
  return map;
}

function rawBounds(m: L.Map): MapBounds {
  const b = m.getBounds();
  return { minLat: b.getSouth(), maxLat: b.getNorth(), minLon: b.getWest(), maxLon: b.getEast() };
}

describe('Leaflet bounds on a wide window at the default zoom', () => {
  it('reports longitudes beyond ±180 (so the bounds must be normalised)', () => {
    // 2400 px at zoom 2 (256 px tiles, 1024 px for the world) shows about 2.3 copies of the world.
    const raw = rawBounds(mapOfSize(2400, 900, [20, 0], 2));
    expect(raw.minLon).toBeLessThan(-180);
    expect(raw.maxLon).toBeGreaterThan(180);
  });

  it('normalises to the whole world: nothing outside [-180, 180]', () => {
    const ranges = normaliseBounds(rawBounds(mapOfSize(2400, 900, [20, 0], 2)));
    expect(ranges).toEqual([expect.objectContaining({ minLon: -180, maxLon: 180 })]);
    for (const r of ranges) {
      expect(Math.abs(r.minLon)).toBeLessThanOrEqual(180);
      expect(Math.abs(r.maxLon)).toBeLessThanOrEqual(180);
      expect(Math.abs(r.minLat)).toBeLessThanOrEqual(90);
      expect(Math.abs(r.maxLat)).toBeLessThanOrEqual(90);
    }
  });

  it('splits a view that crosses the antimeridian into two valid ranges', () => {
    // 800 px at zoom 2 spans 281 degrees; centred on 170 it runs from about 29 to about 310.
    const ranges = normaliseBounds(rawBounds(mapOfSize(800, 600, [0, 170], 2)));
    expect(ranges.length).toBe(2);
    for (const r of ranges) {
      expect(r.minLon).toBeGreaterThanOrEqual(-180);
      expect(r.maxLon).toBeLessThanOrEqual(180);
      expect(r.minLon).toBeLessThanOrEqual(r.maxLon);
    }
  });

  it('leaves a handheld-sized view unchanged', () => {
    const raw = rawBounds(mapOfSize(400, 700, [51.5, -0.1], 10));
    expect(normaliseBounds(raw)).toEqual([raw]);
  });
});
