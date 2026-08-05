// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// jsdom has no WebGL/canvas support, so maplibre-gl itself can't run here (same class of gap as
// "no headless browser available in this sandbox" — see RESUME.md's gotchas). `maplibre-gl` is
// mocked wholesale with a minimal fake Map/Marker/Popup that records what the component asked of
// it, which is enough to test MapScreen's own logic (bounds -> fetch -> markers, focused-mode
// centring, hidden-member filtering, my-location) without needing a real renderer — the same
// "mock the thing at the boundary" approach every platform/** consumer test already uses, applied
// to a WebView-rendered library instead of a Capacitor plugin.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
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
    constructor() {
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
    options: { container: HTMLElement; style: string; center: [number, number]; zoom: number };
    handlers: Record<string, Array<() => void>> = {};
    removed = false;
    jumpToCalls: Array<{ center: [number, number]; zoom: number }> = [];
    constructor(options: {
      container: HTMLElement;
      style: string;
      center: [number, number];
      zoom: number;
    }) {
      this.options = options;
      mapInstances.push(this);
    }
    on(event: string, handler: () => void) {
      (this.handlers[event] ??= []).push(handler);
      return this;
    }
    getBounds() {
      return { getSouth: () => -1, getNorth: () => 1, getWest: () => -1, getEast: () => 1 };
    }
    jumpTo(opts: { center: [number, number]; zoom: number }) {
      this.jumpToCalls.push(opts);
    }
    remove() {
      this.removed = true;
    }
    trigger(event: string): void {
      (this.handlers[event] ?? []).forEach((h) => h());
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
}));

vi.mock('../../../platform/mapTiles.js', () => ({
  getMapStyleUrl: vi.fn(),
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

const entryMarker: MapEntry = {
  entry_id: 'e1',
  title: 'Sunrise',
  username: 'alice',
  lat: 51.5,
  lon: -0.1,
};

beforeEach(() => {
  mapInstances.length = 0;
  markerInstances.length = 0;
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen(focusedEntryId?: string) {
  const history = createMemoryHistory();
  const utils = render(
    <Router history={history}>
      <OverlayProvider>
        <OverlayHost />
        <MapScreen focusedEntryId={focusedEntryId} />
      </OverlayProvider>
    </Router>,
  );
  return { history, ...utils };
}

describe('MapScreen', () => {
  it('shows the "unavailable" message instead of a blank screen when no tile key is configured', async () => {
    const { getMapStyleUrl } = await import('../../../platform/mapTiles.js');
    vi.mocked(getMapStyleUrl).mockReturnValue(null);
    renderScreen();
    expect(screen.getByText('The map isn’t available right now.')).toBeDefined();
    expect(mapInstances.length).toBe(0);
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
    useHiddenMembersStore.setState({ hiddenByAccount: { a1: ['alice'] }, hydrated: true });
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
    await userEvent.click(screen.getByText('My location', { selector: 'ion-button' }));

    await waitFor(() =>
      expect(mapInstances[0].jumpToCalls).toContainEqual({ center: [20, 10], zoom: 13 }),
    );
  });
});
