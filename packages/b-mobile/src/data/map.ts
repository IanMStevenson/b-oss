// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-04's marker fetch. Not shaped like entries.ts's Page<EntryIndex> feeds: the map needs each
// entry's coordinates (EntryIndex doesn't carry them — b-view's view-model type is source-
// agnostic and has no map concept) and has no infinite-scroll pagination of its own — §13:
// "marker volume is bounded by what entries/search returns per bounding-box query, so no
// clustering is specified for v1", which reads as one page per bounds change, not a paged list.

import { getClient } from './client.js';

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
}

// One page's worth of markers per query, generous enough for a typical viewport without
// pagination — consistent with §13's "no clustering for v1" stance.
const MAX_MARKERS = 100;

export async function fetchEntriesInBounds(bounds: MapBounds): Promise<MapEntry[]> {
  const client = await getClient();
  const res = await client.searchEntries({
    location_type: 'bounding_box',
    min_lat: bounds.minLat,
    max_lat: bounds.maxLat,
    min_lon: bounds.minLon,
    max_lon: bounds.maxLon,
    pageSize: MAX_MARKERS,
  });
  const markers: MapEntry[] = [];
  for (const entry of res.entries) {
    if (!entry.location) continue;
    markers.push({
      entry_id: entry.entry_id_str,
      title: entry.title,
      username: entry.username,
      lat: entry.location.lat,
      lon: entry.location.lon,
    });
  }
  return markers;
}
