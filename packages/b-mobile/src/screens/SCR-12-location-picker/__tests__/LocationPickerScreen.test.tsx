// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// Same "mock maplibre-gl wholesale" approach as SCR-04's MapScreen tests — jsdom has no WebGL/
// canvas, and this screen's own logic (marker placement, Clear/Done, my-location) is what's under
// test, not MapLibre's rendering.

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
    constructor(public options?: { draggable?: boolean }) {
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
    constructor(public options: { center: [number, number]; zoom: number }) {
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
vi.mock('../../../platform/mapTiles.js', () => ({ getMapStyleUrl }));

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
      <LocationPickerScreen />
    </MemoryRouter>,
  );
}

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

    await userEvent.click(screen.getByText('My location', { selector: 'ion-button' }));
    await waitFor(() =>
      expect(mapInstances[0].jumpToCalls).toContainEqual({ center: [6, 5], zoom: 12 }),
    );
    expect(markerInstances).toHaveLength(1);
  });
});
