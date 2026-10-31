// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-04 — Map (FLW-14). Leaflet over raster tiles renders directly in the WebView
// (app-architecture.md §13, b-oss#655) — no WebGL, shaders or web workers, so it can't fail
// silently the way the MapLibre map did on some devices. Leaflet isn't a Capacitor plugin, so
// unlike geolocation/tile-provider config it lives here, not behind platform/**. It owns its own DOM inside
// `containerRef`; everything React-driven (loading/error banners, the my-location button) sits in
// an absolutely-positioned overlay above it.
//
// Bounds fetching follows the same request-id-supersession pattern as usePagedResource (§7):
// debounce the raw viewport bounds via useDebouncedValue (~450ms, per §7's "debounce generously"
// instruction for region fetches), then let a request-id ref discard any response that's no
// longer the newest — CapacitorHttp can't abort in flight, so a superseded request still
// completes on the wire but its result is simply never rendered.
//
// Entries by a hidden member get no marker at all (a placeholder pin would be noise; BEHAVIOUR.md,
// Hidden members) — filtered out before markers are ever created, never rendered and then hidden.
//
// Entry markers use b-oss's own green (components/mapPin.ts), not blipfoto.com's red — deliberate,
// for consistency with the rest of this app's own branding rather than mirroring the website's
// styling. Each popup shows the entry's thumbnail (resolved through the same resolveImage cache
// every other image in this app goes through) above its title/username, matching what
// blipfoto.com's own map view shows (confirmed live) — previously text-only.
//
// "My location" (handleMyLocation) renders as a plain coloured dot (a divIcon circle marker),
// not the default teardrop pin shape used for entries — a pin reads as "there's a blip here",
// which isn't true of the device's own position.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IonPage, IonHeader, IonContent, IonSpinner, IonText } from '@ionic/react';
import { marker as leafletMarker, popup as leafletPopup, divIcon } from 'leaflet';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { createPinIcon } from '../../components/mapPin.js';
import { LocateFixed } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader.js';
import { getTileLayerConfig } from '../../platform/mapTiles.js';
import { createLeafletMap, MAP_FAILED_MESSAGE } from '../../components/leafletMap.js';
import { getCurrentPosition, LocationUnavailableError } from '../../platform/geolocation.js';
import { resolveImage } from '../../platform/imageCache.js';
import { fetchEntriesInBounds, requestRanges, type FetchStats } from '../../data/map.js';
import {
  formatFetchLine,
  formatLoadLine,
  formatSizeLine,
  logMapLine,
  resetMapLog,
  type MapSnapshot,
} from '../../diagnostics/mapLog.js';
import { hasErrorDiagnostics } from '../../platform/diagnostics.js';
import type { MapBounds, MapEntry } from '../../data/map.js';
import { fetchEntry } from '../../data/entries.js';
import { useDebouncedValue } from '../../data/useDebounce.js';
import { resumeGet, resumeSet } from '../../data/resumeCache.js';
import { useHiddenMembers } from '../../state/hiddenMembersStore.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { errorMessageOf } from '../../data/errors.js';
import { locationControlAvailable } from '../../platform/capabilities.js';

interface MapScreenProps {
  /** From the `?entry=<id>` query param (app-architecture.md §5's route table) — AppRoutes.tsx
   * parses `location.search` itself, since screens may not import react-router. */
  focusedEntryId?: string;
}

const DEBOUNCE_MS = 450;
const DEFAULT_CENTER: [number, number] = [0, 20];
// Leaflet zooms are one step above MapLibre's for the same view (256px tiles, not 512px).
const DEFAULT_ZOOM = 2;
const FOCUSED_ZOOM = 14;
/** Where the free-browsing map was last panned/zoomed to, so Back from an entry you opened off a
 * pin returns to the same view instead of the whole world (b-oss#190). Not used in focused mode,
 * which always centres on its own entry. */
const MAP_VIEW_KEY = 'map:view';
interface MapView {
  center: [number, number];
  zoom: number;
}

const ENTRIES_FAILED_MESSAGE = 'Could not load entries for this area.';

type EntriesStatus = 'loading' | 'loaded' | 'empty' | 'error';

export function MapScreen({ focusedEntryId }: MapScreenProps) {
  const navigate = useAppNavigate();
  const hiddenMembers = useHiddenMembers();
  // The base map is always light (b-oss#655), so a theme change doesn't touch it.
  const tiles = useMemo(() => getTileLayerConfig(), []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map<string, Marker>());
  const myLocationMarkerRef = useRef<Marker | null>(null);
  const requestIdRef = useRef(0);
  const focusedPopupOpenedRef = useRef(false);
  // Desktop diagnostics only (b-oss#697): how often the map was told its container's size changed,
  // and how many entry requests this screen has made.
  const invalidatedRef = useRef(0);
  const requestCountRef = useRef(0);
  const snapshot = useCallback((): MapSnapshot | null => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return null;
    const size = map.getSize();
    const c = map.getCenter();
    const b = map.getBounds();
    return {
      container: { w: el.clientWidth, h: el.clientHeight },
      map: { w: size.x, h: size.y },
      zoom: map.getZoom(),
      center: { lat: c.lat, lng: c.lng },
      bounds: {
        minLat: b.getSouth(),
        maxLat: b.getNorth(),
        minLon: b.getWest(),
        maxLon: b.getEast(),
      },
      invalidated: invalidatedRef.current,
    };
  }, []);

  // Always-current refs for values read from inside imperative Leaflet event handlers/DOM
  // callbacks, which close over whatever was current when they were registered — same technique
  // useResource.ts's fetcherRef uses to keep an effect-registered callback reading fresh state.
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const hiddenMembersRef = useRef(hiddenMembers);
  hiddenMembersRef.current = hiddenMembers;

  const [bounds, setBounds] = useState<MapBounds | null>(null);
  const debouncedBounds = useDebouncedValue(bounds, DEBOUNCE_MS);
  const [entriesStatus, setEntriesStatus] = useState<EntriesStatus>('loading');
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  // Memoized on focusedEntryId alone (everything else it reads comes from refs) so the
  // bounds-fetch effect below can safely list it as a dependency without refiring on every
  // render — its identity is otherwise stable across the component's lifetime.
  const renderMarkers = useCallback(
    (entries: MapEntry[]): void => {
      const map = mapRef.current;
      if (!map) return;
      for (const marker of markersRef.current.values()) marker.remove();
      markersRef.current.clear();

      for (const entry of entries) {
        if (hiddenMembersRef.current.includes(entry.username)) continue;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'entry-popup-button';
        button.addEventListener('click', () =>
          navigateRef.current.push(`/entry/${entry.entry_id}`),
        );

        let img: HTMLImageElement | null = null;
        if (entry.thumbnailUrl) {
          img = document.createElement('img');
          img.alt = '';
          img.className = 'entry-popup-thumb';
          button.appendChild(img);
          void resolveImage(entry.thumbnailUrl).then((src) => {
            // Guard against a stale async resolution setting src on an <img> whose marker was
            // already torn down (e.g. the bounds changed again before this resolved).
            if (markersRef.current.get(entry.entry_id) === marker) img!.src = src;
          });
        }

        const title = document.createElement('span');
        title.className = 'entry-popup-title';
        title.textContent = entry.title || 'Untitled';
        const user = document.createElement('span');
        user.className = 'entry-popup-user';
        user.textContent = entry.username;
        button.append(title, user);

        const content = document.createElement('div');
        content.appendChild(button);

        const marker = leafletMarker([entry.lat, entry.lon], {
          icon: createPinIcon(),
          alt: entry.title || 'Untitled',
        })
          .bindPopup(
            leafletPopup({
              closeButton: false,
              className: 'entry-popup',
              minWidth: 120,
            }).setContent(content),
          )
          .addTo(map);
        markersRef.current.set(entry.entry_id, marker);

        if (focusedEntryId && entry.entry_id === focusedEntryId && !focusedPopupOpenedRef.current) {
          marker.openPopup();
          focusedPopupOpenedRef.current = true;
        }
      }
    },
    [focusedEntryId],
  );

  // Mount the map once the style URL and container are ready. Focused mode waits for the
  // target entry's coordinates before the Map is even constructed, so it never flashes the
  // default region first.
  useEffect(() => {
    if (!tiles || !containerRef.current) return;
    const tileConfig = tiles; // narrowed; TS can't narrow a closed-over const inside init()
    let cancelled = false;
    let map: LeafletMap | null = null;

    async function init(): Promise<void> {
      let center = DEFAULT_CENTER;
      let zoom = DEFAULT_ZOOM;
      let focusedEntry: MapEntry | null = null;
      if (!focusedEntryId) {
        const savedView = resumeGet<MapView>(MAP_VIEW_KEY);
        if (savedView) {
          center = savedView.center;
          zoom = savedView.zoom;
        }
      }
      if (focusedEntryId) {
        try {
          const loaded = await fetchEntry(focusedEntryId);
          if (loaded.entry.location) {
            center = [loaded.entry.location.lon, loaded.entry.location.lat];
            zoom = FOCUSED_ZOOM;
            focusedEntry = {
              entry_id: focusedEntryId,
              title: loaded.entry.title,
              username: loaded.entry.username,
              lat: loaded.entry.location.lat,
              lon: loaded.entry.location.lon,
              thumbnailUrl: loaded.entry.images.thumbnail ?? '',
            };
          }
        } catch {
          // Fall back to the default region — a genuine fetch failure for this entry already
          // has its own surface on SCR-06, which is where the user came from.
        }
      }
      if (cancelled || !containerRef.current) return;

      map = createLeafletMap(
        containerRef.current,
        { center: [center[1], center[0]], zoom },
        tileConfig,
        {
          onFailed: () => {
            if (!cancelled) setMapFailed(true);
          },
          onRecovered: () => {
            if (!cancelled) setMapFailed(false);
          },
        },
      );
      if (!map) {
        setEntriesStatus('empty');
        return;
      }
      mapRef.current = map;
      if (hasErrorDiagnostics()) {
        resetMapLog();
        invalidatedRef.current = 0;
        requestCountRef.current = 0;
        const snap = snapshot();
        if (snap) logMapLine(formatLoadLine(snap));
        const onSize = (): void => {
          const after = snapshot();
          if (after) logMapLine(formatSizeLine('leaflet-resize', after));
        };
        map.on('resize', onSize);
      }

      // Focused mode (reached from a specific entry): show only that one pin, not a general
      // area browse — confirmed live, the bounds query below plotting every nearby entry
      // alongside it was unwanted (b-oss#142). General Map-tab browsing (no focusedEntryId)
      // keeps the bounds-query behaviour below unchanged.
      if (focusedEntryId) {
        if (focusedEntry) {
          renderMarkers([focusedEntry]);
          setEntriesStatus('loaded');
        } else {
          setEntriesStatus('empty');
        }
        return;
      }

      function handleMoveEnd(): void {
        const c = map!.getCenter();
        resumeSet<MapView>(MAP_VIEW_KEY, { center: [c.lng, c.lat], zoom: map!.getZoom() });
        const b = map!.getBounds();
        setBounds({
          minLat: b.getSouth(),
          maxLat: b.getNorth(),
          minLon: b.getWest(),
          maxLon: b.getEast(),
        });
      }
      // Leaflet has already fired its own `load` by the time the map is returned, so the first
      // bounds are read here; `resize` covers the container settling after construction.
      handleMoveEnd();
      map.on('moveend', handleMoveEnd);
      map.on('resize', handleMoveEnd);
    }

    void init();

    return () => {
      cancelled = true;
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [tiles, focusedEntryId, renderMarkers, snapshot]);

  // Leaflet reads the container's size once, at construction, and caches it — if IonContent/
  // IonPage's own layout hasn't settled yet at that exact moment (a real, observed race with the
  // previous map, not hypothetical), the map would keep a wrong size. Nothing about the
  // container's later, correct layout tells the map to catch up on its own — same class of
  // "container size settles after mount" gotcha ThumbnailGrid's own useContainerSize
  // (ThumbnailGrid.tsx) already exists to solve, just needing map.invalidateSize() as the side
  // effect here instead of stored state.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const map = mapRef.current;
      if (!map) return;
      invalidatedRef.current += 1;
      map.invalidateSize();
      if (hasErrorDiagnostics()) {
        const snap = snapshot();
        if (snap) logMapLine(formatSizeLine('observer', snap));
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [snapshot]);

  // Fetch entries for the debounced bounds and render their markers. Request-id-superseded like
  // every other resource hook (§7) — a pan mid-fetch discards the now-stale response instead of
  // aborting it, since CapacitorHttp can't abort natively.
  useEffect(() => {
    if (!debouncedBounds) return;
    const id = ++requestIdRef.current;
    requestCountRef.current += 1;
    setEntriesStatus('loading');
    const stats: FetchStats = { received: 0, unplottable: [] };
    fetchEntriesInBounds(debouncedBounds, stats).then(
      (entries) => {
        if (id !== requestIdRef.current) return;
        renderMarkers(entries);
        if (hasErrorDiagnostics()) {
          const snap = snapshot();
          if (snap) {
            logMapLine(
              formatFetchLine(
                {
                  requestId: id,
                  ranges: requestRanges(debouncedBounds),
                  received: stats.received,
                  entries: entries.length,
                  undrawable: stats.unplottable,
                  markers: markersRef.current.size,
                  requestCount: requestCountRef.current,
                },
                snap,
              ),
            );
          }
        }
        const visibleCount = entries.filter(
          (e) => !hiddenMembersRef.current.includes(e.username),
        ).length;
        setEntriesStatus(visibleCount === 0 ? 'empty' : 'loaded');
        setEntriesError(null);
      },
      (err: unknown) => {
        if (id !== requestIdRef.current) return;
        // Non-blocking per SCR-04: the map (and its already-shown markers, if any) stay usable;
        // the next pan/zoom tries again on its own, and "Try again" re-requests the same area.
        // Never the API's own text above the map (b-oss#669): a fixed message, the detail logged.
        console.warn('[map] entries request failed', errorMessageOf(err, 'unknown error'));
        setEntriesStatus('error');
        setEntriesError(ENTRIES_FAILED_MESSAGE);
      },
    );
  }, [debouncedBounds, renderMarkers, snapshot]);

  async function handleMyLocation(): Promise<void> {
    setLocationMessage(null);
    try {
      const coords = await getCurrentPosition();
      if (!coords) {
        setLocationMessage("Couldn't determine your location.");
        return;
      }
      mapRef.current?.setView([coords.lat, coords.lon], FOCUSED_ZOOM, { animate: false });

      // A plain dot, not an entry-style pin — a pin reads as "there's a blip here", which isn't
      // true of the device's own position. Confirmed live: recentring alone gave no visual
      // confirmation of where "my location" actually landed.
      const map = mapRef.current;
      if (map) {
        myLocationMarkerRef.current?.remove();
        myLocationMarkerRef.current = leafletMarker([coords.lat, coords.lon], {
          icon: divIcon({
            html: '<div class="map-my-location" role="img" aria-label="Your location"></div>',
            className: 'map-my-location-icon',
            iconSize: [18, 18],
            iconAnchor: [9, 9],
          }),
          interactive: false,
          keyboard: false,
        }).addTo(map);
      }
    } catch (err) {
      setLocationMessage(
        err instanceof LocationUnavailableError ? err.message : 'Location access was refused.',
      );
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Map" />
      </IonHeader>
      <IonContent>
        {!tiles ? (
          <div className="ion-padding">
            <p>The map isn&rsquo;t available right now.</p>
          </div>
        ) : (
          <div style={{ position: 'relative', height: '100%' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
            {locationControlAvailable() && (
              <button
                type="button"
                className="map-locate"
                onClick={() => void handleMyLocation()}
                aria-label="My location"
              >
                <LocateFixed size={22} aria-hidden="true" />
              </button>
            )}
            {mapFailed && (
              <div
                className="ion-padding"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'var(--bg)' }}
              >
                <IonText color="danger">
                  <p>{MAP_FAILED_MESSAGE}</p>
                </IonText>
              </div>
            )}
            {entriesStatus === 'loading' && (
              <div style={{ position: 'absolute', top: 12, left: 58 }}>
                <IonSpinner />
              </div>
            )}
            {entriesStatus === 'error' && entriesError && (
              <div
                className="ion-padding"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'var(--bg)' }}
              >
                <IonText color="danger">
                  <p>
                    {entriesError}{' '}
                    <button
                      type="button"
                      className="map-retry"
                      onClick={() => setBounds((b) => (b ? { ...b } : b))}
                    >
                      Try again
                    </button>
                  </p>
                </IonText>
              </div>
            )}
            {locationMessage && (
              <div className="map-message">
                <IonText color="medium">
                  <p style={{ margin: 0 }}>{locationMessage}</p>
                </IonText>
              </div>
            )}
          </div>
        )}
      </IonContent>
    </IonPage>
  );
}
