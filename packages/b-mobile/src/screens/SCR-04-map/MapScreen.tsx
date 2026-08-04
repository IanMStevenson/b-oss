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

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonMenuButton,
  IonButton,
  IonContent,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { Map as MapLibreMap, Marker, Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyleUrl } from '../../platform/mapTiles.js';
import { getCurrentPosition } from '../../platform/geolocation.js';
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

        const content = document.createElement('div');
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = `${entry.title || 'Untitled'} — ${entry.username}`;
        button.addEventListener('click', () =>
          navigateRef.current.push(`/entry/${entry.entry_id}`),
        );
        content.appendChild(button);

        const popup = new Popup({ closeButton: false }).setDOMContent(content);
        const marker = new Marker().setLngLat([entry.lon, entry.lat]).setPopup(popup).addTo(map);
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
      if (focusedEntryId) {
        try {
          const loaded = await fetchEntry(focusedEntryId);
          if (loaded.entry.location) {
            center = [loaded.entry.location.lon, loaded.entry.location.lat];
            zoom = FOCUSED_ZOOM;
          }
        } catch {
          // Fall back to the default region — a genuine fetch failure for this entry already
          // has its own surface on SCR-06, which is where the user came from.
        }
      }
      if (cancelled || !containerRef.current) return;

      map = new MapLibreMap({ container: containerRef.current, style: url, center, zoom });
      mapRef.current = map;

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
    }

    void init();

    return () => {
      cancelled = true;
      map?.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, [styleUrl, focusedEntryId]);

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
    } catch {
      setLocationMessage('Location access was refused.');
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonMenuButton />
          </IonButtons>
          <IonTitle>Map</IonTitle>
          <IonButtons slot="end">
            <IonButton
              onClick={() => void handleMyLocation()}
              disabled={!styleUrl}
              aria-label="My location"
            >
              My location
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {!styleUrl ? (
          <div className="ion-padding">
            <p>The map isn&rsquo;t available right now.</p>
          </div>
        ) : (
          <div style={{ position: 'relative', height: '100%' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
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
