// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-10 — Compose Entry Details (FLW-12). Reads composeDraftStore (seeded by SCR-09) rather than
// route state — SCR-11/SCR-12 write their results back into the same draft directly (§6, "Draft
// state"), and a direct/refreshed visit to /compose/details with no draft redirects to SCR-09
// rather than rendering an empty form.
//
// Crop is offered only to members — read from the account's own profile (`details.member`),
// fetched once on mount; there's no cheaper source (accountsStore doesn't carry membership).
// Publish-eligibility: journal/month drives MonthDatePicker's greyed-out days (one request per
// visited month, never per date change); journal/day separately confirms the *currently selected*
// date and is what actually gates Publish — both endpoints are listed in SCR-10's own API
// touchpoints for exactly this division of labour.

import { useEffect, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonButton,
  IonContent,
  IonText,
  IonSpinner,
  IonAlert,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';
import { fetchDayEligibility } from '../../data/journal.js';
import type { DayEligibility } from '../../data/journal.js';
import { validatePickedPhoto } from '../../data/photoValidation.js';
import { fetchUserProfile } from '../../data/users.js';
import { enqueueDraft } from '../../flows/composeFlow.js';
import { describeError, mapApiError } from '../../data/errors.js';
import { DateField } from '../../components/DateField.js';
import { DescriptionField, TextField, ToggleRow } from '../../components/ComposeForm.js';
import { PhotoCropper } from '../../components/PhotoCropper.js';
import { cropToProportions } from '../../data/imageCrop.js';
import type { Area } from 'react-easy-crop';

const TITLE_LIMIT = 50;
const TAGS_LIMIT = 255;

export function ComposeEntryScreen() {
  const navigate = useAppNavigate();
  const draft = useComposeDraftStore((s) => s.draft);
  const patchDraft = useComposeDraftStore((s) => s.patchDraft);
  const clearDraft = useComposeDraftStore((s) => s.clearDraft);

  const [isMember, setIsMember] = useState<boolean | null>(null);
  const [cropping, setCropping] = useState(false);
  const [eligibility, setEligibility] = useState<DayEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [unusablePhoto, setUnusablePhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!draft || draft.mode !== 'publish') {
      navigate.replace('/compose');
      return;
    }
    if (draft.photo) {
      const result = validatePickedPhoto(draft.photo, 'entry');
      if (!result.ok) setUnusablePhoto(result.message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    fetchUserProfile().then(
      (profile) => setIsMember(profile.details?.member === 1),
      () => setIsMember(false),
    );
  }, []);

  useEffect(() => {
    const date = draft?.date;
    if (!date) return;
    let cancelled = false;
    setEligibilityLoading(true);
    fetchDayEligibility(date).then(
      (result) => {
        if (!cancelled) {
          setEligibility(result);
          setEligibilityLoading(false);
        }
      },
      () => {
        if (!cancelled) {
          setEligibility({
            publishable: false,
            message: 'Could not check that date.',
            existingEntryId: null,
          });
          setEligibilityLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [draft?.date]);

  function handleBack(): void {
    if (draft?.dirty) {
      setConfirmDiscard(true);
      return;
    }
    clearDraft();
    navigate.goBack();
  }

  function handleCropComplete(percent: Area): void {
    if (!draft) return;
    patchDraft({ thumbnailCrop: cropToProportions(percent) });
  }

  async function handlePublish(): Promise<void> {
    if (!draft || !eligibility?.publishable || unusablePhoto || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await enqueueDraft(draft);
      clearDraft();
      navigate.replace('/uploads');
    } catch (err) {
      const outcome = mapApiError(err);
      setSubmitError(describeError(outcome, 'Could not queue this entry.'));
      setSubmitting(false);
    }
  }

  if (!draft || draft.mode !== 'publish') {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  const canPublish = !unusablePhoto && eligibility?.publishable === true && !submitting;

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="New entry" variant="back" onBack={handleBack} />
      </IonHeader>
      <IonContent>
        {unusablePhoto ? (
          <div className="compose-form">
            <IonText color="danger">
              <p>{unusablePhoto}</p>
            </IonText>
            <IonButton
              onClick={() => {
                clearDraft();
                navigate.replace('/compose');
              }}
            >
              Choose another photo
            </IonButton>
          </div>
        ) : (
          <>
            {submitError && (
              <div className="compose-form">
                <IonText color="danger">
                  <p>{submitError}</p>
                </IonText>
              </div>
            )}

            {draft.photo && (
              <div className="compose-photo-frame">
                {cropping ? (
                  <PhotoCropper
                    imageSrc={draft.photo.webPath}
                    onCropAreaChange={handleCropComplete}
                  />
                ) : (
                  <img src={draft.photo.webPath} alt="Selected" />
                )}
                {isMember && (
                  // Legible over any photo: opaque white pill while idle, solid green once
                  // cropping is active (a thin green outline vanished into the image).
                  <IonButton
                    size="small"
                    className="compose-crop-button"
                    fill={cropping ? 'solid' : 'outline'}
                    onClick={() => setCropping((c) => !c)}
                    style={
                      cropping
                        ? undefined
                        : {
                            '--background': 'rgba(255, 255, 255, 0.92)',
                            '--background-activated': '#ffffff',
                            '--border-color': 'transparent',
                          }
                    }
                  >
                    {cropping ? 'Done cropping' : 'Crop'}
                  </IonButton>
                )}
              </div>
            )}

            <div className="compose-form">
              <TextField
                label="Title"
                value={draft.title}
                maxLength={TITLE_LIMIT}
                caption={
                  draft.title.length >= TITLE_LIMIT - 10
                    ? `${TITLE_LIMIT - draft.title.length} characters left`
                    : null
                }
                onChange={(title) => patchDraft({ title })}
              />

              <DescriptionField
                value={draft.description}
                onChange={(description) => patchDraft({ description })}
              />

              <TextField
                label="Tags (comma-separated)"
                value={draft.tags}
                maxLength={TAGS_LIMIT}
                onChange={(tags) => patchDraft({ tags })}
              />

              <div>
                <DateField value={draft.date} onChange={(date) => patchDraft({ date })} />

                {eligibilityLoading && <IonSpinner name="dots" />}
                {!eligibilityLoading && eligibility?.message && (
                  <div>
                    <IonText color="warning">
                      <p>{eligibility.message}</p>
                    </IonText>
                    {eligibility.existingEntryId && (
                      <IonButton
                        fill="outline"
                        size="small"
                        onClick={() => navigate.push(`/entry/${eligibility.existingEntryId}`)}
                      >
                        View that entry
                      </IonButton>
                    )}
                  </div>
                )}
              </div>

              <ToggleRow
                label="Add to map"
                checked={draft.location != null}
                onChange={(checked) => {
                  if (checked && !draft.location) {
                    navigate.push('/compose/location');
                  } else if (!checked && draft.location) {
                    patchDraft({ location: null, displayLocation: false });
                  }
                }}
              >
                {draft.location && (
                  <IonButton
                    fill="clear"
                    size="small"
                    onClick={() => navigate.push('/compose/location')}
                  >
                    Change
                  </IonButton>
                )}
              </ToggleRow>
            </div>
          </>
        )}

        <div className="compose-form">
          <IonButton expand="block" disabled={!canPublish} onClick={() => void handlePublish()}>
            {submitting ? <IonSpinner name="dots" /> : 'Publish'}
          </IonButton>
        </div>
      </IonContent>

      <IonAlert
        isOpen={confirmDiscard}
        header="Discard this entry?"
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
