// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-07 — Full-screen Photo (view-only, reached from SCR-06's dedicated fullscreen button next
// to the reaction counts — not a photo tap; see SCR-06-entry-detail.md/SCR-07-full-screen-photo.md
// for the correction). Standard resolution is the ceiling per AppSpec — this app is never served
// higher-res/original images, so there's no "view original" affordance to build. Fetches the entry
// itself via useLiveEntry rather than receiving it from SCR-06: the spec's "No API calls" means no
// *dedicated* full-photo endpoint (the image URL comes from the entry, not a separate call), not
// literally zero network activity. Refetching keeps this screen deep-link-resilient (same
// entryId-prop pattern as SCR-06) instead of depending on router location.state, which would break
// on a direct link/refresh. Zoom/pan and swipe-to-navigate come from b-view's Lightbox
// (react-zoom-pan-pinch under the hood) — a single-image gallery here, so its prev/next affordances
// stay hidden. Lightbox has no retry UI of its own for a broken image (§19's acceptance criterion
// needs one), so its onImageError callback drives this screen's own retry state instead.

import { useEffect, useState } from 'react';
import { IonPage, IonContent, IonSpinner, IonText, IonButton } from '@ionic/react';
import { Lightbox } from '@b-oss/b-view';
import { useLiveEntry } from '../../data/useLiveEntry.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';

interface PhotoScreenProps {
  entryId: string;
}

export function PhotoScreen({ entryId }: PhotoScreenProps) {
  const navigate = useAppNavigate();
  const { entryState, reload } = useLiveEntry(entryId);
  const [imageError, setImageError] = useState(false);

  // Lightbox has no retry UI of its own for a broken <img> — reset whenever the entry (or its
  // image URL) changes so a stale failure doesn't stick around after a successful reload/retry.
  const imagePath = entryState.status === 'loaded' ? entryState.data.images.image : undefined;
  useEffect(() => {
    setImageError(false);
  }, [imagePath]);

  function close(): void {
    navigate.replace(`/entry/${entryId}`);
  }

  return (
    <IonPage>
      <IonContent fullscreen style={{ '--background': '#000' }}>
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
            <IonButton onClick={reload}>Retry</IonButton>
          </div>
        )}

        {entryState.status === 'loaded' &&
          (imagePath && !imageError ? (
            <Lightbox
              images={[imagePath]}
              index={0}
              onClose={close}
              onNavigate={() => {}}
              onImageError={() => setImageError(true)}
            />
          ) : (
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
              {imagePath ? (
                <IonButton onClick={() => setImageError(false)}>Retry</IonButton>
              ) : (
                <IonButton onClick={close}>Close</IonButton>
              )}
            </div>
          ))}
      </IonContent>
    </IonPage>
  );
}
