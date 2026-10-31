// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// jsdom has no WebGL/canvas support, so maplibre-gl itself can't run here (same class of gap as
// "no headless browser available in this sandbox"). `maplibre-gl` is
// mocked wholesale with a minimal fake Map/Marker/Popup that records what the component asked of
// it, which is enough to test MapScreen's own logic (bounds -> fetch -> markers, focused-mode
// centring, hidden-member filtering, my-location) without needing a real renderer — the same
// "mock the thing at the boundary" approach every platform/** consumer test already uses, applied
// to a WebView-rendered library instead of a Capacitor plugin.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { MAP_FAILED_MESSAGE } from '../../../components/createMap.js';
import { createTrackedRouter } from '../../../app/routes/test-router.js';
import { MapScreen } from '../MapScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import type { MapEntry } from '../../../data/map.js';

const { MockMap, MockMarker, MockPopup, mapInstances, markerInstances } = vi.hoisted(() => {
  const mapInstances: InstanceType<typeof MockMapImpl>[] = [];
  const markerInstances: InstanceType<typeof MockMarkerImpl>[] = [];

  class MockPopupImpl {
    content: HTMLElement | null = null;
    setDOMContent(el: HTMLElement) {
      this.content = el;
      return this;
    }
  }

  class MockMarkerImpl {
    lngLat: [number, number] = [0, 0];
    popup: MockPopupImpl | null = null;
    toggled = 0;
    removed = false;
    options: { color?: string; element?: HTMLElement };
    constructor(options: { color?: string; element?: HTMLElement } = {}) {
      this.options = options;
      markerInstances.push(this);
    }
    setLngLat(ll: [number, number]) {
      this.lngLat = ll;
      return this;
    }
    setPopup(p: MockPopupImpl) {
      this.popup = p;
      return this;
    }
    addTo() {
      return this;
    }
    togglePopup() {
      this.toggled += 1;
      return this;
    }
    remove() {
      this.removed = true;
    }
  }

  class MockMapImpl {
    options: {
      container: HTMLElement;
      style: string;
      center: [number, number];
      zoom: number;
      attributionControl?: { customAttribution?: string[] };
    };
    /** Set by a test to make the next construction throw, as MapLibre does without WebGL2. */
    static constructError: Error | null = null;
    handlers: Record<string, Array<(e?: unknown) => void>> = {};
    removed = false;
    jumpToCalls: Array<{ center: [number, number]; zoom: number }> = [];
    constructor(options: MockMapImpl['options']) {
      if (MockMapImpl.constructError) throw MockMapImpl.constructError;
      this.options = options;
      mapInstances.push(this);
    }
    on(event: string, handler: (e?: unknown) => void) {
      (this.handlers[event] ??= []).push(handler);
      return this;
    }
    getBounds() {
      return { getSouth: () => -1, getNorth: () => 1, getWest: () => -1, getEast: () => 1 };
    }
    /** What a pan/zoom would have moved the map to; defaults to where it was constructed. */
    view: { center: [number, number]; zoom: number } | null = null;
    getCenter() {
      const [lng, lat] = (this.view ?? this.options).center;
      return { lng, lat };
    }
    getZoom() {
      return (this.view ?? this.options).zoom;
    }
    jumpTo(opts: { center: [number, number]; zoom: number }) {
      this.jumpToCalls.push(opts);
    }
    remove() {
      this.removed = true;
    }
    trigger(event: string, payload?: unknown): void {
      (this.handlers[event] ?? []).forEach((h) => h(payload));
    }
  }

  return {
    MockMap: MockMapImpl,
    MockMarker: MockMarkerImpl,
    MockPopup: MockPopupImpl,
    mapInstances,
    markerInstances,
  };
});

vi.mock('maplibre-gl', () => ({
  Map: MockMap,
  Marker: MockMarker,
  Popup: MockPopup,
  setWorkerUrl: vi.fn(),
}));

vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({
  default: 'mock-worker-url',
}));

vi.mock('../../../platform/mapTiles.js', () => ({
  getMapStyleUrl: vi.fn(),
  MAP_ATTRIBUTION: ['mock credit'],
}));

vi.mock('../../../platform/geolocation.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/geolocation.js')>()),
  getCurrentPosition: vi.fn(),
}));

vi.mock('../../../data/map.js', () => ({
  fetchEntriesInBounds: vi.fn(),
}));

vi.mock('../../../data/entries.js', () => ({
  fetchEntry: vi.fn(),
}));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const entryMarker: MapEntry = {
  entry_id: 'e1',
  title: 'Sunrise',
  username: 'alice',
  lat: 51.5,
  lon: -0.1,
  thumbnailUrl: '',
};

beforeEach(() => {
  MockMap.constructError = null;
  mapInstances.length = 0;
  markerInstances.length = 0;
  useHiddenMembersStore.setState({ hidden: [], hydrated: true });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen(focusedEntryId?: string) {
  const { tracked: history, wrap } = createTrackedRouter();
  const utils = render(
    wrap(
      <>
        <OverlayProvider>
          <OverlayHost />
          <MapScreen focusedEntryId={focusedEntryId} />
        </OverlayProvider>
      </>,
    ),
  );
  return { history, ...utils };
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

describe('MapScreen', () => {
  it('shows the "unavailable" message instead of a blank screen when no tile key is configured', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    vi.mocked(getMapStyleUrl).mockReturnValue(null);
    renderScreen();
    expect(screen.getByText('The map isn’t available right now.')).toBeDefined();
    expect(mapInstances.length).toBe(0);
  });

  it('credits the map tiles and OpenStreetMap explicitly', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(mapInstances[0].options.attributionControl).toEqual({
      customAttribution: ['mock credit'],
    });
  });

  it('remembers where you panned to, and reopens there after Back from an entry (b-oss#190)', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    const first = renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(mapInstances[0].options.zoom).toBe(1.5); // the world view the first time

    mapInstances[0].view = { center: [-3.2, 55.9], zoom: 11 }; // the user pans and zooms in
    mapInstances[0].trigger('moveend');
    first.unmount(); // opening an entry from a pin unmounts the map screen

    renderScreen(); // Back
    await waitFor(() => expect(mapInstances.length).toBe(2));
    expect(mapInstances[1].options.center).toEqual([-3.2, 55.9]);
    expect(mapInstances[1].options.zoom).toBe(11);
  });

  it('focused mode ignores the remembered view and centres on its own entry', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    const first = renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].view = { center: [10, 10], zoom: 6 };
    mapInstances[0].trigger('moveend');
    first.unmount();

    vi.mocked(fetchEntry).mockResolvedValue({
      entry: {
        entry_id: 'e1',
        date: '2026-01-01',
        title: 'Sunrise',
        username: 'alice',
        journal_title: '',
        description: '',
        description_html: '',
        tags: [],
        location: { lat: 51.5, lon: -0.1 },
        views_total: 0,
        stars_total: 0,
        favorites_total: 0,
        comments: [],
        exif: null,
        images: {},
      },
      prevEntryId: null,
      nextEntryId: null,
      actions: null,
      starred: false,
      favorited: false,
      friendship: null,
      comments: [],
    });
    renderScreen('e1');
    await waitFor(() => expect(mapInstances.length).toBe(2));
    expect(mapInstances[1].options.center).toEqual([-0.1, 51.5]);
    expect(mapInstances[1].options.zoom).toBe(13);
  });

  it('fetches and renders markers for the visible region once the map settles', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([entryMarker]);
    renderScreen();

    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('load');

    await waitFor(() =>
      expect(fetchEntriesInBounds).toHaveBeenCalledWith({
        minLat: -1,
        maxLat: 1,
        minLon: -1,
        maxLon: 1,
      }),
    );
    await waitFor(() => expect(markerInstances.length).toBe(1));
  });

  it('entry markers use b-oss green, not the default marker colour', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([entryMarker]);
    renderScreen();

    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('load');

    await waitFor(() => expect(markerInstances.length).toBe(1));
    expect(markerInstances[0].options.color).toBe('#1f4d3a');
  });

  it('an entry with a thumbnail shows an image in its popup', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([
      { ...entryMarker, thumbnailUrl: 'https://example.com/thumb.jpg' },
    ]);
    renderScreen();

    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('load');

    await waitFor(() => expect(markerInstances.length).toBe(1));
    const img = markerInstances[0].popup?.content?.querySelector('img');
    expect(img).not.toBeNull();
  });

  it('an entry with no thumbnail shows no image in its popup', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([entryMarker]); // thumbnailUrl: ''
    renderScreen();

    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('load');

    await waitFor(() => expect(markerInstances.length).toBe(1));
    expect(markerInstances[0].popup?.content?.querySelector('img')).toBeNull();
  });

  it('shows no markers and no error for an empty region', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('load');

    await waitFor(() => expect(fetchEntriesInBounds).toHaveBeenCalled());
    expect(markerInstances.length).toBe(0);
    expect(screen.queryByText(/couldn.?t|error|failed/i)).toBeNull();
  });

  it('shows a non-blocking error message when the region fetch fails', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockRejectedValue(new Error('Network down'));
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('load');

    // A fixed message with a retry, never the API's own text (b-oss#669).
    expect(await screen.findByText(/Could not load entries for this area/)).toBeDefined();
    expect(screen.queryByText('Network down')).toBeNull();

    vi.mocked(fetchEntriesInBounds).mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(fetchEntriesInBounds).toHaveBeenCalledTimes(1));
  });

  it('does not create a marker for a hidden member’s entry', async () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'a1',
          username: 'me',
          avatarUrl: null,
          appTokenScope: 'read,write',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'a1',
      hydrated: true,
    });
    useHiddenMembersStore.setState({ hidden: ['alice'], hydrated: true });
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([entryMarker]);
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].trigger('load');

    await waitFor(() => expect(fetchEntriesInBounds).toHaveBeenCalled());
    expect(markerInstances.length).toBe(0);
  });

  it('focused mode centres on the entry at close zoom instead of the default region', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: {
        entry_id: 'e1',
        date: '2026-01-01',
        title: 'Sunrise',
        username: 'alice',
        journal_title: '',
        description: '',
        description_html: '',
        tags: [],
        location: { lat: 51.5, lon: -0.1 },
        views_total: 0,
        stars_total: 0,
        favorites_total: 0,
        comments: [],
        exif: null,
        images: {},
      },
      prevEntryId: null,
      nextEntryId: null,
      actions: null,
      starred: false,
      favorited: false,
      friendship: null,
      comments: [],
    });
    renderScreen('e1');

    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(mapInstances[0].options.center).toEqual([-0.1, 51.5]);
    expect(mapInstances[0].options.zoom).toBe(13);
  });

  it('focused mode shows only the entry you came from, not every nearby entry (b-oss#142)', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntry } = await import('../../../data/entries.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntry).mockResolvedValue({
      entry: {
        entry_id: 'e1',
        date: '2026-01-01',
        title: 'Sunrise',
        username: 'alice',
        journal_title: '',
        description: '',
        description_html: '',
        tags: [],
        location: { lat: 51.5, lon: -0.1 },
        views_total: 0,
        stars_total: 0,
        favorites_total: 0,
        comments: [],
        exif: null,
        images: {},
      },
      prevEntryId: null,
      nextEntryId: null,
      actions: null,
      starred: false,
      favorited: false,
      friendship: null,
      comments: [],
    });
    renderScreen('e1');

    await waitFor(() => expect(markerInstances.length).toBe(1));
    expect(markerInstances[0].lngLat).toEqual([-0.1, 51.5]);
    expect(markerInstances[0].toggled).toBe(1);
    // Panning/moving the map would normally trigger a bounds fetch (see the 'moveend' handler in
    // general Map-tab mode) — focused mode never registers that handler at all, so triggering it
    // here (if it existed) would be a no-op regardless; the real assertion is that the fetch never
    // happens in the first place.
    expect(fetchEntriesInBounds).not.toHaveBeenCalled();
  });

  it('recentres on the device location when My location is tapped', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { getCurrentPosition } = await import('../../../platform/geolocation.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 10, lon: 20 });
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.click(screen.getByRole('button', { name: 'My location' }));

    await waitFor(() =>
      expect(mapInstances[0].jumpToCalls).toContainEqual({ center: [20, 10], zoom: 13 }),
    );
  });

  it('"My location" shows a plain dot, not an entry-style pin', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { getCurrentPosition } = await import('../../../platform/geolocation.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 10, lon: 20 });
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.click(screen.getByRole('button', { name: 'My location' }));

    await waitFor(() => {
      const dotMarker = markerInstances.find((m) => m.options.element);
      expect(dotMarker).toBeDefined();
      expect(dotMarker?.options.color).toBeUndefined();
      expect(dotMarker?.lngLat).toEqual([20, 10]);
    });
  });

  it('puts the locate control over the map (shared with the location picker), not in the header', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    const locate = screen.getByRole('button', { name: 'My location' });
    expect(locate.classList.contains('map-locate')).toBe(true);
    expect(locate.closest('ion-header')).toBeNull();
  });

  describe('when the map can\u2019t draw (b-oss#537)', () => {
    function gpuError(): Error {
      const e = new Error('WebGL2 is required to display this map.');
      e.name = 'GPUInitializationError';
      return e;
    }

    it('says so, instead of a blank area, when the map can\u2019t be created', async () => {
      const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
      vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
      MockMap.constructError = gpuError();
      renderScreen();
      expect(await screen.findByText(MAP_FAILED_MESSAGE)).toBeDefined();
      expect(mapInstances.length).toBe(0);
    });

    it('says so when the WebGL context is lost, and clears it once restored', async () => {
      const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
      const { fetchEntriesInBounds } = await import('../../../data/map.js');
      vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
      vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
      renderScreen();
      await waitFor(() => expect(mapInstances.length).toBe(1));

      act(() => mapInstances[0].trigger('webglcontextlost'));
      expect(await screen.findByText(MAP_FAILED_MESSAGE)).toBeDefined();
      act(() => mapInstances[0].trigger('webglcontextrestored'));
      await waitFor(() => expect(screen.queryByText(MAP_FAILED_MESSAGE)).toBeNull());
    });

    it('says so when restoring a lost context fails', async () => {
      const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
      const { fetchEntriesInBounds } = await import('../../../data/map.js');
      vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
      vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
      renderScreen();
      await waitFor(() => expect(mapInstances.length).toBe(1));

      act(() => mapInstances[0].trigger('error', { error: gpuError() }));
      expect(await screen.findByText(MAP_FAILED_MESSAGE)).toBeDefined();
    });
  });
});

describe('MapScreen without OS location (desktop, b-oss#636)', () => {
  it('has no "My location" control: there is nothing to allow', async () => {
    caps.location = 'pick-only';
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getMapStyleUrl).mockReturnValue('https://example.com/style.json');
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(screen.queryByRole('button', { name: 'My location' })).toBeNull();
  });
});
