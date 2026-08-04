// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-13 — Edit Entry (FLW-13). Two of its three modes live here — "Edit details" and "Replace
// photo" (`initialMode`, from EntryDetailScreen's overflow menu via router state, extracted in
// AppRoutes.tsx). "Delete entry" is a third, but per FLW-13's own diagram it never routes through
// SCR-13 at all ("Delete --> Confirm --> Delete entry --> Close entry" branches directly off the
// overflow menu) — implemented on EntryDetailScreen itself, not here.
//
// Loads the entry once (there's no cheaper source — SCR-06 deliberately doesn't hand its own
// loaded entry down, same deep-link-resilience reasoning as SCR-07/SCR-08/SCR-15/SCR-16) and
// seeds composeDraftStore in 'edit' mode; reuses SCR-10's shared draft/SCR-11/SCR-12 machinery
// rather than a parallel form. Save enqueues the same durable background upload as compose (§9).

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
  IonSpinner,
  IonAlert,
  IonCheckbox,
} from '@ionic/react';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { fetchEntry } from '../../data/entries.js';
import { enqueueDraft } from '../../flows/composeFlow.js';
import { mapApiError } from '../../data/errors.js';
import { takePhoto, pickPhoto } from '../../platform/camera.js';
import { validatePickedPhoto } from '../../data/photoValidation.js';
import type { PickedPhoto } from '../../platform/camera.js';

interface EditEntryScreenProps {
  entryId: string;
  initialMode: 'details' | 'photo';
}

export function EditEntryScreen({ entryId, initialMode }: EditEntryScreenProps) {
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  const draft = useComposeDraftStore((s) => s.draft);
  const setDraft = useComposeDraftStore((s) => s.setDraft);
  const patchDraft = useComposeDraftStore((s) => s.patchDraft);
  const clearDraft = useComposeDraftStore((s) => s.clearDraft);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isCurrentDraft = draft?.mode === 'edit' && draft.entryId === entryId;
  // Whether this screen instance has already seeded (or found) its draft — checked once, at the
  // ref's initializer, not tracked as an effect dependency. Save's own clearDraft() nulls the
  // draft on success, which would otherwise flip `isCurrentDraft` back to false and — if this
  // component were still mounted/subscribed at that instant (it briefly is, before the route
  // change unmounts it) — re-trigger a pointless refetch-and-reseed race straight after saving.
  // A ref survives that state change without re-running the effect, since it isn't a dependency.
  const hasSeededRef = useRef(isCurrentDraft);

  useEffect(() => {
    if (hasSeededRef.current) {
      setLoading(false);
      return;
    }
    if (!activeAccount) return;
    let cancelled = false;
    fetchEntry(entryId).then(
      (loaded) => {
        if (cancelled) return;
        setDraft({
          mode: 'edit',
          accountId: activeAccount.id,
          entryId,
          photo: null,
          title: loaded.entry.title,
          tags: loaded.entry.tags.join(', '),
          description: loaded.entry.description,
          date: loaded.entry.date,
          location: loaded.entry.location ?? null,
          displayLocation: loaded.entry.location != null,
          thumbnailCrop: null,
          dirty: false,
        });
        hasSeededRef.current = true;
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        const outcome = mapApiError(err);
        setLoadError(outcome.kind === 'message' ? outcome.message : 'Could not load this entry.');
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // setDraft is a stable Zustand action reference (never changes identity), so including it
    // doesn't add a re-run trigger beyond entryId/activeAccount.
  }, [entryId, activeAccount, setDraft]);

  function handleBack(): void {
    if (draft?.dirty) {
      setConfirmDiscard(true);
      return;
    }
    clearDraft();
    navigate.goBack();
  }

  async function pickNewPhoto(source: 'camera' | 'gallery'): Promise<void> {
    setPhotoError(null);
    try {
      const photo: PickedPhoto | null = source === 'camera' ? await takePhoto() : await pickPhoto();
      if (!photo) return;
      const validation = validatePickedPhoto(photo);
      if (!validation.ok) {
        setPhotoError(validation.message);
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
        },
      });
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not use that photo.');
    }
  }

  async function handleSave(): Promise<void> {
    if (!draft || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await enqueueDraft(draft);
      clearDraft();
      navigate.replace(`/entry/${entryId}`);
    } catch (err) {
      const outcome = mapApiError(err);
      setSubmitError(outcome.kind === 'message' ? outcome.message : 'Could not queue this change.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  if (loadError || !draft) {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <IonText color="danger">
            <p>{loadError ?? 'Could not load this entry.'}</p>
          </IonText>
          <IonButton onClick={() => navigate.goBack()}>Back</IonButton>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={handleBack}>Cancel</IonButton>
          </IonButtons>
          <IonTitle>{initialMode === 'photo' ? 'Replace photo' : 'Edit details'}</IonTitle>
          <IonButtons slot="end">
            <IonButton disabled={submitting} onClick={() => void handleSave()}>
              {submitting ? <IonSpinner name="dots" /> : 'Save'}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {submitError && (
          <IonText color="danger">
            <p>{submitError}</p>
          </IonText>
        )}

        {initialMode === 'photo' ? (
          <>
            {photoError && (
              <IonText color="danger">
                <p>{photoError}</p>
              </IonText>
            )}
            {draft.photo ? (
              <img
                src={draft.photo.webPath}
                alt="New photo"
                style={{
                  width: '100%',
                  maxHeight: 240,
                  objectFit: 'contain',
                  background: 'var(--bg-alt)',
                }}
              />
            ) : (
              <IonText color="medium">
                <p>Choose a new photo to replace this entry&rsquo;s current one.</p>
              </IonText>
            )}
            <IonButton expand="block" onClick={() => void pickNewPhoto('camera')}>
              Take a photo
            </IonButton>
            <IonButton expand="block" fill="outline" onClick={() => void pickNewPhoto('gallery')}>
              Choose from device
            </IonButton>
          </>
        ) : (
          <>
            <label>
              Title
              <input
                type="text"
                value={draft.title}
                maxLength={50}
                onChange={(e) => patchDraft({ title: e.target.value })}
                style={{ width: '100%', font: 'inherit', padding: 8 }}
              />
            </label>

            <label>
              Tags (comma-separated)
              <input
                type="text"
                value={draft.tags}
                maxLength={255}
                onChange={(e) => patchDraft({ tags: e.target.value })}
                style={{ width: '100%', font: 'inherit', padding: 8 }}
              />
            </label>

            <div>
              <span>Description</span>
              <p>{draft.description ? draft.description.slice(0, 80) : 'No description'}</p>
              <IonButton
                fill="outline"
                size="small"
                onClick={() => navigate.push('/compose/description')}
              >
                Edit description
              </IonButton>
            </div>

            <div>
              <IonCheckbox
                checked={draft.location != null}
                onIonChange={(e) => {
                  if (e.detail.checked && !draft.location) {
                    navigate.push('/compose/location');
                  } else if (!e.detail.checked) {
                    patchDraft({ location: null, displayLocation: false });
                  }
                }}
              >
                Location
              </IonCheckbox>
              {draft.location && (
                <IonButton
                  fill="clear"
                  size="small"
                  onClick={() => navigate.push('/compose/location')}
                >
                  Change
                </IonButton>
              )}
            </div>
          </>
        )}
      </IonContent>

      <IonAlert
        isOpen={confirmDiscard}
        header="Discard changes?"
        onDidDismiss={() => setConfirmDiscard(false)}
        buttons={[
          { text: 'Keep editing', role: 'cancel' },
          {
            text: 'Discard',
            role: 'destructive',
            handler: () => {
              clearDraft();
              navigate.goBack();
            },
          },
        ]}
      />
    </IonPage>
  );
}
