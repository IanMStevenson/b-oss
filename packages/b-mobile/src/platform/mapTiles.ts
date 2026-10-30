// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The raster tile provider, kept behind this one function so it can be swapped without touching
// either map screen (§13). The base map is Leaflet over plain raster tiles (b-oss#651, #655): no
// WebGL, shaders or web workers, so a tile that didn't load is knowable. Provider: Geoapify's
// raster tile API (the comparison is in b-oss#652). Anything in the bundle is extractable
// (§18's honesty requirement), so the key is treated as public; never commit a real value.
//
// Returns null when no key is configured (the default — VITE_GEOAPIFY_KEY is never committed
// with a real value, see .env.example), which is what drives SCR-04's "Maps/location unavailable"
// state rather than the map silently failing to load tiles.

/** Geoapify raster style. `osm-bright` over `osm-carto` (compared at phone width, zoom 10 and 14,
 * b-oss#655): bright has larger place names and road shields, fewer competing road casings and
 * colours, so pins stand out and labels stay readable at 393px; carto is denser with small labels.
 * Bright's tiles are also lighter (one 2x tile was 175 kB against 474 kB). The cost is the extra
 * OpenMapTiles credit, which is included below (carto doesn't need it). */
const STYLE = 'osm-bright';
const MAX_ZOOM = 20;

/** What the map screens need to build a Leaflet tile layer. `{r}` is Leaflet's retina token
 * (`@2x` on a high-density screen, empty otherwise), so no `L.Browser` check is needed here. */
export interface TileLayerConfig {
  urlTemplate: string;
  maxZoom: number;
  /** HTML for Leaflet's attribution control; links are opened through platform/browser.ts. */
  attribution: string;
}

/** The credits Geoapify's Free plan requires: itself, the OpenStreetMap data (ODbL), and
 * OpenMapTiles for every style except osm-carto. */
const ATTRIBUTION = [
  'Powered by <a href="https://www.geoapify.com/">Geoapify</a>',
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
  '<a href="https://openmaptiles.org/" target="_blank">© OpenMapTiles</a>',
].join(' | ');

export function getTileLayerConfig(): TileLayerConfig | null {
  const key = import.meta.env.VITE_GEOAPIFY_KEY;
  if (!key) return null;
  return {
    urlTemplate: `https://maps.geoapify.com/v1/tile/${STYLE}/{z}/{x}/{y}{r}.png?apiKey=${encodeURIComponent(key)}`,
    maxZoom: MAX_ZOOM,
    attribution: ATTRIBUTION,
  };
}
