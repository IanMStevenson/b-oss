// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Map diagnostics for the desktop shell's log (b-oss#697, through the b-oss#639 seam). One line per
// map load, per entries fetch and per size change: the container's size against the map's own idea of
// it, the view, the bounds actually requested, and what came back. Desktop only: logError does nothing
// elsewhere (and hasErrorDiagnostics gates the work), so handheld and web behave exactly as before.
// Coordinates and sizes only; nothing about the user. Capped per page load so a busy map cannot flood
// the log.

import { hasErrorDiagnostics, logError } from '../platform/diagnostics.js';
import type { MapBounds } from '../data/map.js';

export const MAP_LOG_SOURCE = 'map';
export const MAP_LOG_CAP = 60;

export interface MapSnapshot {
  /** The container element's clientWidth/clientHeight. */
  container: { w: number; h: number };
  /** map.getSize(): what Leaflet believes it is. */
  map: { w: number; h: number };
  zoom: number;
  center: { lat: number; lng: number };
  /** map.getBounds() as Leaflet reports it (not normalised). */
  bounds: MapBounds;
  /** invalidateSize calls since construction. */
  invalidated: number;
}

const n = (v: number, dp = 4): string =>
  Number.isFinite(v) ? String(Number(v.toFixed(dp))) : 'NaN';
const box = (b: MapBounds): string =>
  `[lat ${n(b.minLat)}..${n(b.maxLat)} lon ${n(b.minLon)}..${n(b.maxLon)}]`;

/** The part every line shares. `sizeMatch` is the quick answer to "is the map's size stale?". */
export function formatSnapshot(s: MapSnapshot): string {
  const match = s.container.w === s.map.w && s.container.h === s.map.h ? 'same' : 'DIFFERENT';
  return (
    `container=${s.container.w}x${s.container.h} mapSize=${s.map.w}x${s.map.h} size=${match} ` +
    `zoom=${n(s.zoom, 2)} center=${n(s.center.lat)},${n(s.center.lng)} rawBounds=${box(s.bounds)} ` +
    `invalidateSizeCalls=${s.invalidated}`
  );
}

export function formatLoadLine(s: MapSnapshot): string {
  return `load ${formatSnapshot(s)}`;
}

export function formatSizeLine(trigger: string, s: MapSnapshot): string {
  return `size-change(${trigger}) ${formatSnapshot(s)}`;
}

export interface FetchInfo {
  requestId: number;
  /** The ranges actually sent, one request each. */
  ranges: MapBounds[];
  /** Entries the API returned, before any were left out. */
  received: number;
  /** Entries kept after leaving out undrawable coordinates and duplicates. */
  entries: number;
  /** `id@lat,lon` of those left out for coordinates that cannot be drawn (first few logged). */
  undrawable: string[];
  markers: number;
  /** Requests made so far from this screen, including this one. */
  requestCount: number;
}

export function formatFetchLine(info: FetchInfo, s: MapSnapshot): string {
  return (
    `fetch #${info.requestId} requests=${info.ranges.length} sent=${info.ranges.map(box).join('+')} ` +
    `received=${info.received} entries=${info.entries} undrawable=${info.undrawable.length}` +
    `${info.undrawable.length > 0 ? `[${info.undrawable.slice(0, 5).join(' ')}]` : ''} markers=${info.markers} totalRequests=${info.requestCount} ${formatSnapshot(s)}`
  );
}

let logged = 0;
/** Starts the cap again; called when a map is built. */
export function resetMapLog(): void {
  logged = 0;
}

/** Writes one line to the desktop log. A no-op off the desktop shell. Never throws. */
export function logMapLine(line: string): void {
  if (!hasErrorDiagnostics()) return;
  if (logged >= MAP_LOG_CAP) return;
  logged += 1;
  const suffix = logged === MAP_LOG_CAP ? ' (further map lines suppressed)' : '';
  logError({ source: MAP_LOG_SOURCE, message: `${line}${suffix}` });
}
