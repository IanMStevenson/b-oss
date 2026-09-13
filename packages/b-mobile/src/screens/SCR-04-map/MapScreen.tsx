// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-04 — Map (FLW-14). MapLibre GL JS renders directly in the WebView (app-architecture.md
// §13) — it isn't a Capacitor plugin, so unlike geolocation/tile-provider config it lives here,
// not behind platform/**, and the platform-boundary ESLint rule doesn't restrict it. It owns its
// own DOM inside `containerRef`; everything React-driven (loading/error banners, the my-location
// button) sits in an absolutely-positioned overlay above it.
//
// Bounds fetching follows the same request-id-supersession pattern as usePagedResource (§7):
// debounce the raw viewport bounds via useDebouncedValue (~450ms, per §7's "debounce generously"
// instruction for region fetches), then let a request-id ref discard any response that's no
// longer the newest — CapacitorHttp can't abort in flight, so a superseded request still
// completes on the wire but its result is simply never rendered.
//
// Entries by a hidden member get no marker at all (rules.md: "a placeholder pin would be
// noise") — filtered out before markers are ever created, never rendered and then hidden.
//
// Entry markers use b-oss's own green (tokens.green800), not blipfoto.com's red — deliberate,
// for consistency with the rest of this app's own branding rather than mirroring the website's
// styling. Each popup shows the entry's thumbnail (resolved through the same resolveImage cache
// every other image in this app goes through) above its title/username, matching what
// blipfoto.com's own map view shows (confirmed live) — previously text-only.
//
// "My location" (handleMyLocation) renders as a plain coloured dot via a custom Marker element,
// not the default teardrop pin shape used for entries — a pin reads as "there's a blip here",
// which isn't true of the device's own position.

import { useCallback, useEffect, useRef, useState } from 'react';
import { IonPage, IonHeader, IonButton, IonContent, IonSpinner, IonText } from '@ionic/react';
import { Map as MapLibreMap, Marker, Popup, setWorkerUrl } from 'maplibre-gl';
import type { ErrorEvent as MapLibreErrorEvent } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';

// maplibre-gl builds its tile-parsing Web Worker's URL dynamically at runtime, which Vite's
// production bundler (Rollup/Rolldown) can't statically detect the way it can a literal
// `new Worker(new URL('./x.js', import.meta.url))` — confirmed live: the worker file was never
// emitted into the production build at all, so requesting it 404s (silently, since SPA-fallback
// serving returns index.html with a 200 instead of a real 404, making the failure invisible).
// A plain `?url` import isn't enough either — confirmed live — since it copies the worker file
// as-is, and the file's own internal `import ... from "./maplibre-gl-shared.mjs"` then 404s in
// production once it's no longer sitting next to that file. `?worker&url` tells Vite to bundle
// the target as a real worker entry point first (resolving its own imports into a self-contained
// chunk) and hand back the URL of that bundled output; setWorkerUrl tells maplibre-gl to use it
// instead of computing its own. Module-scoped, not per-render: this is global maplibre-gl
// configuration, must run once before any Map is constructed.
setWorkerUrl(maplibreWorkerUrl);
import { tokens } from '@b-oss/b-visual';
import { AppHeader } from '../../components/AppHeader.js';
import { AccountIndicator } from '../../components/AccountIndicator.js';
import { getMapStyleUrl } from '../../platform/mapTiles.js';
import { getCurrentPosition } from '../../platform/geolocation.js';
import { resolveImage } from '../../platform/imageCache.js';
import { fetchEntriesInBounds } from '../../data/map.js';
import type { MapBounds, MapEntry } from '../../data/map.js';
import { fetchEntry } from '../../data/entries.js';
import { useDebouncedValue } from '../../data/useDebounce.js';
import { useHiddenMembers } from '../../state/hiddenMembersStore.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';

interface MapScreenProps {
  /** From the `?entry=<id>` query param (app-architecture.md §5's route table) — AppRoutes.tsx
   * parses `location.search` itself, since screens may not import react-router. */
  focusedEntryId?: string;
}

const DEBOUNCE_MS = 450;
const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1.5;
const FOCUSED_ZOOM = 13;

type EntriesStatus = 'loading' | 'loaded' | 'empty' | 'error';

export function MapScreen({ focusedEntryId }: MapScreenProps) {
  const navigate = useAppNavigate();
  const hiddenMembers = useHiddenMembers();
  const styleUrl = getMapStyleUrl();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<globalThis.Map<string, Marker>>(new globalThis.Map<string, Marker>());
  const myLocationMarkerRef = useRef<Marker | null>(null);
  const requestIdRef = useRef(0);
  const focusedPopupOpenedRef = useRef(false);

  // Always-current refs for values read from inside imperative MapLibre event handlers/DOM
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
  const [mapError, setMapError] = useState<string | null>(null);

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
        button.style.cssText = 'display:flex;flex-direction:column;gap:4px;padding:0;';
        button.addEventListener('click', () =>
          navigateRef.current.push(`/entry/${entry.entry_id}`),
        );

        let img: HTMLImageElement | null = null;
        if (entry.thumbnailUrl) {
          img = document.createElement('img');
          img.alt = '';
          img.style.cssText = 'width:100%;max-width:160px;border-radius:4px;display:block;';
          button.appendChild(img);
          void resolveImage(entry.thumbnailUrl).then((src) => {
            // Guard against a stale async resolution setting src on an <img> whose marker was
            // already torn down (e.g. the bounds changed again before this resolved).
            if (markersRef.current.get(entry.entry_id) === marker) img!.src = src;
          });
        }

        const label = document.createElement('span');
        label.textContent = `${entry.title || 'Untitled'} — ${entry.username}`;
        button.appendChild(label);

        const content = document.createElement('div');
        content.appendChild(button);

        const popup = new Popup({ closeButton: false }).setDOMContent(content);
        const marker = new Marker({ color: tokens.green800 })
          .setLngLat([entry.lon, entry.lat])
          .setPopup(popup)
          .addTo(map);
        markersRef.current.set(entry.entry_id, marker);

        if (focusedEntryId && entry.entry_id === focusedEntryId && !focusedPopupOpenedRef.current) {
          marker.togglePopup();
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
    if (!styleUrl || !containerRef.current) return;
    const url = styleUrl; // narrowed to `string`; TS can't narrow a closed-over const inside init()
    let cancelled = false;
    let map: MapLibreMap | null = null;

    async function init(): Promise<void> {
      let center = DEFAULT_CENTER;
      let zoom = DEFAULT_ZOOM;
      let focusedEntry: MapEntry | null = null;
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

      map = new MapLibreMap({ container: containerRef.current, style: url, center, zoom });
      mapRef.current = map;

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
        map.on('error', (e: MapLibreErrorEvent) => {
          if (cancelled) return;
          setMapError(e.error?.message ?? 'Could not load the map.');
        });
        return;
      }

      function handleMoveEnd(): void {
        const b = map!.getBounds();
        setBounds({
          minLat: b.getSouth(),
          maxLat: b.getNorth(),
          minLon: b.getWest(),
          maxLon: b.getEast(),
        });
      }
      map.on('load', handleMoveEnd);
      map.on('moveend', handleMoveEnd);
      map.on('error', (e: MapLibreErrorEvent) => {
        if (cancelled) return;
        setMapError(e.error?.message ?? 'Could not load the map.');
      });
    }

    void init();

    return () => {
      cancelled = true;
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [styleUrl, focusedEntryId, renderMarkers]);

  // MapLibre reads the container's size once, at construction — if IonContent/IonPage's own
  // layout hasn't settled yet at that exact moment (a real, observed race, not hypothetical),
  // containerRef.current can report 0 (or the wrong) size, and MapLibre silently falls back to
  // its built-in 400x300 default canvas. Nothing about the container's later, correct layout
  // ever tells the map to catch up on its own — same class of "container size settles after
  // mount" gotcha ThumbnailGrid's own useContainerSize (ThumbnailGrid.tsx) already exists to
  // solve, just needing map.resize() as the side effect here instead of stored state.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      mapRef.current?.resize();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Fetch entries for the debounced bounds and render their markers. Request-id-superseded like
  // every other resource hook (§7) — a pan mid-fetch discards the now-stale response instead of
  // aborting it, since CapacitorHttp can't abort natively.
  useEffect(() => {
    if (!debouncedBounds) return;
    const id = ++requestIdRef.current;
    setEntriesStatus('loading');
    fetchEntriesInBounds(debouncedBounds).then(
      (entries) => {
        if (id !== requestIdRef.current) return;
        renderMarkers(entries);
        const visibleCount = entries.filter(
          (e) => !hiddenMembersRef.current.includes(e.username),
        ).length;
        setEntriesStatus(visibleCount === 0 ? 'empty' : 'loaded');
        setEntriesError(null);
      },
      (err: unknown) => {
        if (id !== requestIdRef.current) return;
        // Non-blocking per SCR-04: the map (and its already-shown markers, if any) stay usable;
        // the next pan/zoom tries again on its own, no explicit retry action.
        setEntriesStatus('error');
        setEntriesError(err instanceof Error ? err.message : 'Could not load entries.');
      },
    );
  }, [debouncedBounds, renderMarkers]);

  async function handleMyLocation(): Promise<void> {
    setLocationMessage(null);
    try {
      const coords = await getCurrentPosition();
      if (!coords) {
        setLocationMessage("Couldn't determine your location.");
        return;
      }
      mapRef.current?.jumpTo({ center: [coords.lon, coords.lat], zoom: FOCUSED_ZOOM });

      // A plain dot, not an entry-style pin — a pin reads as "there's a blip here", which isn't
      // true of the device's own position. Confirmed live: recentring alone gave no visual
      // confirmation of where "my location" actually landed.
      const map = mapRef.current;
      if (map) {
        myLocationMarkerRef.current?.remove();
        const dot = document.createElement('div');
        dot.setAttribute('aria-label', 'Your location');
        dot.style.cssText =
          'width:14px;height:14px;border-radius:50%;background:#4285f4;' +
          'border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,0.45);';
        myLocationMarkerRef.current = new Marker({ element: dot })
          .setLngLat([coords.lon, coords.lat])
          .addTo(map);
      }
    } catch {
      setLocationMessage('Location access was refused.');
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title="Map"
          end={
            <>
              <IonButton
                onClick={() => void handleMyLocation()}
                disabled={!styleUrl}
                aria-label="My location"
              >
                My location
              </IonButton>
              <AccountIndicator />
            </>
          }
        />
      </IonHeader>
      <IonContent>
        {!styleUrl ? (
          <div className="ion-padding">
            <p>The map isn&rsquo;t available right now.</p>
          </div>
        ) : (
          <div style={{ position: 'relative', height: '100%' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
            {mapError && (
              <div
                className="ion-padding"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'var(--bg)' }}
              >
                <IonText color="danger">
                  <p>{mapError}</p>
                </IonText>
              </div>
            )}
            {entriesStatus === 'loading' && (
              <div style={{ position: 'absolute', top: 8, left: 8 }}>
                <IonSpinner />
              </div>
            )}
            {entriesStatus === 'error' && entriesError && (
              <div
                className="ion-padding"
                style={{ position: 'absolute', top: 0, left: 0, right: 0, background: 'var(--bg)' }}
              >
                <IonText color="danger">
                  <p>{entriesError}</p>
                </IonText>
              </div>
            )}
            {locationMessage && (
              <div
                className="ion-padding"
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  background: 'var(--bg)',
                }}
              >
                <IonText color="medium">
                  <p>{locationMessage}</p>
                </IonText>
              </div>
            )}
          </div>
        )}
      </IonContent>
    </IonPage>
  );
}
