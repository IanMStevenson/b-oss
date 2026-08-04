// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-07 — Full-screen Photo (view-only, reached from SCR-06's photo tap). Standard resolution is
// the ceiling per AppSpec — this app is never served higher-res/original images, so there's no
// "view original" affordance to build. Fetches the entry itself via useLiveEntry rather than
// receiving it from SCR-06: the spec's "No API calls" means no *dedicated* full-photo endpoint
// (the image URL comes from the entry, not a separate call), not literally zero network activity.
// Refetching keeps this screen deep-link-resilient (same entryId-prop pattern as SCR-06) instead
// of depending on router location.state, which would break on a direct link/refresh.

import { useState } from 'react';
import { IonPage, IonContent, IonSpinner, IonText, IonButton } from '@ionic/react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { useLiveEntry } from '../../data/useLiveEntry.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';

interface PhotoScreenProps {
  entryId: string;
}

export function PhotoScreen({ entryId }: PhotoScreenProps) {
  const navigate = useAppNavigate();
  const { entryState, retry } = useLiveEntry(entryId);
  const [imageError, setImageError] = useState(false);

  return (
    <IonPage>
      <IonContent fullscreen style={{ '--background': '#000' }}>
        <IonButton
          fill="clear"
          onClick={() => navigate.replace(`/entry/${entryId}`)}
          style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, '--color': '#fff' }}
          aria-label="Close"
        >
          ✕
        </IonButton>

        {entryState.status === 'loading' && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '100%',
            }}
          >
            <IonSpinner color="light" />
          </div>
        )}

        {entryState.status === 'error' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              gap: 12,
            }}
          >
            <IonText color="light">
              <p>{entryState.message}</p>
            </IonText>
            <IonButton onClick={retry}>Retry</IonButton>
          </div>
        )}

        {entryState.status === 'loaded' && (
          <>
            {!entryState.data.images.image || imageError ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                  gap: 12,
                }}
              >
                <IonText color="light">
                  <p>This photo couldn't be loaded.</p>
                </IonText>
                <IonButton onClick={() => setImageError(false)}>Retry</IonButton>
              </div>
            ) : (
              <TransformWrapper doubleClick={{ mode: 'toggle' }}>
                <TransformComponent wrapperStyle={{ width: '100%', height: '100%' }}>
                  <img
                    src={entryState.data.images.image}
                    alt={entryState.data.title}
                    onError={() => setImageError(true)}
                    style={{ width: '100vw', height: '100vh', objectFit: 'contain' }}
                  />
                </TransformComponent>
              </TransformWrapper>
            )}
          </>
        )}
      </IonContent>
    </IonPage>
  );
}
