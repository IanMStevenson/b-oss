// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-12 — Location Picker. Reuses SCR-04's MapLibre GL JS + platform/mapTiles.ts machinery
// (Phase 6), adapted for a single draggable marker instead of a browsable region with live entry
// markers — no bounds-fetching, no debounce, no entries/search call at all (SCR-12's own API
// touchpoints: none). Reads/writes composeDraftStore.location directly (§6, "Draft state"), same
// as SCR-11 — shared by SCR-10 and SCR-13, no route param needed to know what it's editing.
//
// This route is lazy-loaded in AppRoutes.tsx (not here), same reasoning and same pattern as
// SCR-04: MapLibre is by far the app's largest dependency and most routes never need it.

import { useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonText,
} from '@ionic/react';
import { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { getMapStyleUrl } from '../../platform/mapTiles.js';
import { getCurrentPosition } from '../../platform/geolocation.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';

const DEFAULT_CENTER: [number, number] = [0, 20];
const DEFAULT_ZOOM = 1.5;
const SELECTED_ZOOM = 12;

export function LocationPickerScreen() {
  const navigate = useAppNavigate();
  const draft = useComposeDraftStore((s) => s.draft);
  const patchDraft = useComposeDraftStore((s) => s.patchDraft);
  const styleUrl = getMapStyleUrl();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const [locationMessage, setLocationMessage] = useState<string | null>(null);

  // Selection lives in local state (not composeDraftStore directly) while the map is open, so
  // Cancel-via-back can discard an in-progress tap without touching the draft — only Done commits.
  const [selected, setSelected] = useState(draft?.location ?? null);

  function placeMarker(lat: number, lon: number): void {
    setSelected({ lat, lon });
    const map = mapRef.current;
    if (!map) return;
    if (markerRef.current) {
      markerRef.current.setLngLat([lon, lat]);
    } else {
      markerRef.current = new Marker({ draggable: true }).setLngLat([lon, lat]).addTo(map);
      markerRef.current.on('dragend', () => {
        const pos = markerRef.current!.getLngLat();
        setSelected({ lat: pos.lat, lon: pos.lng });
      });
    }
  }

  useEffect(() => {
    if (!styleUrl || !containerRef.current) return;
    const url = styleUrl;
    let cancelled = false;
    const initialCenter: [number, number] = draft?.location
      ? [draft.location.lon, draft.location.lat]
      : DEFAULT_CENTER;
    const initialZoom = draft?.location ? SELECTED_ZOOM : DEFAULT_ZOOM;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: url,
      center: initialCenter,
      zoom: initialZoom,
    });
    mapRef.current = map;

    map.on('load', () => {
      if (cancelled) return;
      if (draft?.location) placeMarker(draft.location.lat, draft.location.lon);
    });
    map.on('click', (e) => {
      placeMarker(e.lngLat.lat, e.lngLat.lng);
    });

    return () => {
      cancelled = true;
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [styleUrl]);

  async function handleMyLocation(): Promise<void> {
    setLocationMessage(null);
    try {
      const coords = await getCurrentPosition();
      if (!coords) {
        setLocationMessage("Couldn't determine your location.");
        return;
      }
      placeMarker(coords.lat, coords.lon);
      mapRef.current?.jumpTo({ center: [coords.lon, coords.lat], zoom: SELECTED_ZOOM });
    } catch {
      setLocationMessage('Location access was refused.');
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
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={() => navigate.goBack()}>Cancel</IonButton>
          </IonButtons>
          <IonTitle>Pick location</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={handleClear}>Clear</IonButton>
            <IonButton onClick={handleDone}>Done</IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {!styleUrl ? (
          <div className="ion-padding">
            <IonText>
              <p>Maps and location aren&rsquo;t available right now.</p>
            </IonText>
          </div>
        ) : (
          <div style={{ position: 'relative', height: '100%' }}>
            <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
            <div style={{ position: 'absolute', top: 8, right: 8 }}>
              <IonButton onClick={() => void handleMyLocation()} aria-label="My location">
                My location
              </IonButton>
            </div>
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
