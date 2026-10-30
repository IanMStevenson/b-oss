// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// Same "mock maplibre-gl wholesale" approach as SCR-04's MapScreen tests — jsdom has no WebGL/
// canvas, and this screen's own logic (marker placement, Clear/Done, my-location) is what's under
// test, not MapLibre's rendering.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { MAP_FAILED_MESSAGE } from '../../../components/createMap.js';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OverlayProvider } from '../../../app/OverlayProvider.js';
import { LocationPickerScreen } from '../LocationPickerScreen.js';
import { useComposeDraftStore } from '../../../state/composeDraftStore.js';
import type { ComposeDraft } from '../../../state/composeDraftStore.js';

const { MockMap, MockMarker, mapInstances, markerInstances } = vi.hoisted(() => {
  const mapInstances: InstanceType<typeof MockMapImpl>[] = [];
  const markerInstances: InstanceType<typeof MockMarkerImpl>[] = [];

  class MockMarkerImpl {
    lngLat: [number, number];
    handlers: Record<string, Array<() => void>> = {};
    removed = false;
    constructor(public options?: { draggable?: boolean; color?: string }) {
      this.lngLat = [0, 0];
      markerInstances.push(this);
    }
    setLngLat(ll: [number, number]) {
      this.lngLat = ll;
      return this;
    }
    addTo() {
      return this;
    }
    on(event: string, handler: () => void) {
      (this.handlers[event] ??= []).push(handler);
      return this;
    }
    getLngLat() {
      return { lat: this.lngLat[1], lng: this.lngLat[0] };
    }
    remove() {
      this.removed = true;
    }
  }

  class MockMapImpl {
    handlers: Record<string, Array<(e: unknown) => void>> = {};
    jumpToCalls: Array<{ center: [number, number]; zoom: number }> = [];
    /** Set by a test to make the next construction throw, as MapLibre does without WebGL2. */
    static constructError: Error | null = null;
    constructor(
      public options: {
        center: [number, number];
        zoom: number;
        attributionControl?: { customAttribution?: string[] };
      },
    ) {
      if (MockMapImpl.constructError) throw MockMapImpl.constructError;
      mapInstances.push(this);
    }
    on(event: string, handler: (e: unknown) => void) {
      (this.handlers[event] ??= []).push(handler);
      return this;
    }
    jumpTo(opts: { center: [number, number]; zoom: number }) {
      this.jumpToCalls.push(opts);
    }
    remove() {}
    trigger(event: string, payload?: unknown): void {
      (this.handlers[event] ?? []).forEach((h) => h(payload));
    }
  }

  return { MockMap: MockMapImpl, MockMarker: MockMarkerImpl, mapInstances, markerInstances };
});

vi.mock('maplibre-gl', () => ({ Map: MockMap, Marker: MockMarker }));

const { getMapStyleUrl } = vi.hoisted(() => ({ getMapStyleUrl: vi.fn() }));
vi.mock('../../../platform/mapTiles.js', () => ({
  getMapStyleUrl,
  MAP_ATTRIBUTION: ['mock credit'],
}));

const { getCurrentPosition } = vi.hoisted(() => ({ getCurrentPosition: vi.fn() }));
vi.mock('../../../platform/geolocation.js', () => ({ getCurrentPosition }));

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
  MockMap.constructError = null;
  mapInstances.length = 0;
  markerInstances.length = 0;
  getMapStyleUrl.mockReturnValue('https://example.com/style.json');
  useComposeDraftStore.setState({ draft: draft() });
});

afterEach(() => {
  cleanup();
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
const caps = vi.hoisted(
  (): { location: 'os' | 'pick-only'; capture: 'camera' | 'files-only' } => ({
    location: 'os',
    capture: 'camera',
  }),
);
vi.mock('../../../platform/capabilities.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../platform/capabilities.js')>();
  return {
    ...real,
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
    getMapStyleUrl.mockReturnValue(null);
    renderScreen();
    expect(screen.getByText(/aren.t available/)).toBeDefined();
    expect(mapInstances.length).toBe(0);
  });

  it('opens centred on an existing location with its marker already placed', async () => {
    useComposeDraftStore.setState({ draft: draft({ location: { lat: 51.5, lon: -0.1 } }) });
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(mapInstances[0].options.center).toEqual([-0.1, 51.5]);
    mapInstances[0].trigger('load');
    await waitFor(() => expect(markerInstances.length).toBe(1));
  });

  it('credits the map tiles and OpenStreetMap explicitly', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(mapInstances[0].options.attributionControl).toEqual({
      customAttribution: ['mock credit'],
    });
  });

  it('a map tap places a single marker', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('click', { lngLat: { lat: 10, lng: 20 } });
    await waitFor(() => expect(markerInstances.length).toBe(1));
    expect(markerInstances[0].lngLat).toEqual([20, 10]);

    // A second tap moves the same marker rather than adding another.
    mapInstances[0].trigger('click', { lngLat: { lat: 30, lng: 40 } });
    expect(markerInstances.length).toBe(1);
    expect(markerInstances[0].lngLat).toEqual([40, 30]);
  });

  it('Clear removes the marker; Done then returns a "no location" result', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('click', { lngLat: { lat: 10, lng: 20 } });
    await waitFor(() => expect(markerInstances.length).toBe(1));

    await userEvent.click(screen.getByText('Clear'));
    expect(markerInstances[0].removed).toBe(true);

    await userEvent.click(screen.getByText('Done'));
    expect(useComposeDraftStore.getState().draft?.location).toBeNull();
    expect(goBack).toHaveBeenCalled();
  });

  it('Done with a placed marker returns its coordinates', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('click', { lngLat: { lat: 10, lng: 20 } });
    await waitFor(() => expect(markerInstances.length).toBe(1));

    await userEvent.click(screen.getByText('Done'));
    expect(useComposeDraftStore.getState().draft?.location).toEqual({ lat: 10, lon: 20 });
    expect(useComposeDraftStore.getState().draft?.displayLocation).toBe(true);
  });

  it('My location recentres the map and places the marker there', async () => {
    getCurrentPosition.mockResolvedValue({ lat: 5, lon: 6 });
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    await userEvent.click(screen.getByRole('button', { name: 'My location' }));
    await waitFor(() =>
      expect(mapInstances[0].jumpToCalls).toContainEqual({ center: [6, 5], zoom: 12 }),
    );
    expect(markerInstances).toHaveLength(1);
  });

  it('uses the shared green pin (same as the Map screen), draggable', async () => {
    renderScreen();
    mapInstances[0].trigger('click', { lngLat: { lat: 1, lng: 2 } });
    await waitFor(() => expect(markerInstances.length).toBe(1));
    expect(markerInstances[0].options).toEqual({ color: '#1f4d3a', draggable: true });
  });

  it('says the map can\u2019t be displayed, instead of a blank area, when it can\u2019t be created (b-oss#537)', () => {
    MockMap.constructError = Object.assign(new Error('WebGL2 is required'), {
      name: 'GPUInitializationError',
    });
    renderScreen();
    expect(screen.getByText(MAP_FAILED_MESSAGE)).toBeDefined();
    expect(mapInstances.length).toBe(0);
  });

  it('says so when the WebGL context is lost, and clears it once restored (b-oss#537)', async () => {
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    act(() => mapInstances[0].trigger('webglcontextlost'));
    expect(screen.getByText(MAP_FAILED_MESSAGE)).toBeDefined();
    act(() => mapInstances[0].trigger('webglcontextrestored'));
    expect(screen.queryByText(MAP_FAILED_MESSAGE)).toBeNull();
  });
});

describe('LocationPickerScreen without OS location (desktop, b-oss#636)', () => {
  it('has no "My location" control but still places a marker from a map tap', async () => {
    caps.location = 'pick-only';
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(screen.queryByRole('button', { name: 'My location' })).toBeNull();
    mapInstances[0].trigger('click', { lngLat: { lat: 10, lng: 20 } });
    await waitFor(() => expect(markerInstances.length).toBe(1));
    await userEvent.click(screen.getByText('Done'));
    expect(useComposeDraftStore.getState().draft?.location).toEqual({ lat: 10, lon: 20 });
  });
});
