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
import { IonButton, IonItem, IonList, IonSpinner, IonText, IonAlert } from '@ionic/react';
import { fetchUserSettings, saveUserSettings } from '../../../data/settings.js';
import { describeError, describeUploadError, mapApiError } from '../../../data/errors.js';
import { recordFailure } from '../../../data/httpFailureLog.js';
import { useCanWrite, useActiveAccount, useAccountsStore } from '../../../state/accountsStore.js';
import { useAppNavigate } from '../../../app/routes/useAppNavigate.js';
import { takePhoto, pickPhoto, CameraPermissionDeniedError } from '../../../platform/camera.js';
import type { PickedPhoto } from '../../../platform/camera.js';
import { validatePickedPhoto } from '../../../data/photoValidation.js';
import { PhotoCropper } from '../../../components/PhotoCropper.js';
import { cropToJpegBlob } from '../../../data/imageCrop.js';
import type { Area } from 'react-easy-crop';
import { CachedImage } from '../../../components/CachedImage.js';
import {
  ActionRow,
  CaptionRow,
  FormActions,
  NavRow,
  SectionHeader,
  TextFieldRow,
} from '../../../components/SettingsForm.js';

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

  // Shared by the initial load and by both avatar actions (a successful settings write must
  // refresh any locally cached account state other screens depend on — here that's both
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
        setLoadError(describeError(outcome, 'Could not load your profile.'));
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
      setSaveError(describeError(outcome, 'Could not save your username.'));
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
      const validation = validatePickedPhoto(photo, 'avatar');
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
      await recordFailure(err, {
        action: 'avatar-upload',
        picked: {
          mimeType: pickedPhoto.mimeType,
          width: pickedPhoto.width,
          height: pickedPhoto.height,
          sizeBytes: pickedPhoto.sizeBytes,
        },
        crop: cropPixels,
      });
      setAvatarError(describeUploadError(err, 'Could not upload that avatar.'));
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
      setAvatarError(describeError(outcome, 'Could not remove your avatar.'));
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
    <div>
      <IonList>
        <SectionHeader>Profile picture</SectionHeader>
        {avatarError && <CaptionRow tone="danger">{avatarError}</CaptionRow>}

        {pickedPhoto ? (
          <div className="ion-padding">
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
            <IonItem lines={canWrite ? 'inset' : 'none'}>
              {avatarUrl ? (
                <CachedImage
                  src={avatarUrl}
                  alt="Current avatar"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: '50%',
                    objectFit: 'cover',
                    margin: '12px 0',
                  }}
                />
              ) : (
                <IonText color="medium">
                  <p>No avatar set.</p>
                </IonText>
              )}
            </IonItem>
            {canWrite && (
              <>
                <ActionRow
                  label="Take photo"
                  busy={avatarBusy === 'camera'}
                  disabled={avatarBusy !== null}
                  onClick={() => void pickAvatarPhoto('camera')}
                />
                <ActionRow
                  label="Choose from device"
                  busy={avatarBusy === 'gallery'}
                  disabled={avatarBusy !== null}
                  onClick={() => void pickAvatarPhoto('gallery')}
                />
                {avatarUrl && (
                  <ActionRow
                    label="Delete avatar"
                    danger
                    busy={avatarBusy === 'deleting'}
                    disabled={avatarBusy !== null}
                    onClick={() => setConfirmDeleteAvatar(true)}
                  />
                )}
              </>
            )}
          </>
        )}

        <SectionHeader>Biography</SectionHeader>
        <NavRow
          label="Edit biography"
          kind="push"
          onClick={() => navigate.push('/compose/description?target=bio')}
        />

        <SectionHeader>Account name</SectionHeader>
        {saveError && <CaptionRow tone="danger">{saveError}</CaptionRow>}
        <TextFieldRow
          label="Username"
          value={username}
          disabled={!canWrite}
          onChange={setUsername}
        />
        {!canWrite && <CaptionRow>This account is read-only.</CaptionRow>}
      </IonList>

      {canWrite && (
        <FormActions
          saving={saving}
          dirty={dirty}
          onSave={() => void handleSaveUsername()}
          onCancel={handleBack}
        />
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
