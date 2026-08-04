// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-25 Profile section: Username (server-backed Save/Cancel, same shape as General/Journal),
// Biography (a link out to SCR-11 in its new `target="bio"` mode — see
// DescriptionEditorScreen.tsx), and Avatar (take/choose with crop, or delete — each an immediate
// action, not staged behind this section's own Save).
//
// Avatar crop reuses components/PhotoCropper.tsx + data/imageCrop.ts's `cropToJpegBlob()`, built
// in Phase 7 specifically for this screen (see that file's own header comment) — a *pixel* crop,
// re-encoded to a JPEG Blob client-side, unlike SCR-10's coordinate-only crop, since `avatar` has
// no crop-coordinate field. `cropToJpegBlob()` always returns a Blob regardless of platform, so
// the resulting FileSource is always `{blob}` — no native multipart file-path branch to handle
// here, unlike platform/upload.ts's entry-photo path. Not member-gated (unlike SCR-10's crop):
// SCR-25's own spec places no membership condition on the avatar section.
//
// "Take" reuses platform/camera.ts's takePhoto(), which already requests the camera permission
// only at the point it's tapped and throws CameraPermissionDeniedError on refusal — handled the
// same way SCR-09 does (explain, leave "choose" working, no settings-deep-link since no such
// plugin exists in this app's set — see platform/camera.ts's own documented scope reduction).

import { useEffect, useState } from 'react';
import { IonButton, IonSpinner, IonText, IonAlert } from '@ionic/react';
import { fetchUserSettings, saveUserSettings } from '../../../data/settings.js';
import { mapApiError } from '../../../data/errors.js';
import { useCanWrite, useActiveAccount, useAccountsStore } from '../../../state/accountsStore.js';
import { useAppNavigate } from '../../../app/routes/useAppNavigate.js';
import { takePhoto, pickPhoto, CameraPermissionDeniedError } from '../../../platform/camera.js';
import type { PickedPhoto } from '../../../platform/camera.js';
import { validatePickedPhoto } from '../../../data/photoValidation.js';
import { PhotoCropper } from '../../../components/PhotoCropper.js';
import { cropToJpegBlob } from '../../../data/imageCrop.js';
import type { Area } from 'react-easy-crop';
import { CachedImage } from '../../../components/CachedImage.js';

export function ProfileSection() {
  const navigate = useAppNavigate();
  const canWrite = useCanWrite();
  const activeAccount = useActiveAccount();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const [initialUsername, setInitialUsername] = useState('');
  const [username, setUsername] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const [pickedPhoto, setPickedPhoto] = useState<PickedPhoto | null>(null);
  const [cropPixels, setCropPixels] = useState<Area | null>(null);
  const [avatarBusy, setAvatarBusy] = useState<'camera' | 'gallery' | 'saving' | 'deleting' | null>(
    null,
  );
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [confirmDeleteAvatar, setConfirmDeleteAvatar] = useState(false);

  // Shared by the initial load and by both avatar actions (rules.md: a successful settings write
  // must "refresh any locally cached account state ... other screens depend on" — here that's both
  // this section's own displayed avatarUrl and accountsStore's copy, which the PUT response itself
  // doesn't return, so re-fetching is the only source of the fresh URL).
  async function refreshFromServer(): Promise<void> {
    const settings = await fetchUserSettings();
    setInitialUsername(settings.username);
    setUsername(settings.username);
    setAvatarUrl(settings.avatar_url || null);
    if (activeAccount) {
      useAccountsStore
        .getState()
        .updateAccount(activeAccount.id, { avatarUrl: settings.avatar_url || null });
    }
  }

  useEffect(() => {
    setLoading(true);
    setLoadError(null);
    refreshFromServer().then(
      () => setLoading(false),
      (err: unknown) => {
        const outcome = mapApiError(err);
        setLoadError(outcome.kind === 'message' ? outcome.message : 'Could not load your profile.');
        setLoading(false);
      },
    );
    // Only re-runs if the active account identity changes — refreshFromServer closes over
    // activeAccount but is re-created each render, which would otherwise re-trigger this on every
    // unrelated re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccount?.id]);

  const dirty = username !== initialUsername;

  function handleBack(): void {
    if (dirty) {
      setConfirmDiscard(true);
      return;
    }
    navigate.goBack();
  }

  async function handleSaveUsername(): Promise<void> {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveUserSettings({ username });
      navigate.goBack();
    } catch (err) {
      const outcome = mapApiError(err);
      setSaveError(outcome.kind === 'message' ? outcome.message : 'Could not save your username.');
      setSaving(false);
    }
  }

  async function pickAvatarPhoto(source: 'camera' | 'gallery'): Promise<void> {
    setAvatarError(null);
    setAvatarBusy(source);
    try {
      const photo = source === 'camera' ? await takePhoto() : await pickPhoto();
      if (!photo) {
        setAvatarBusy(null);
        return;
      }
      const validation = validatePickedPhoto(photo);
      if (!validation.ok) {
        setAvatarError(validation.message);
        setAvatarBusy(null);
        return;
      }
      setPickedPhoto(photo);
      setCropPixels(null);
    } catch (err) {
      if (err instanceof CameraPermissionDeniedError) {
        setAvatarError(
          err.canRetry
            ? 'Camera access is needed to take a photo. Please allow it and try again.'
            : 'Camera access was refused. Enable it for this app in system settings, or choose from your device instead.',
        );
      } else {
        setAvatarError(err instanceof Error ? err.message : 'Could not use that photo.');
      }
    } finally {
      setAvatarBusy(null);
    }
  }

  async function handleUseCroppedAvatar(): Promise<void> {
    if (!pickedPhoto || !cropPixels || avatarBusy) return;
    setAvatarBusy('saving');
    setAvatarError(null);
    try {
      const blob = await cropToJpegBlob(pickedPhoto.webPath, cropPixels);
      await saveUserSettings({ avatar: { blob } });
      setPickedPhoto(null);
      setCropPixels(null);
      await refreshFromServer();
    } catch (err) {
      const outcome = mapApiError(err);
      setAvatarError(
        outcome.kind === 'message' ? outcome.message : 'Could not upload that avatar.',
      );
    } finally {
      setAvatarBusy(null);
    }
  }

  async function handleDeleteAvatar(): Promise<void> {
    setAvatarBusy('deleting');
    setAvatarError(null);
    try {
      await saveUserSettings({ delete_avatar: 1 });
      await refreshFromServer();
    } catch (err) {
      const outcome = mapApiError(err);
      setAvatarError(
        outcome.kind === 'message' ? outcome.message : 'Could not remove your avatar.',
      );
    } finally {
      setAvatarBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="ion-padding" style={{ display: 'flex', justifyContent: 'center' }}>
        <IonSpinner />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="ion-padding">
        <IonText color="danger">
          <p>{loadError}</p>
        </IonText>
      </div>
    );
  }

  return (
    <div className="ion-padding">
      <h2>Avatar</h2>
      {avatarError && (
        <IonText color="danger">
          <p>{avatarError}</p>
        </IonText>
      )}

      {pickedPhoto ? (
        <div>
          <PhotoCropper
            imageSrc={pickedPhoto.webPath}
            onCropAreaChange={(_percent, pixels) => setCropPixels(pixels)}
          />
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <IonButton
              disabled={avatarBusy !== null || !cropPixels}
              onClick={() => void handleUseCroppedAvatar()}
            >
              {avatarBusy === 'saving' ? <IonSpinner name="dots" /> : 'Use this photo'}
            </IonButton>
            <IonButton
              fill="outline"
              disabled={avatarBusy !== null}
              onClick={() => {
                setPickedPhoto(null);
                setCropPixels(null);
              }}
            >
              Cancel
            </IonButton>
          </div>
        </div>
      ) : (
        <>
          {avatarUrl ? (
            <CachedImage
              src={avatarUrl}
              alt="Current avatar"
              style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <IonText color="medium">
              <p>No avatar set.</p>
            </IonText>
          )}
          {canWrite && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <IonButton
                fill="outline"
                disabled={avatarBusy !== null}
                onClick={() => void pickAvatarPhoto('camera')}
              >
                {avatarBusy === 'camera' ? <IonSpinner name="dots" /> : 'Take photo'}
              </IonButton>
              <IonButton
                fill="outline"
                disabled={avatarBusy !== null}
                onClick={() => void pickAvatarPhoto('gallery')}
              >
                {avatarBusy === 'gallery' ? <IonSpinner name="dots" /> : 'Choose from device'}
              </IonButton>
              {avatarUrl && (
                <IonButton
                  fill="outline"
                  color="danger"
                  disabled={avatarBusy !== null}
                  onClick={() => setConfirmDeleteAvatar(true)}
                >
                  {avatarBusy === 'deleting' ? <IonSpinner name="dots" /> : 'Delete avatar'}
                </IonButton>
              )}
            </div>
          )}
        </>
      )}

      <h2 style={{ marginTop: 24 }}>Biography</h2>
      <IonButton fill="outline" onClick={() => navigate.push('/compose/description?target=bio')}>
        Edit biography
      </IonButton>

      <h2 style={{ marginTop: 24 }}>Username</h2>
      {saveError && (
        <IonText color="danger">
          <p>{saveError}</p>
        </IonText>
      )}
      <label>
        Username
        <input
          type="text"
          value={username}
          disabled={!canWrite}
          onChange={(e) => setUsername(e.target.value)}
          style={{ width: '100%', font: 'inherit', padding: 8 }}
        />
      </label>
      {canWrite ? (
        <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
          <IonButton disabled={saving || !dirty} onClick={() => void handleSaveUsername()}>
            {saving ? <IonSpinner name="dots" /> : 'Save'}
          </IonButton>
          <IonButton fill="outline" disabled={saving} onClick={handleBack}>
            Cancel
          </IonButton>
        </div>
      ) : (
        <IonText color="medium">
          <p>This account is read-only.</p>
        </IonText>
      )}

      <IonAlert
        isOpen={confirmDiscard}
        header="Discard changes?"
        onDidDismiss={() => setConfirmDiscard(false)}
        buttons={[
          { text: 'Keep editing', role: 'cancel' },
          { text: 'Discard', role: 'destructive', handler: () => navigate.goBack() },
        ]}
      />

      <IonAlert
        isOpen={confirmDeleteAvatar}
        header="Delete avatar?"
        onDidDismiss={() => setConfirmDeleteAvatar(false)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          {
            text: 'Delete',
            role: 'destructive',
            handler: () => void handleDeleteAvatar(),
          },
        ]}
      />
    </div>
  );
}
