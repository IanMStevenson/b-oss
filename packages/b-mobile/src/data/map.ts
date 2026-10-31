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

/** The widest longitude span sent in one request (b-oss#697). A phone-sized viewport at the default
 * zoom spans about 140 degrees and is sent as it always was; a wide window spans 300 or more. Hypothesis,
 * not confirmed against the live API: a request that large returns no pins when the map is first opened,
 * although the same area zoomed in does. Wider ranges are cut into strips of at most this span and the
 * results merged; if a build shows pins still missing, the cause is elsewhere and this can go. */
export const MAX_REQUEST_LON_SPAN = 180;

/** Cuts any range wider than MAX_REQUEST_LON_SPAN into equal strips; narrower ranges are untouched. */
export function splitWideRanges(ranges: MapBounds[]): MapBounds[] {
  return ranges.flatMap((r) => {
    const span = r.maxLon - r.minLon;
    if (span <= MAX_REQUEST_LON_SPAN) return [r];
    const parts = Math.ceil(span / MAX_REQUEST_LON_SPAN);
    const step = span / parts;
    return Array.from({ length: parts }, (_, i) => ({
      ...r,
      minLon: i === 0 ? r.minLon : r.minLon + step * i,
      maxLon: i === parts - 1 ? r.maxLon : r.minLon + step * (i + 1),
    }));
  });
}

/** Web Mercator's latitude limit: a pin beyond it is drawn on the map's top or bottom edge, not at
 * its real position (b-oss#697), and a non-finite value cannot be drawn at all. */
const MAX_MERCATOR_LAT = 85.0511;
function isPlottable(lat: number, lon: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    Math.abs(lat) <= MAX_MERCATOR_LAT &&
    Math.abs(lon) <= 180
  );
}

// One page's worth of markers per query, generous enough for a typical viewport without
// pagination — consistent with §13's "no clustering for v1" stance.
const MAX_MARKERS = 100;

// Public browsing, same as entries.ts's Recent/Popular/Nearby/Tag/Search — falls back to the
// anonymous token if the active account's own is rate-limited (client.ts's
// withRateLimitFallback doc comment has the full reasoning).
export async function fetchEntriesInBounds(bounds: MapBounds): Promise<MapEntry[]> {
  const ranges = splitWideRanges(normaliseBounds(bounds));
  return withRateLimitFallback(async (client) => {
    const markers: MapEntry[] = [];
    const seen = new Set<string>();
    const unplottable: string[] = [];
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
        if (!isPlottable(entry.location.lat, entry.location.lon)) {
          unplottable.push(`${entry.entry_id_str}@${entry.location.lat},${entry.location.lon}`);
          continue;
        }
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
    if (unplottable.length > 0) {
      console.warn(
        `[map] ${unplottable.length} of the entries returned have coordinates that cannot be drawn: ${unplottable.slice(0, 5).join(' ')}`,
      );
    }
    return markers;
  });
}
