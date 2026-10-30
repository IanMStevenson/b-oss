// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// Leaflet runs in jsdom (it only needs a DOM), so the real library is used. Tiles never actually
// load there, so the tile layer's `tileload` / `tileerror` events are fired by hand.

import { describe, it, expect, vi, afterEach } from 'vitest';
import * as L from 'leaflet';
import { createLeafletMap } from '../leafletMap.js';

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock('../../platform/browser.js', () => ({ openUrl }));

const tiles = {
  urlTemplate: 'https://tiles.example/{z}/{x}/{y}{r}.png',
  maxZoom: 20,
  attribution: 'Powered by <a href="https://www.geoapify.com/">Geoapify</a>',
};

function setup() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const handlers = { onFailed: vi.fn(), onRecovered: vi.fn() };
  const map = createLeafletMap(container, { center: [51.5, -0.1], zoom: 10 }, tiles, handlers);
  const layer = (() => {
    let found: L.TileLayer | undefined;
    map?.eachLayer((l) => {
      if (l instanceof L.TileLayer) found = l;
    });
    return found;
  })();
  return { container, handlers, map, layer };
}

afterEach(() => {
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('createLeafletMap', () => {
  it('creates a map at the requested view with a tile layer', () => {
    const { map, layer } = setup();
    expect(map?.getCenter().lat).toBeCloseTo(51.5);
    expect(map?.getZoom()).toBe(10);
    expect(layer).toBeDefined();
  });

  it('reports a failure, and returns null, when Leaflet can’t create the map', () => {
    const handlers = { onFailed: vi.fn(), onRecovered: vi.fn() };
    // An element already holding a map makes L.map throw "Map container is already initialized".
    const container = document.createElement('div');
    L.map(container);
    const map = createLeafletMap(container, { center: [0, 0], zoom: 2 }, tiles, handlers);
    expect(map).toBeNull();
    expect(handlers.onFailed).toHaveBeenCalledTimes(1);
  });

  it('reports a failure once several tiles have failed and none has loaded', () => {
    const { layer, handlers } = setup();
    for (let i = 0; i < 3; i++) layer!.fire('tileerror');
    expect(handlers.onFailed).not.toHaveBeenCalled();
    layer!.fire('tileerror');
    expect(handlers.onFailed).toHaveBeenCalledTimes(1);
    layer!.fire('tileerror');
    expect(handlers.onFailed).toHaveBeenCalledTimes(1);
  });

  it('never reports a failure when a tile has loaded, however many others fail', () => {
    const { layer, handlers } = setup();
    layer!.fire('tileload');
    for (let i = 0; i < 10; i++) layer!.fire('tileerror');
    expect(handlers.onFailed).not.toHaveBeenCalled();
  });

  it('reports recovery when a tile loads after a failure', () => {
    const { layer, handlers } = setup();
    for (let i = 0; i < 4; i++) layer!.fire('tileerror');
    layer!.fire('tileload');
    expect(handlers.onRecovered).toHaveBeenCalledTimes(1);
  });

  it('shows the attribution, and opens its links through the app’s external-link mechanism', () => {
    const { container } = setup();
    const link = container.querySelector<HTMLAnchorElement>('.leaflet-control-attribution a');
    expect(link?.textContent).toBe('Geoapify');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    link!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(openUrl).toHaveBeenCalledWith('https://www.geoapify.com/');
  });
});
