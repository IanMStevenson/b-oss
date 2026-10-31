// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// Leaflet runs in jsdom, so the real library is used (see SCR-04's MapScreen tests); this screen's
// own logic (marker placement, Clear/Done, my-location) is what's under test. `createLeafletMap`
// is wrapped only to hand the tests the maps it creates, and to simulate one that can't be created.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import * as L from 'leaflet';
import { MAP_FAILED_MESSAGE } from '../../../components/leafletMap.js';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OverlayProvider } from '../../../app/OverlayProvider.js';
import { LocationPickerScreen } from '../LocationPickerScreen.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';
import type { ComposeDraft } from '../../../state/composeDraftStore.js';

const { mapInstances, failure } = vi.hoisted(() => ({
  mapInstances: [] as L.Map[],
  failure: { createFails: false },
}));

vi.mock('../../../components/leafletMap.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../components/leafletMap.js')>();
  return {
    ...actual,
    createLeafletMap: (...args: Parameters<typeof actual.createLeafletMap>) => {
      if (failure.createFails) {
        args[3].onFailed();
        return null;
      }
      const map = actual.createLeafletMap(...args);
      if (map) mapInstances.push(map);
      return map;
    },
  };
});

const TILES = {
  urlTemplate: 'https://tiles.example/{z}/{x}/{y}{r}.png',
  maxZoom: 20,
  attribution: 'mock credit',
};

const { getTileLayerConfig } = vi.hoisted(() => ({ getTileLayerConfig: vi.fn() }));
vi.mock('../../../platform/mapTiles.js', () => ({ getTileLayerConfig }));

/** The pins on a map. */
function pins(map: L.Map): L.Marker[] {
  const found: L.Marker[] = [];
  map.eachLayer((l) => {
    if (l instanceof L.Marker) found.push(l);
  });
  return found;
}

function tileLayerOf(map: L.Map): L.TileLayer {
  let found: L.TileLayer | undefined;
  map.eachLayer((l) => {
    if (l instanceof L.TileLayer) found = l;
  });
  return found!;
}

const { getCurrentPosition } = vi.hoisted(() => ({ getCurrentPosition: vi.fn() }));
vi.mock('../../../platform/geolocation.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/geolocation.js')>()),
  getCurrentPosition,
}));

const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace: vi.fn(), goBack }),
}));

function draft(overrides: Partial<ComposeDraft> = {}): ComposeDraft {
  return {
    mode: 'publish',
    accountId: 'a1',
    photo: null,
    title: '',
    tags: '',
    description: '',
    date: '2026-01-01',
    location: null,
    displayLocation: false,
    thumbnailCrop: null,
    dirty: false,
    ...overrides,
  };
}

beforeEach(() => {
  failure.createFails = false;
  mapInstances.length = 0;
  getTileLayerConfig.mockReturnValue(TILES);
  useComposeDraftStore.setState({ draft: draft() });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <LocationPickerScreen />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

// Capabilities under test: the jsdom default is `web` (location and camera both available); the
// pick-only / files-only cases flip these (b-oss#636).
const caps = vi.hoisted((): { location: 'os' | 'pick-only'; capture: 'camera' | 'files-only' } => ({
  location: 'os',
  capture: 'camera',
}));
vi.mock('../../../platform/capabilities.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../platform/capabilities.js')>();
  return {
    ...real,
    locationControlAvailable: () => caps.location === 'os',
    capabilities: () => ({
      ...real.capabilities(),
      location: caps.location,
      media: { capture: caps.capture },
    }),
  };
});
afterEach(() => {
  caps.location = 'os';
  caps.capture = 'camera';
});

describe('LocationPickerScreen', () => {
  it('shows the unavailable message instead of a blank map when no tile key is configured', () => {
    getTileLayerConfig.mockReturnValue(null);
    renderScreen();
    expect(screen.getByText(/aren.t available/)).toBeDefined();
    expect(mapInstances.length).toBe(0);
  });

  it('opens centred on an existing location with its marker already placed', async () => {
    useComposeDraftStore.setState({ draft: draft({ location: { lat: 51.5, lon: -0.1 } }) });
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(mapInstances[0].getCenter().lat).toBeCloseTo(51.5);
    expect(mapInstances[0].getCenter().lng).toBeCloseTo(-0.1);
    expect(pins(mapInstances[0]).length).toBe(1);
  });

  it('shows the provider attribution on the map', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(document.querySelector('.leaflet-control-attribution')?.textContent).toContain(
      'mock credit',
    );
  });

  it('a map tap places a single marker', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].fire('click', { latlng: L.latLng(10, 20) });
    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));
    expect(pins(mapInstances[0])[0].getLatLng()).toMatchObject({ lat: 10, lng: 20 });

    // A second tap moves the same marker rather than adding another.
    mapInstances[0].fire('click', { latlng: L.latLng(30, 40) });
    await waitFor(() =>
      expect(pins(mapInstances[0])[0].getLatLng()).toMatchObject({ lat: 30, lng: 40 }),
    );
    expect(pins(mapInstances[0]).length).toBe(1);
  });

  it('Clear removes the marker; Done then returns a "no location" result', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].fire('click', { latlng: L.latLng(10, 20) });
    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));

    await userEvent.click(screen.getByText('Clear'));
    expect(pins(mapInstances[0]).length).toBe(0);

    await userEvent.click(screen.getByText('Done'));
    expect(useComposeDraftStore.getState().draft?.location).toBeNull();
    expect(goBack).toHaveBeenCalled();
  });

  it('Done with a placed marker returns its coordinates', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].fire('click', { latlng: L.latLng(10, 20) });
    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));

    await userEvent.click(screen.getByText('Done'));
    expect(useComposeDraftStore.getState().draft?.location).toEqual({ lat: 10, lon: 20 });
    expect(useComposeDraftStore.getState().draft?.displayLocation).toBe(true);
  });

  it('dragging the marker moves the selection to where it was dropped', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].fire('click', { latlng: L.latLng(10, 20) });
    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));

    const pin = pins(mapInstances[0])[0];
    pin.setLatLng(L.latLng(11, 22));
    act(() => {
      pin.fire('dragend');
    });

    await userEvent.click(screen.getByText('Done'));
    expect(useComposeDraftStore.getState().draft?.location).toEqual({ lat: 11, lon: 22 });
  });

  it('My location recentres the map and places the marker there', async () => {
    getCurrentPosition.mockResolvedValue({ lat: 5, lon: 6 });
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: 'My location' }));
    await waitFor(() => expect(mapInstances[0].getZoom()).toBe(13));
    expect(mapInstances[0].getCenter().lat).toBeCloseTo(5);
    expect(mapInstances[0].getCenter().lng).toBeCloseTo(6);
    expect(pins(mapInstances[0])).toHaveLength(1);
  });

  it('uses the shared green pin (same as the Map screen), draggable', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].fire('click', { latlng: L.latLng(1, 2) });
    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));
    const pin = pins(mapInstances[0])[0];
    expect((pin.options.icon as L.DivIcon).options.html).toContain('fill="#1f4d3a"');
    expect(pin.options.draggable).toBe(true);
  });

  it('says the map can\u2019t be displayed, instead of a blank area, when it can\u2019t be created', () => {
    failure.createFails = true;
    renderScreen();
    expect(screen.getByText(MAP_FAILED_MESSAGE)).toBeDefined();
    expect(mapInstances.length).toBe(0);
  });

  it('says so when tiles keep failing and none has loaded, and clears it once one loads', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    const layer = tileLayerOf(mapInstances[0]);
    act(() => {
      for (let i = 0; i < 4; i++) layer.fire('tileerror');
    });
    expect(screen.getByText(MAP_FAILED_MESSAGE)).toBeDefined();
    act(() => {
      layer.fire('tileload');
    });
    expect(screen.queryByText(MAP_FAILED_MESSAGE)).toBeNull();
  });
});

describe('LocationPickerScreen without OS location (desktop, b-oss#636)', () => {
  it('has no "My location" control but still places a marker from a map tap', async () => {
    caps.location = 'pick-only';
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(screen.queryByRole('button', { name: 'My location' })).toBeNull();
    mapInstances[0].fire('click', { latlng: L.latLng(10, 20) });
    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));
    await userEvent.click(screen.getByText('Done'));
    expect(useComposeDraftStore.getState().draft?.location).toEqual({ lat: 10, lon: 20 });
  });
});

describe('LocationPickerScreen: desktop first attempt fails (b-oss#672)', () => {
  it('shows the Windows-location message, hides the control and keeps picking on the map', async () => {
    const { LocationUnavailableError } = await import('../../../platform/geolocation.js');
    getCurrentPosition.mockRejectedValue(new LocationUnavailableError());
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    await userEvent.click(screen.getByRole('button', { name: 'My location' }));
    expect(
      await screen.findByText(/Windows location is off, or not available to this app/),
    ).toBeDefined();
  });
});
