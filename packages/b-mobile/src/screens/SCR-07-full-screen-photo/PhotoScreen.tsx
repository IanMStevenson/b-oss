// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-07 — Full-screen Photo (view-only, reached from SCR-06's dedicated fullscreen button next to
// the reaction counts, or a double-tap — not a single photo tap). Standard resolution is the
// ceiling — this app is never served higher-res/original images, so there's no "view original"
// affordance to build. Fetches the entry itself via useLiveEntry rather than receiving it from
// SCR-06: the spec's "No API calls" means no *dedicated* full-photo endpoint (the image URL comes
// from the entry, not a separate call), not literally zero network activity. Refetching keeps this
// screen deep-link-resilient (same entryId-prop pattern as SCR-06) instead of depending on router
// location.state, which would break on a direct link/refresh. Zoom/pan and swipe-to-navigate come
// from b-view's Lightbox (react-zoom-pan-pinch under the hood) — a gallery of the main photo plus any extras
// (b-oss#941). It never moves to another entry (b-oss#955): arrows, keys and swipes only step through
// this entry's photos, and arrows are hidden for a single image. It is the one lightbox: SCR-06's
// fullscreen button, double-tap and every extra's thumbnail all push here, with the tapped photo's index in
// router state (`photoIndex`). Lightbox has no retry UI of its own for a broken image
// (§19's acceptance criterion needs one), so its onImageError callback drives this screen's own
// retry state instead.

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { IonPage, IonContent, IonSpinner, IonText, IonButton } from '@ionic/react';
import { Lightbox, formatLongDate } from '@b-oss/b-view';
import { useEntryStateWithExtras } from '../../data/entryExtras.js';
import { useLiveEntry } from '../../data/useLiveEntry.js';
import {
  useAppNavigate,
  usePhotoOpenedFrom,
  usePhotoStartIndex,
} from '../../app/routes/useAppNavigate.js';
import { profile } from '../../profile/profile.js';

interface PhotoScreenProps {
  entryId: string;
}

export function PhotoScreen({ entryId }: PhotoScreenProps) {
  const navigate = useAppNavigate();
  const { entryState: liveEntryState, reload } = useLiveEntry(entryId);
  const entryState = useEntryStateWithExtras(entryId, liveEntryState);
  const [imageError, setImageError] = useState(false);

  // Lightbox has no retry UI of its own for a broken <img> — reset whenever the entry (or its
  // image URL) changes so a stale failure doesn't stick around after a successful reload/retry.
  const imagePath = entryState.status === 'loaded' ? entryState.data.images.image : undefined;
  useEffect(() => {
    setImageError(false);
  }, [imagePath]);

  // The entry screen that pushed this one marks itself in the router state, so Close can pop back
  // to it instead of stacking a second copy. On a deep link there is no such mark, and Close
  // replaces with the entry instead.
  const openedFrom = usePhotoOpenedFrom();

  function close(): void {
    if (openedFrom === entryId) navigate.goBack();
    else navigate.replace(`/entry/${entryId}`);
  }

  const entry = entryState.status === 'loaded' ? entryState.data : null;
  // Main photo first, then any extras at standard resolution (b-oss#941).
  const lightboxImages = imagePath
    ? [
        imagePath,
        ...(entry?.images.extras ?? []).flatMap((e) => {
          const path = e.image ?? e.thumbnail;
          return path ? [path] : [];
        }),
      ]
    : [];
  const startIndex = usePhotoStartIndex();
  const [lightboxIndex, setLightboxIndex] = useState(startIndex);
  useEffect(() => {
    setLightboxIndex(startIndex);
  }, [entryId, startIndex]);
  const at = Math.min(lightboxIndex, Math.max(lightboxImages.length - 1, 0));

  return (
    <IonPage>
      <IonContent fullscreen style={{ '--background': '#000' } as CSSProperties}>
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
              images={lightboxImages}
              index={at}
              onClose={close}
              onNavigate={setLightboxIndex}
              title={entry?.title}
              journalTitle={entry?.journal_title}
              date={entry ? formatLongDate(entry.date) : undefined}
              onImageError={() => setImageError(true)}
              keyboardZoom={profile().keyboardWheelZoom}
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
