// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The tile provider, kept behind this one function so it can be swapped without touching either
// map screen (§13). Decision taken in app-architecture.md's Q7: MapTiler's free tier — no billing
// account required, tolerates a public/extractable key (§18's honesty requirement — anything in
// the bundle is extractable), and needs nothing beyond a style URL to wire up against MapLibre GL
// JS. Stadia Maps and a self-hosted Protomaps basemap were the credible alternatives; MapTiler was
// preferred as the cheapest/simplest to stand up for a free personal project with two map screens.
//
// Returns null when no key is configured (the default — VITE_MAP_TILES_KEY is never committed
// with a real value, see .env.example), which is what drives SCR-04's "Maps/location unavailable"
// state rather than the map silently failing to load tiles.

const STYLE = 'streets-v2';

export function getMapStyleUrl(): string | null {
  const key = import.meta.env.VITE_MAP_TILES_KEY;
  if (!key) return null;
  return `https://api.maptiler.com/maps/${STYLE}/style.json?key=${encodeURIComponent(key)}`;
}
