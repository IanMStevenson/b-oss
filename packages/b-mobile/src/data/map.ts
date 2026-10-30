// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-04's marker fetch. Not shaped like entries.ts's Page<EntryIndex> feeds: the map needs each
// entry's coordinates (EntryIndex doesn't carry them — b-view's view-model type is source-
// agnostic and has no map concept) and has no infinite-scroll pagination of its own — §13:
// "marker volume is bounded by what entries/search returns per bounding-box query, so no
// clustering is specified for v1", which reads as one page per bounds change, not a paged list.

import { withRateLimitFallback } from './client.js';

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

export interface MapEntry {
  entry_id: string;
  title: string;
  username: string;
  lat: number;
  lon: number;
  /** Empty string means no thumbnail (BlipEntryStub.thumbnail_url is never optional/null) —
   * callers treat that the same as absent. */
  thumbnailUrl: string;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function wrapLon(lon: number): number {
  // Into [-180, 180); +180 itself is kept as 180 by the caller where it is the east edge.
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

/**
 * The query ranges for a viewport's raw bounds (b-oss#669). The API rejects longitudes outside
 * [-180, 180] (`form.min_lon_invalid`), but a wide viewport zoomed far out shows more than one copy
 * of the world, so MapLibre reports a west edge below -180 or an east edge above 180. A span of 360
 * or more is the whole world; otherwise both edges are wrapped into range, and a view that crosses
 * the antimeridian (west greater than east once wrapped) becomes two ranges, one each side of it.
 * Latitude is clamped to [-90, 90]. In-range bounds come back unchanged, as a single range.
 */
export function normaliseBounds(b: MapBounds): MapBounds[] {
  const minLat = clamp(b.minLat, -90, 90);
  const maxLat = clamp(b.maxLat, -90, 90);
  if (b.maxLon - b.minLon >= 360) return [{ minLat, maxLat, minLon: -180, maxLon: 180 }];
  if (b.minLon >= -180 && b.maxLon <= 180) {
    return [{ minLat, maxLat, minLon: b.minLon, maxLon: b.maxLon }];
  }
  const west = wrapLon(b.minLon);
  const east = wrapLon(b.maxLon);
  if (west <= east) return [{ minLat, maxLat, minLon: west, maxLon: east }];
  return [
    { minLat, maxLat, minLon: west, maxLon: 180 },
    { minLat, maxLat, minLon: -180, maxLon: east },
  ];
}

// One page's worth of markers per query, generous enough for a typical viewport without
// pagination — consistent with §13's "no clustering for v1" stance.
const MAX_MARKERS = 100;

// Public browsing, same as entries.ts's Recent/Popular/Nearby/Tag/Search — falls back to the
// anonymous token if the active account's own is rate-limited (client.ts's
// withRateLimitFallback doc comment has the full reasoning).
export async function fetchEntriesInBounds(bounds: MapBounds): Promise<MapEntry[]> {
  const ranges = normaliseBounds(bounds);
  return withRateLimitFallback(async (client) => {
    const markers: MapEntry[] = [];
    const seen = new Set<string>();
    for (const range of ranges) {
      const res = await client.searchEntries({
        location_type: 'bounding_box',
        min_lat: range.minLat,
        max_lat: range.maxLat,
        min_lon: range.minLon,
        max_lon: range.maxLon,
        pageSize: MAX_MARKERS,
      });
      for (const entry of res.entries) {
        if (!entry.location || seen.has(entry.entry_id_str)) continue;
        seen.add(entry.entry_id_str);
        markers.push({
          entry_id: entry.entry_id_str,
          title: entry.title,
          username: entry.username,
          lat: entry.location.lat,
          lon: entry.location.lon,
          thumbnailUrl: entry.thumbnail_url,
        });
      }
    }
    return markers;
  });
}
