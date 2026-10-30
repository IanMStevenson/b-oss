// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Creates the Leaflet map for SCR-04 (Map) and SCR-12 (location picker) (b-oss#655). Leaflet over
// raster tiles needs no WebGL, shaders or web workers, which is the point: the MapLibre map failed
// silently on some devices (b-oss#535, #651). Tiles are plain images, so whether the map drew is
// knowable: `tileload` / `tileerror` on the tile layer.
//
// Failure reporting is deliberately minimal (the fuller "can't load tiles" message is b-oss#656):
// - the map can't be created (Leaflet throws), or
// - the first TILE_ERRORS_BEFORE_FAILED tiles all fail with none loaded yet. One tile loading
//   afterwards clears it (a flaky connection that recovers).
//
// Settings chosen for a phone and a provider that makes every view revalidate its tiles
// (`cache-control: no-cache`): `updateWhenIdle` loads tiles once a pan ends rather than during it,
// and `updateWhenZooming: false` skips the intermediate zoom levels a pinch passes through, so a
// gesture doesn't fire requests for tiles that are immediately discarded.

import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { TileLayerConfig } from '../platform/mapTiles.js';
import { openUrl } from '../platform/browser.js';

export const MAP_FAILED_MESSAGE = 'The map couldn’t be displayed on this device.';

const TILE_ERRORS_BEFORE_FAILED = 4;

export interface MapFailureHandlers {
  /** The map can't draw: it failed to start, or its tiles keep failing and none has loaded. */
  onFailed: () => void;
  /** A tile has loaded since `onFailed`; the map is drawing. */
  onRecovered: () => void;
}

/** Returns null (after calling `onFailed`) if the map can't be created. `center` is [lat, lon]. */
export function createLeafletMap(
  container: HTMLElement,
  view: { center: [number, number]; zoom: number },
  tiles: TileLayerConfig,
  handlers: MapFailureHandlers,
): L.Map | null {
  let map: L.Map;
  try {
    map = L.map(container, {
      center: view.center,
      zoom: view.zoom,
      maxZoom: tiles.maxZoom,
      attributionControl: false,
      zoomControl: false,
      // Leaflet's default is `L.Browser.mobile`; stated so it doesn't depend on UA sniffing.
      zoomAnimation: true,
    });
    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.control.attribution({ prefix: false }).addAttribution(tiles.attribution).addTo(map);

    const layer = L.tileLayer(tiles.urlTemplate, {
      maxZoom: tiles.maxZoom,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 2,
    }).addTo(map);

    let loaded = 0;
    let errors = 0;
    let failed = false;
    layer.on('tileload', () => {
      loaded += 1;
      if (failed) {
        failed = false;
        handlers.onRecovered();
      }
    });
    layer.on('tileerror', () => {
      errors += 1;
      if (loaded === 0 && !failed && errors >= TILE_ERRORS_BEFORE_FAILED) {
        failed = true;
        handlers.onFailed();
      }
    });
  } catch {
    handlers.onFailed();
    return null;
  }

  // The attribution links go through the app's external-link mechanism (Custom Tabs on device),
  // not a bare target=_blank, which a Capacitor WebView doesn't open reliably.
  container.addEventListener('click', (e) => {
    const link =
      e.target instanceof Element ? e.target.closest('.leaflet-control-attribution a') : null;
    if (!(link instanceof HTMLAnchorElement)) return;
    e.preventDefault();
    void openUrl(link.href);
  });
  return map;
}
