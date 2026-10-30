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

/** Geoapify raster style. `osm-liberty`: its labels are English (Geoapify's raster tiles have no
 * language parameter, and `osm-bright` shows local names). Compared at phone width, zoom 10 and 14
 * (b-oss#655): lighter and greyer than `osm-bright` with thinner roads, but the brand-green pin
 * stands out well against it and place names and road shields stay legible. One 2x tile is about
 * the same weight (173 kB against 175 kB). It needs the OpenMapTiles credit, like the other
 * styles except `osm-carto`; included below. */
const STYLE = 'osm-liberty';
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
