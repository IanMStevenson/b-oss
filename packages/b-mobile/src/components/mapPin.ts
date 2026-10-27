// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one map pin: b-oss's accent green, not MapLibre's default blue or blipfoto.com's red. Shared
// by SCR-04 (entry markers) and SCR-12 (location picker) so the two can't drift apart again (UX
// review X11, b-oss#270). The colour is the theme's --accent (brand green in Light, the lighter
// accent green on Dark and Mid, where the brand green disappears on a dark map); the pin's centre
// dot follows --on-accent (see .maplibregl-marker in globals.css). MapLibre paints the pin from a
// JS colour, so it is resolved when the pin is made, and the map screens re-create their map when
// the theme changes.

import { Marker } from 'maplibre-gl';
import { tokens } from '@b-oss/b-visual';

function accentColour(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
  return value || tokens.green800;
}

export function createPin(options: { draggable?: boolean } = {}): Marker {
  return new Marker({ color: accentColour(), draggable: options.draggable ?? false });
}
