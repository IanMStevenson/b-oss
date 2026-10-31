// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-12 — Location Picker. Reuses SCR-04's Leaflet raster map + platform/mapTiles.ts machinery
// (Phase 6, b-oss#655), adapted for a single draggable marker instead of a browsable region with live entry
// markers — no bounds-fetching, no debounce, no entries/search call at all (SCR-12's own API
// touchpoints: none). Reads/writes composeDraftStore.location directly (§6, "Draft state"), same
// as SCR-11 — shared by SCR-10 and SCR-13, no route param needed to know what it's editing.
//
// This route is lazy-loaded in AppRoutes.tsx (not here), same reasoning and same pattern as
// SCR-04: the map library is among the app's larger dependencies and most routes never need it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { IonPage, IonHeader, IonButton, IonContent, IonText } from '@ionic/react';
import { LocateFixed } from 'lucide-react';
import { marker as leafletMarker } from 'leaflet';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { AppHeader } from '../../components/AppHeader.js';
import { createPinIcon } from '../../components/mapPin.js';
import { createLeafletMap, MAP_FAILED_MESSAGE } from '../../components/leafletMap.js';
import '../../components/ComposeForm.css';
import { getTileLayerConfig } from '../../platform/mapTiles.js';
import {
  getCurrentPosition,
  LocationUnavailableError,
  locationControlLabel,
} from '../../platform/geolocation.js';
import { locationControlAvailable } from '../../platform/capabilities.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';

const DEFAULT_CENTER: [number, number] = [20, 0]; // [lat, lon]
// Leaflet zooms are one step above MapLibre's for the same view (256px tiles, not 512px).
const DEFAULT_ZOOM = 2;
const SELECTED_ZOOM = 13;

export function LocationPickerScreen() {
  const navigate = useAppNavigate();
  const draft = useComposeDraftStore((s) => s.draft);
  const patchDraft = useComposeDraftStore((s) => s.patchDraft);
  const tiles = useMemo(() => getTileLayerConfig(), []);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);
  const [mapFailed, setMapFailed] = useState(false);

  // Selection lives in local state (not composeDraftStore directly) while the map is open, so
  // Cancel-via-back can discard an in-progress tap without touching the draft — only Done commits.
  const [selected, setSelected] = useState(draft?.location ?? null);

  function placeMarker(lat: number, lon: number): void {
    setSelected({ lat, lon });
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
    } else {
      const pin = leafletMarker([lat, lon], {
        icon: createPinIcon(),
        draggable: true,
        alt: 'Selected location',
      }).addTo(map);
      pin.on('dragend', () => {
        const pos = pin.getLatLng();
        setSelected({ lat: pos.lat, lon: pos.lng });
      });
      markerRef.current = pin;
    }
  }

  useEffect(() => {
    if (!tiles || !containerRef.current) return;
    let cancelled = false;
    const initialCenter: [number, number] = draft?.location
      ? [draft.location.lat, draft.location.lon]
      : DEFAULT_CENTER;
    const initialZoom = draft?.location ? SELECTED_ZOOM : DEFAULT_ZOOM;

    const map = createLeafletMap(
      containerRef.current,
      { center: initialCenter, zoom: initialZoom },
      tiles,
      {
        onFailed: () => {
          if (!cancelled) setMapFailed(true);
        },
        onRecovered: () => {
          if (!cancelled) setMapFailed(false);
        },
      },
    );
    if (!map) return;
    mapRef.current = map;

    if (draft?.location) placeMarker(draft.location.lat, draft.location.lon);
    map.on('click', (e) => {
      placeMarker(e.latlng.lat, e.latlng.lng);
    });

    // Leaflet caches the container size from construction; follow it if layout settles later.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(containerRef.current);

    return () => {
      cancelled = true;
      ro.disconnect();
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiles]);

  async function handleMyLocation(): Promise<void> {
    setLocationMessage(null);
    try {
      const coords = await getCurrentPosition();
      if (!coords) {
        setLocationMessage("Couldn't determine your location.");
        return;
      }
      placeMarker(coords.lat, coords.lon);
      mapRef.current?.setView([coords.lat, coords.lon], SELECTED_ZOOM, { animate: false });
    } catch (err) {
      setLocationMessage(
        err instanceof LocationUnavailableError ? err.message : 'Location access was refused.',
      );
    }
  }

  function handleClear(): void {
    setSelected(null);
    markerRef.current?.remove();
    markerRef.current = null;
  }

  function handleDone(): void {
    patchDraft({ location: selected, displayLocation: selected != null });
    navigate.goBack();
  }

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Pick location" variant="back" accountIndicator />
      </IonHeader>
      <IonContent>
        {!tiles ? (
          <div className="ion-padding">
            <IonText>
              <p>Maps and location aren&rsquo;t available right now.</p>
            </IonText>
          </div>
        ) : (
          <div className="location-picker">
            <div className="location-map">
              {/* Inline, not a class: Ionic can mount the page before it is in the document, when
                  a stylesheet's `position` doesn't read back and Leaflet would force `relative`. */}
              <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
              {locationControlAvailable() && (
                <button
                  type="button"
                  className="map-locate"
                  onClick={() => void handleMyLocation()}
                  aria-label={locationControlLabel()}
                >
                  <LocateFixed size={22} aria-hidden="true" />
                </button>
              )}
              {mapFailed && (
                <div
                  className="ion-padding"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    background: 'var(--bg)',
                  }}
                >
                  <IonText color="danger">
                    <p style={{ margin: 0 }}>{MAP_FAILED_MESSAGE}</p>
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
            {/* Below the map, not over it: the map's attribution sits at the map's bottom
                edge and used to be covered by an absolutely-positioned footer. */}
            <div className="location-footer">
              <IonButton fill="outline" style={{ flex: 1 }} onClick={handleClear}>
                Clear
              </IonButton>
              <IonButton style={{ flex: 2 }} onClick={handleDone}>
                Done
              </IonButton>
            </div>
          </div>
        )}
      </IonContent>
    </IonPage>
  );
}
