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
import { useMembership } from '../../data/useMembership.js';
import { MembershipCheckFailed } from '../../components/MembershipCheckFailed.js';
import { submitDraft, describeSubmitError } from '../../flows/composeFlow.js';
import { fetchUserProfile } from '../../data/users.js';
import { UploadingNotice } from '../../components/UploadingNotice.js';
import { DateField } from '../../components/DateField.js';
import { DescriptionField, TextField, ToggleRow } from '../../components/ComposeForm.js';
import { ThumbnailPhotoFrame } from '../../components/ThumbnailPhotoFrame.js';
import { cropToProportions } from '../../data/imageCrop.js';
import type { Area } from 'react-easy-crop';

const TITLE_LIMIT = 50;
const TAGS_LIMIT = 255;

export function ComposeEntryScreen() {
  const navigate = useAppNavigate();
  const draft = useComposeDraftStore((s) => s.draft);
  const patchDraft = useComposeDraftStore((s) => s.patchDraft);
  const clearDraft = useComposeDraftStore((s) => s.clearDraft);

  const { isMember, failed: membershipFailed, retry: retryMembership } = useMembership();
  const [eligibility, setEligibility] = useState<DayEligibility | null>(null);
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [unusablePhoto, setUnusablePhoto] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Set once Blipfoto has accepted the entry: the screen then shows the completion view, and the
  // draft is gone. `total` arrives later, from one profile call, and is simply left out if that fails.
  const [published, setPublished] = useState<{
    entryId: string;
    photoSrc: string | null;
    total: number | null;
  } | null>(null);

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
      const entryId = await submitDraft(draft);
      setPublished({ entryId, photoSrc: draft.photo?.webPath ?? null, total: null });
      clearDraft();
      setSubmitting(false);
      fetchUserProfile().then(
        (profile) => {
          const total = profile.details?.entry_total;
          if (typeof total === 'number') setPublished((p) => (p ? { ...p, total } : p));
        },
        () => {},
      );
    } catch (err) {
      setSubmitError(describeSubmitError(err, draft.accountId, "Couldn't publish your entry."));
      setSubmitting(false);
    }
  }

  if (published) {
    return (
      <IonPage>
        <IonHeader>
          <AppHeader
            title="New entry"
            variant="back"
            onBack={() => navigate.replace('/browse')}
            accountIndicator
          />
        </IonHeader>
        <IonContent>
          <div className="compose-form compose-published">
            <h2>Your entry has been published</h2>
            {published.photoSrc && (
              <img className="compose-published-photo" src={published.photoSrc} alt="" />
            )}
            {published.total !== null && (
              <IonText color="medium">
                <p>
                  You now have {published.total} {published.total === 1 ? 'entry' : 'entries'}.
                </p>
              </IonText>
            )}
            <IonButton
              expand="block"
              onClick={() => navigate.replace(`/entry/${published.entryId}`)}
            >
              View entry
            </IonButton>
            <IonButton expand="block" fill="outline" onClick={() => navigate.replace('/compose')}>
              Add another
            </IonButton>
          </div>
        </IonContent>
      </IonPage>
    );
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
        <AppHeader title="New entry" variant="back" onBack={handleBack} accountIndicator />
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

            {membershipFailed && <MembershipCheckFailed onRetry={retryMembership} />}

            {draft.photo && (
              <ThumbnailPhotoFrame
                photo={draft.photo}
                crop={draft.thumbnailCrop}
                canSelect={isMember === true}
                onCropChange={handleCropComplete}
              />
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
                checked={draft.displayLocation}
                onChange={(checked) => {
                  if (checked && !draft.displayLocation) {
                    // The picker opens at the photo's own position when one is known, and
                    // confirming it turns the map on; backing out leaves it off.
                    navigate.push('/compose/location');
                  } else if (!checked && draft.displayLocation) {
                    // Hide, but keep the position so turning it back on restores it.
                    patchDraft({ displayLocation: false });
                  }
                }}
              >
                {draft.displayLocation && draft.location && (
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

        {submitting && <UploadingNotice what="publish" />}
        <div className="compose-form">
          <IonButton expand="block" disabled={!canPublish} onClick={() => void handlePublish()}>
            {submitting ? <IonSpinner name="dots" /> : submitError ? 'Retry' : 'Publish'}
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
