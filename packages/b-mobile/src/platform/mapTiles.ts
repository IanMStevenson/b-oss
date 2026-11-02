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
  /** A logo the provider's terms require while this layer is showing (shown as a link). */
  watermark?: { href: string; imageUrl: string; alt: string };
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

/** MapTiler's `hybrid` map: satellite imagery with place and road labels in one layer (b-oss#741).
 * Checked against the live API: `/maps/hybrid/256/{z}/{x}/{y}.jpg`; a bad key is a 403, an unknown
 * map id a 404. A 256px tile (and its `@2x`) counts as one request against the Free plan's 100k a
 * month, and the plan pauses at the limit rather than billing. The Free plan is limited to
 * non-commercial use (a free GPL app is taken at that plain reading) and requires the MapTiler
 * logo and credit while the layer shows. */
const SATELLITE_MAX_ZOOM = 20;

const SATELLITE_ATTRIBUTION = [
  '<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a>',
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>',
].join(' ');

/** Null when no MapTiler key is configured (VITE_MAPTILER_KEY, never committed with a real
 * value): the layer selector is then not offered and the road map is unchanged. */
export function getSatelliteLayerConfig(): TileLayerConfig | null {
  const key = import.meta.env.VITE_MAPTILER_KEY;
  if (!key) return null;
  return {
    urlTemplate: `https://api.maptiler.com/maps/hybrid/256/{z}/{x}/{y}{r}.jpg?key=${encodeURIComponent(key)}`,
    maxZoom: SATELLITE_MAX_ZOOM,
    attribution: SATELLITE_ATTRIBUTION,
    watermark: {
      href: 'https://www.maptiler.com/',
      imageUrl: 'https://api.maptiler.com/resources/logo.svg',
      alt: 'MapTiler',
    },
  };
}
