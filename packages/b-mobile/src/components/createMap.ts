// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Creates the MapLibre map for SCR-04 (Map) and SCR-12 (location picker), and reports the
// failures that are certain (b-oss#537):
//
// - The constructor throws GPUInitializationError when the WebView can't give it a WebGL2 context.
// - The WebGL context is lost (`webglcontextlost`). MapLibre restores it by itself if it can
//   (`webglcontextrestored`), and fires `error` with GPUInitializationError if it can't.
//
// Known gap, deliberately not detected: a map that starts without error but draws only its
// background colour (plain yellow/cream, no roads or labels). Seen on a tablet with Android System
// WebView 111 (b-oss#535); updating WebView from the Play Store fixed it. The app can't detect
// this for certain: a GPU/driver fault raises no error, and checking the drawn pixels can't tell
// it apart from a view of plain land, which is the same colour. So for a support request about a
// blank map, the answer is: update Android System WebView (Play Store), then restart the app.

import { Map as MapLibreMap } from 'maplibre-gl';
import type { MapOptions, ErrorEvent as MapLibreErrorEvent } from 'maplibre-gl';

export const MAP_FAILED_MESSAGE = 'The map couldn’t be displayed on this device.';

export interface MapFailureHandlers {
  /** The map can't draw: it failed to start, or lost its WebGL context. */
  onFailed: () => void;
  /** MapLibre restored a lost context; the map is drawing again. */
  onRecovered: () => void;
}

function isGpuInitializationError(error: unknown): boolean {
  return error instanceof Error && error.name === 'GPUInitializationError';
}

/** Returns null (after calling `onFailed`) if the map can't be created. */
export function createMap(options: MapOptions, handlers: MapFailureHandlers): MapLibreMap | null {
  let map: MapLibreMap;
  try {
    map = new MapLibreMap(options);
  } catch {
    handlers.onFailed();
    return null;
  }
  map.on('webglcontextlost', handlers.onFailed);
  map.on('webglcontextrestored', handlers.onRecovered);
  map.on('error', (e: MapLibreErrorEvent) => {
    if (isGpuInitializationError(e.error)) handlers.onFailed();
  });
  return map;
}
