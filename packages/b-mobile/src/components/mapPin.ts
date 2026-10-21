// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one map pin: b-oss's own green (tokens.green800), not MapLibre's default blue or
// blipfoto.com's red. Shared by SCR-04 (entry markers) and SCR-12 (location picker) so the two
// can't drift apart again (UX review X11, b-oss#270).

import { Marker } from 'maplibre-gl';
import { tokens } from '@b-oss/b-visual';

export function createPin(options: { draggable?: boolean } = {}): Marker {
  return new Marker({ color: tokens.green800, draggable: options.draggable ?? false });
}
