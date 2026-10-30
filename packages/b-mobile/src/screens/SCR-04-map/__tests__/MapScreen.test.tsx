// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// Leaflet runs in jsdom (it only needs a DOM, no WebGL), so the real library is used and MapScreen's
// own logic (bounds -> fetch -> markers, focused-mode centring, hidden-member filtering,
// my-location) is tested against real map instances. `createLeafletMap` is wrapped only to hand
// the tests the maps it creates, and to simulate a map that can't be created.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import * as L from 'leaflet';
import { MAP_FAILED_MESSAGE } from '../../../components/leafletMap.js';
import { createTrackedRouter } from '../../../app/routes/test-router.js';
import { MapScreen } from '../MapScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import type { MapEntry } from '../../../data/map.js';

const { mapInstances, failure } = vi.hoisted(() => ({
  mapInstances: [] as L.Map[],
  /** Set by a test to make the next creation fail, as Leaflet does when it can't start. */
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

vi.mock('../../../platform/mapTiles.js', () => ({
  getTileLayerConfig: vi.fn(),
}));

vi.mock('../../../platform/geolocation.js', () => ({
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

const TILES = {
  urlTemplate: 'https://tiles.example/{z}/{x}/{y}{r}.png',
  maxZoom: 20,
  attribution: 'mock credit',
};

/** The entry pins on a map (Leaflet markers that carry a popup; the my-location dot has none). */
function pins(map: L.Map): L.Marker[] {
  const found: L.Marker[] = [];
  map.eachLayer((l) => {
    if (l instanceof L.Marker && l.getPopup()) found.push(l);
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

function popupContent(marker: L.Marker): HTMLElement {
  return marker.getPopup()!.getContent() as HTMLElement;
}

const entryMarker: MapEntry = {
  entry_id: 'e1',
  title: 'Sunrise',
  username: 'alice',
  lat: 51.5,
  lon: -0.1,
  thumbnailUrl: '',
};

beforeEach(() => {
  failure.createFails = false;
  mapInstances.length = 0;
  useHiddenMembersStore.setState({ hidden: [], hydrated: true });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
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

describe('MapScreen', () => {
  it('shows the "unavailable" message instead of a blank screen when no tile key is configured', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(null);
    renderScreen();
    expect(screen.getByText('The map isn’t available right now.')).toBeDefined();
    expect(mapInstances.length).toBe(0);
  });

  it('shows the provider attribution on the map', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(document.querySelector('.leaflet-control-attribution')?.textContent).toContain(
      'mock credit',
    );
  });

  it('remembers where you panned to, and reopens there after Back from an entry (b-oss#190)', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    const first = renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    expect(mapInstances[0].getZoom()).toBe(2); // the world view the first time

    mapInstances[0].setView([55.9, -3.2], 11, { animate: false }); // the user pans and zooms in
    first.unmount(); // opening an entry from a pin unmounts the map screen

    renderScreen(); // Back
    await waitFor(() => expect(mapInstances.length).toBe(2));
    expect(mapInstances[1].getCenter().lat).toBeCloseTo(55.9);
    expect(mapInstances[1].getCenter().lng).toBeCloseTo(-3.2);
    expect(mapInstances[1].getZoom()).toBe(11);
  });

  it('focused mode ignores the remembered view and centres on its own entry', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    const first = renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));
    mapInstances[0].setView([10, 10], 6, { animate: false });
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
    expect(mapInstances[1].getCenter().lat).toBeCloseTo(51.5);
    expect(mapInstances[1].getCenter().lng).toBeCloseTo(-0.1);
    expect(mapInstances[1].getZoom()).toBe(14);
  });

  it('fetches and renders markers for the visible region once the map settles', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([entryMarker]);
    renderScreen();

    await waitFor(() => expect(mapInstances.length).toBe(1));

    await waitFor(() => expect(fetchEntriesInBounds).toHaveBeenCalled());
    const bounds = vi.mocked(fetchEntriesInBounds).mock.calls[0][0];
    expect(bounds.minLat).toBeLessThanOrEqual(bounds.maxLat);
    expect(bounds.minLon).toBeLessThanOrEqual(bounds.maxLon);
    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));
  });

  it('entry markers use b-oss green, not the default marker colour', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([entryMarker]);
    renderScreen();

    await waitFor(() => expect(mapInstances.length).toBe(1));

    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));
    expect((pins(mapInstances[0])[0].options.icon as L.DivIcon).options.html).toContain(
      'fill="#1f4d3a"',
    );
  });

  it('an entry with a thumbnail shows an image in its popup', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([
      { ...entryMarker, thumbnailUrl: 'https://example.com/thumb.jpg' },
    ]);
    renderScreen();

    await waitFor(() => expect(mapInstances.length).toBe(1));

    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));
    const img = popupContent(pins(mapInstances[0])[0]).querySelector('img');
    expect(img).not.toBeNull();
  });

  it('an entry with no thumbnail shows no image in its popup', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([entryMarker]); // thumbnailUrl: ''
    renderScreen();

    await waitFor(() => expect(mapInstances.length).toBe(1));

    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));
    expect(popupContent(pins(mapInstances[0])[0]).querySelector('img')).toBeNull();
  });

  it('shows no markers and no error for an empty region', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    await waitFor(() => expect(fetchEntriesInBounds).toHaveBeenCalled());
    expect(pins(mapInstances[0]).length).toBe(0);
    expect(screen.queryByText(/couldn.?t|error|failed/i)).toBeNull();
  });

  it('shows a non-blocking error message when the region fetch fails', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockRejectedValue(new Error('Network down'));
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    expect(await screen.findByText('Network down')).toBeDefined();
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
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([entryMarker]);
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    await waitFor(() => expect(fetchEntriesInBounds).toHaveBeenCalled());
    expect(pins(mapInstances[0]).length).toBe(0);
  });

  it('focused mode centres on the entry at close zoom instead of the default region', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
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
    expect(mapInstances[0].getCenter().lat).toBeCloseTo(51.5);
    expect(mapInstances[0].getCenter().lng).toBeCloseTo(-0.1);
    expect(mapInstances[0].getZoom()).toBe(14);
  });

  it('focused mode shows only the entry you came from, not every nearby entry (b-oss#142)', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntry } = await import('../../../data/entries.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
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

    await waitFor(() => expect(pins(mapInstances[0]).length).toBe(1));
    const pin = pins(mapInstances[0])[0];
    expect(pin.getLatLng().lat).toBeCloseTo(51.5);
    expect(pin.getLatLng().lng).toBeCloseTo(-0.1);
    expect(pin.isPopupOpen()).toBe(true);
    // Panning/moving the map would normally trigger a bounds fetch (see the 'moveend' handler in
    // general Map-tab mode) — focused mode never registers that handler at all, so triggering it
    // here (if it existed) would be a no-op regardless; the real assertion is that the fetch never
    // happens in the first place.
    expect(fetchEntriesInBounds).not.toHaveBeenCalled();
  });

  it('recentres on the device location when My location is tapped', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { getCurrentPosition } = await import('../../../platform/geolocation.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 10, lon: 20 });
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.click(screen.getByRole('button', { name: 'My location' }));

    await waitFor(() => expect(mapInstances[0].getZoom()).toBe(14));
    expect(mapInstances[0].getCenter().lat).toBeCloseTo(10);
    expect(mapInstances[0].getCenter().lng).toBeCloseTo(20);
  });

  it('"My location" shows a plain dot, not an entry-style pin', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { getCurrentPosition } = await import('../../../platform/geolocation.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    vi.mocked(getCurrentPosition).mockResolvedValue({ lat: 10, lon: 20 });
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    const { default: userEvent } = await import('@testing-library/user-event');
    await userEvent.click(screen.getByRole('button', { name: 'My location' }));

    await waitFor(() => {
      expect(document.querySelector('.map-my-location')).not.toBeNull();
    });
    // The dot has no popup, so it isn't counted as an entry pin.
    expect(pins(mapInstances[0]).length).toBe(0);
  });

  it('puts the locate control over the map (shared with the location picker), not in the header', async () => {
    const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
    const { fetchEntriesInBounds } = await import('../../../data/map.js');
    vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
    vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
    renderScreen();
    await waitFor(() => expect(mapInstances.length).toBe(1));

    const locate = screen.getByRole('button', { name: 'My location' });
    expect(locate.classList.contains('map-locate')).toBe(true);
    expect(locate.closest('ion-header')).toBeNull();
  });

  describe('when the map can\u2019t draw (b-oss#537, #655)', () => {
    it('says so, instead of a blank area, when the map can\u2019t be created', async () => {
      const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
      vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
      failure.createFails = true;
      renderScreen();
      expect(await screen.findByText(MAP_FAILED_MESSAGE)).toBeDefined();
      expect(mapInstances.length).toBe(0);
    });

    it('says so when tiles keep failing and none has loaded, and clears it once one loads', async () => {
      const { getTileLayerConfig } = await import('../../../platform/mapTiles.js');
      const { fetchEntriesInBounds } = await import('../../../data/map.js');
      vi.mocked(getTileLayerConfig).mockReturnValue(TILES);
      vi.mocked(fetchEntriesInBounds).mockResolvedValue([]);
      renderScreen();
      await waitFor(() => expect(mapInstances.length).toBe(1));

      const layer = tileLayerOf(mapInstances[0]);
      act(() => {
        for (let i = 0; i < 4; i++) layer.fire('tileerror');
      });
      expect(await screen.findByText(MAP_FAILED_MESSAGE)).toBeDefined();
      act(() => {
        layer.fire('tileload');
      });
      await waitFor(() => expect(screen.queryByText(MAP_FAILED_MESSAGE)).toBeNull());
    });
  });
});
