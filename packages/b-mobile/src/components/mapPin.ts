// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one map pin: b-oss's brand green, not Leaflet's default blue or blipfoto.com's red. Shared
// by SCR-04 (entry markers) and SCR-12 (location picker) so the two can't drift apart (UX review
// X11, b-oss#270). An inline-SVG divIcon, so there are no image files for Leaflet to locate. The
// base map is always light (b-oss#655), so the pin is the fixed brand green on every theme.

import { divIcon } from 'leaflet';
import type { DivIcon } from 'leaflet';
import { tokens } from '@b-oss/b-visual';

const WIDTH = 27;
const HEIGHT = 41;

export function createPinIcon(): DivIcon {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" ` +
    `viewBox="0 0 ${WIDTH} ${HEIGHT}" aria-hidden="true">` +
    `<path d="M13.5 0C6 0 0 6 0 13.5 0 23.5 13.5 41 13.5 41S27 23.5 27 13.5C27 6 21 0 13.5 0Z" ` +
    `fill="${tokens.green800}" stroke="#fff" stroke-width="1.5"/>` +
    `<circle cx="13.5" cy="13.5" r="5.5" fill="#fff"/></svg>`;
  return divIcon({
    html: svg,
    className: 'map-pin',
    iconSize: [WIDTH, HEIGHT],
    iconAnchor: [WIDTH / 2, HEIGHT],
    popupAnchor: [0, -HEIGHT + 6],
  });
}
