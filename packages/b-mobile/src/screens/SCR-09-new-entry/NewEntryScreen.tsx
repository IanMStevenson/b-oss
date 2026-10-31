// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-09 — New Entry (pick photo), FLW-12 step 1's photo-choosing half. Account/read-write gating
// is handled once, at the router (WriteGuardRoute on /compose) — this screen only has to worry
// about the camera/picker interaction itself. On a successful capture/pick, seeds
// composeDraftStore and pushes to /compose/details (SCR-10) — that's the one thing this screen's
// "Leads to" contract promises; SCR-10 reads the draft rather than being handed the photo via
// route state, so a direct link to /compose/details after a process restart would find nothing
// and can redirect back here (SCR-10's own job, not this screen's).
//
// A pending share-to-Blipfoto photo (FLW-12, platform/shareIntent.ts) is picked up here too, on
// mount, via `takePendingSharedPhoto()` — reusing the exact same `startDraft()` a camera/gallery
// pick uses, so there is no second, parallel draft-creation path to keep in sync. This screen is
// where the gate (`WriteGuardRoute` on `/compose`) has already passed by the time it mounts,
// which is exactly why the photo was consumed and cached earlier, in `AppShell.tsx`, rather than
// read directly here — see `platform/shareIntent.ts`'s own header comment for the full reasoning.
//
// With `replaceEntryId` set (SCR-13's "Replace image"), the same two-tile picker is reused to choose
// a replacement photo for an entry being edited: a pick is validated, written into the open 'edit'
// draft and the screen goes back to SCR-13 instead of starting a new draft. A pending shared photo
// is deliberately not consumed in this mode — it belongs to a new entry.

import { useEffect, useState } from 'react';
import { IonPage, IonHeader, IonContent, IonButton, IonText, IonSpinner } from '@ionic/react';
import { Camera, Image as ImageIcon } from 'lucide-react';
import { AppHeader } from '../../components/AppHeader.js';
import '../../components/ComposeForm.css';
import {
  takePhoto,
  pickPhoto,
  isNativeCamera,
  CameraPermissionDeniedError,
} from '../../platform/camera.js';
import type { PickedPhoto } from '../../platform/camera.js';
import { hasWebcam } from '../../platform/webcam.js';
import { WebcamCapture } from '../../components/WebcamCapture.js';
import { capabilities } from '../../platform/capabilities.js';
import { takePendingSharedPhoto } from '../../platform/shareIntent.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';
import { todayDate } from '../../data/dates.js';
import { validatePickedPhoto } from '../../data/photoValidation.js';

function todayFromCreatedAt(createdAt: string | null): string {
  if (createdAt) {
    const parsed = new Date(createdAt);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }
  return todayDate();
}

interface NewEntryScreenProps {
  /** Pick a replacement photo for this entry's open edit draft instead of starting a new entry. */
  replaceEntryId?: string;
}

export function NewEntryScreen({ replaceEntryId }: NewEntryScreenProps = {}) {
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  const setDraft = useComposeDraftStore((s) => s.setDraft);
  const patchDraft = useComposeDraftStore((s) => s.patchDraft);
  const [busy, setBusy] = useState<'camera' | 'picker' | null>(null);
  const [cameraMessage, setCameraMessage] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  // Desktop: the camera is the machine's webcam, offered only once one is found (b-oss#670).
  const useWebcam = capabilities().media.source === 'webcam';
  const [webcamFound, setWebcamFound] = useState(false);
  const [webcamOpen, setWebcamOpen] = useState(false);

  useEffect(() => {
    if (!useWebcam) return;
    let cancelled = false;
    void hasWebcam().then((found) => {
      if (!cancelled) setWebcamFound(found);
    });
    return () => {
      cancelled = true;
    };
  }, [useWebcam]);

  function startDraft(photo: PickedPhoto): void {
    if (replaceEntryId) {
      const validation = validatePickedPhoto(photo, 'entry');
      if (!validation.ok) {
        setPhotoMessage(validation.message);
        return;
      }
      patchDraft({
        photo: {
          uri: photo.uri,
          webPath: photo.webPath,
          mimeType: photo.mimeType,
          width: photo.width,
          height: photo.height,
          createdAt: photo.createdAt,
          sizeBytes: photo.sizeBytes,
        },
        thumbnailCrop: null,
      });
      navigate.goBack();
      return;
    }
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
      // The photo's own embedded position, kept but NOT shown on the map until the user turns
      // "Add to map" on (b-oss#650). Sent with the entry so the server holds it either way.
      location: photo.gps ?? null,
      displayLocation: false,
      thumbnailCrop: null,
      dirty: false,
    });
    navigate.push('/compose/details');
  }

  useEffect(() => {
    if (replaceEntryId) return;
    const shared = takePendingSharedPhoto();
    if (shared) startDraft(shared);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleTakePhoto(): Promise<void> {
    setCameraMessage(null);
    setPhotoMessage(null);
    setBusy('camera');
    try {
      const photo = await takePhoto({ geotag: true });
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

  // With no camera route (a desktop without a webcam) the choose-a-photo tile is the only one, and
  // says what it does.
  const canCapture = capabilities().media.capture === 'camera' && (!useWebcam || webcamFound);

  return (
    <IonPage>
      <IonHeader>
        {replaceEntryId ? (
          <AppHeader title="Replace image" variant="back" onBack={() => navigate.goBack()} />
        ) : (
          <AppHeader title="New entry" accountIndicator />
        )}
      </IonHeader>
      <IonContent>
        <div className="new-entry-tiles">
          {canCapture && (
            <IonButton
              className="new-entry-tile"
              expand="block"
              disabled={busy !== null}
              onClick={() => (useWebcam ? setWebcamOpen(true) : void handleTakePhoto())}
            >
              {busy === 'camera' ? (
                <IonSpinner name="dots" />
              ) : (
                <span className="new-entry-tile-inner">
                  <Camera size={32} aria-hidden="true" />
                  Take a photo
                </span>
              )}
            </IonButton>
          )}
          <IonButton
            className="new-entry-tile"
            expand="block"
            fill={canCapture ? 'outline' : 'solid'}
            disabled={busy !== null}
            onClick={() => void handlePickPhoto()}
          >
            {busy === 'picker' ? (
              <IonSpinner name="dots" />
            ) : (
              <span className="new-entry-tile-inner">
                <ImageIcon size={32} aria-hidden="true" />
                {canCapture ? 'Choose from device' : 'Choose a photo'}
              </span>
            )}
          </IonButton>
        </div>

        <div className="compose-form" style={{ paddingTop: 0 }}>
          {photoMessage && (
            <IonText color="danger">
              <p>{photoMessage}</p>
            </IonText>
          )}
          {cameraMessage && (
            <IonText color="medium">
              <p>{cameraMessage}</p>
            </IonText>
          )}
          {canCapture && !useWebcam && !isNativeCamera() && (
            <IonText color="medium">
              <p>
                Running in a desktop browser — the system picker will use your browser&rsquo;s own
                file chooser.
              </p>
            </IonText>
          )}
        </div>
        {useWebcam && (
          <WebcamCapture
            open={webcamOpen}
            onCancel={() => setWebcamOpen(false)}
            onUse={(photo) => {
              setWebcamOpen(false);
              startDraft(photo);
            }}
          />
        )}
      </IonContent>
    </IonPage>
  );
}
