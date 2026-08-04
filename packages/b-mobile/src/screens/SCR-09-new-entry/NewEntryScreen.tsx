// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-09 — New Entry (pick photo), FLW-12 step 1's photo-choosing half. Account/read-write gating
// is handled once, at the router (WriteGuardRoute on /compose) — this screen only has to worry
// about the camera/picker interaction itself. On a successful capture/pick, seeds
// composeDraftStore and pushes to /compose/details (SCR-10) — that's the one thing this screen's
// "Leads to" contract promises; SCR-10 reads the draft rather than being handed the photo via
// route state, so a direct link to /compose/details after a process restart would find nothing
// and can redirect back here (SCR-10's own job, not this screen's).

import { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonBackButton,
  IonContent,
  IonButton,
  IonText,
  IonSpinner,
} from '@ionic/react';
import {
  takePhoto,
  pickPhoto,
  isNativeCamera,
  CameraPermissionDeniedError,
} from '../../platform/camera.js';
import type { PickedPhoto } from '../../platform/camera.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';
import { todayDate } from '../../data/dates.js';

function todayFromCreatedAt(createdAt: string | null): string {
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return todayDate();
}

export function NewEntryScreen() {
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  const setDraft = useComposeDraftStore((s) => s.setDraft);
  const [busy, setBusy] = useState<'camera' | 'picker' | null>(null);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  function startDraft(photo: PickedPhoto): void {
    if (!activeAccount) return;
    setDraft({
      mode: 'publish',
      accountId: activeAccount.id,
      photo: {
        uri: photo.uri,
        webPath: photo.webPath,
        mimeType: photo.mimeType,
        width: photo.width,
        height: photo.height,
        createdAt: photo.createdAt,
        sizeBytes: photo.sizeBytes,
      },
      title: '',
      tags: '',
      description: '',
      date: todayFromCreatedAt(photo.createdAt),
      location: null,
      displayLocation: false,
      thumbnailCrop: null,
      dirty: false,
    });
    navigate.push('/compose/details');
  }

  async function handleTakePhoto(): Promise<void> {
    setCameraMessage(null);
    setPhotoMessage(null);
    setBusy('camera');
    try {
      const photo = await takePhoto();
      if (photo) startDraft(photo);
    } catch (err) {
      if (err instanceof CameraPermissionDeniedError) {
        setCameraMessage(
          err.canRetry
            ? 'Taking a photo needs camera access. Try again to grant it.'
            : 'Taking a photo needs camera access, which is currently blocked. Enable it for this app in your device Settings.',
        );
      } else {
        setPhotoMessage(err instanceof Error ? err.message : 'Could not use that photo.');
      }
    } finally {
      setBusy(null);
    }
  }

  async function handlePickPhoto(): Promise<void> {
    setPhotoMessage(null);
    setBusy('picker');
    try {
      const photo = await pickPhoto();
      if (photo) startDraft(photo);
    } catch (err) {
      setPhotoMessage(err instanceof Error ? err.message : 'Could not use that photo.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonBackButton defaultHref="/browse" />
          </IonButtons>
          <IonTitle>New entry</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {photoMessage && (
          <IonText color="danger">
            <p>{photoMessage}</p>
          </IonText>
        )}

        <IonButton expand="block" disabled={busy !== null} onClick={() => void handleTakePhoto()}>
          {busy === 'camera' ? <IonSpinner name="dots" /> : 'Take a photo'}
        </IonButton>
        {cameraMessage && (
          <IonText color="medium">
            <p>{cameraMessage}</p>
          </IonText>
        )}

        <IonButton
          expand="block"
          fill="outline"
          disabled={busy !== null}
          onClick={() => void handlePickPhoto()}
        >
          {busy === 'picker' ? <IonSpinner name="dots" /> : 'Choose from device'}
        </IonButton>

        {!isNativeCamera() && (
          <IonText color="medium">
            <p>
              Running in a desktop browser — the system picker will use your browser&rsquo;s own
              file chooser.
            </p>
          </IonText>
        )}
      </IonContent>
    </IonPage>
  );
}
