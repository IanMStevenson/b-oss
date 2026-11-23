// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-13 — Edit Entry (FLW-13). One unified screen (2026-09 feedback round) — previously two
// separate "modes" reached via two separate overflow-menu items ("Edit details"/"Replace photo",
// `initialMode`/router state), which meant a single edit action didn't exist and Delete entry
// lived entirely on EntryDetailScreen instead. Now: the details form, a photo frame with a Replace-image button (which reuses SCR-09's picker), and
// Delete entry all live together on this one screen, reached via EntryDetailScreen's single Edit
// affordance — matching FLW-13's actual intent ("edit an entry") rather than its old two-menu-item
// implementation.
//
// Loads the entry once (there's no cheaper source — SCR-06 deliberately doesn't hand its own
// loaded entry down, same deep-link-resilience reasoning as SCR-07/SCR-15/SCR-16) and
// seeds composeDraftStore in 'edit' mode; reuses SCR-10's shared draft/SCR-11/SCR-12 machinery
// rather than a parallel form. Save sends the change and waits for the answer, as compose does (§9).
// Delete is immediate (no draft involved) — same confirm-then-delete-then-navigate-to-Browse
// behaviour this screen inherited from EntryDetailScreen's old overflow menu.

import { useEffect, useRef, useState } from 'react';
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
import { CachedImage } from '../../components/CachedImage.js';
import { DateField } from '../../components/DateField.js';
import { EntryFormLayout } from '../../components/EntryFormLayout.js';
import { ExtraPhotosEditor } from '../../components/ExtraPhotosEditor.js';
import { ExtrasResult } from '../../components/ExtrasResult.js';
import { applyExtras, type ExtrasOutcome } from '../../flows/extrasFlow.js';
import { siteSessionAvailable } from '../../platform/siteSession.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import { useWideForm } from '../../theme/wideLayout.js';
import { DescriptionField, TextField, ToggleRow } from '../../components/ComposeForm.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useComposeDraftStore } from '../../state/composeDraftStore.js';
import { useActiveAccount } from '../../state/accountsStore.js';
import { fetchEntry, deleteEntry } from '../../data/entries.js';
import { UploadingNotice } from '../../components/UploadingNotice.js';
import { submitDraft, describeSubmitError } from '../../flows/composeFlow.js';
import { revealStoredPosition, StillVisibleError } from '../../data/entryLocation.js';
import { ThumbnailPhotoFrame } from '../../components/ThumbnailPhotoFrame.js';
import { cropToProportions } from '../../data/imageCrop.js';
import { useMembership } from '../../data/useMembership.js';
import { MembershipCheckFailed } from '../../components/MembershipCheckFailed.js';
import type { Area } from 'react-easy-crop';
import { LoadFailed } from '../../components/LoadFailed.js';
import { describeError, mapApiError } from '../../data/errors.js';

interface EditEntryScreenProps {
  entryId: string;
}

export function EditEntryScreen({ entryId }: EditEntryScreenProps) {
  const wideForm = useWideForm();
  const navigate = useAppNavigate();
  const activeAccount = useActiveAccount();
  const draft = useComposeDraftStore((s) => s.draft);
  const seedEditDraft = useComposeDraftStore((s) => s.seedEditDraft);
  const patchLoaded = useComposeDraftStore((s) => s.patchLoaded);
  const patchDraft = useComposeDraftStore((s) => s.patchDraft);
  const clearDraft = useComposeDraftStore((s) => s.clearDraft);

  const { isMember, failed: membershipFailed, retry: retryMembership } = useMembership();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadErrorIsTransport, setLoadErrorIsTransport] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  // The entry's current photo (its thumbnail, like the site's edit page), shown until a replacement is picked. Only known when this screen
  // instance loaded the entry itself (a resumed draft doesn't carry it).
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // b-oss#1041: while the website applies extras changes after a save, and how that ended.
  const [extrasState, setExtrasState] = useState<'updating' | ExtrasOutcome | null>(null);
  const accounts = useAccountsStore((s) => s.accounts);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState(false);
  const [deletingEntry, setDeletingEntry] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // "Add to map" for an entry whose position the app doesn't hold: looking it up (b-oss#650).
  const [lookingUpPosition, setLookingUpPosition] = useState(false);
  const [mapMessage, setMapMessage] = useState<string | null>(null);

  // Blipfoto only lets part of an older entry be changed (actions.edit): it ignores the rest
  // without an error, so the form offers only what will actually be saved.
  const editLevel = draft?.editLevel ?? 1;

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
    setLoading(true);
    setLoadError(null);
    fetchEntry(entryId).then(
      (loaded) => {
        if (cancelled) return;
        // Never over this entry's own draft: if one appeared while the load was running, the
        // member's changes in it win (b-oss#1056).
        seedEditDraft({
          mode: 'edit',
          accountId: activeAccount.id,
          entryId,
          editLevel: loaded.actions?.edit ?? 1,
          photo: null,
          title: loaded.entry.title,
          tags: loaded.entry.tags.join(', '),
          description: loaded.entry.description,
          date: loaded.entry.date,
          originalDate: loaded.entry.date,
          location: loaded.entry.location ?? null,
          displayLocation: loaded.entry.location != null,
          thumbnailCrop: null,
          existingImage: loaded.entry.images?.thumbnail ?? loaded.entry.images?.image ?? null,
          dirty: false,
        });
        setCurrentImage(loaded.entry.images?.thumbnail ?? loaded.entry.images?.image ?? null);
        hasSeededRef.current = true;
        setLoading(false);
      },
      (err: unknown) => {
        if (cancelled) return;
        const outcome = mapApiError(err);
        setLoadErrorIsTransport(outcome.kind === 'transport');
        setLoadError(describeError(outcome, 'Could not load this entry.'));
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
    // seedEditDraft is a stable Zustand action reference (never changes identity), so including it
    // doesn't add a re-run trigger beyond entryId/activeAccount.
  }, [entryId, activeAccount, seedEditDraft, loadAttempt]);

  // Set when the discard confirmation was raised by the header's home tap rather than Back.
  const pendingHome = useRef<(() => void) | null>(null);

  function handleHome(goHome: () => void): void {
    if (draft?.dirty) {
      pendingHome.current = goHome;
      setConfirmDiscard(true);
      return;
    }
    clearDraft();
    goHome();
  }

  function handleBack(): void {
    pendingHome.current = null;
    if (draft?.dirty) {
      setConfirmDiscard(true);
      return;
    }
    clearDraft();
    navigate.goBack();
  }

  async function handleSave(): Promise<void> {
    if (!draft || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitDraft(draft);
      const additions = draft.extras ?? [];
      const removals = draft.extrasRemove ?? [];
      if (additions.length === 0 && removals.length === 0) {
        clearDraft();
        navigate.goBackOr(`/entry/${entryId}`);
        return;
      }
      // The entry is saved; whatever happens now only affects the extras.
      setExtrasState('updating');
      const username = accounts.find((a) => a.id === draft.accountId)?.username ?? '';
      const outcome = await applyExtras(
        entryId,
        { id: draft.accountId, username },
        additions,
        removals,
      );
      clearDraft();
      if (outcome.kind === 'done') {
        navigate.goBackOr(`/entry/${entryId}`);
      } else {
        setExtrasState(outcome);
        setSubmitting(false);
      }
    } catch (err) {
      setSubmitError(describeSubmitError(err, draft.accountId, "Couldn't save your changes."));
      setSubmitting(false);
    }
  }

  // Turning the map on with no known position: ask Blipfoto for the one it holds (the entry's own
  // `location` is hidden while the map is off), then open the picker there. With none held the
  // picker simply opens empty.
  async function handleAddToMap(): Promise<void> {
    if (!draft || lookingUpPosition) return;
    setMapMessage(null);
    setLookingUpPosition(true);
    try {
      const position = await revealStoredPosition(draft.accountId, entryId);
      if (position) patchDraft({ location: position });
      navigate.push('/compose/location');
    } catch (err) {
      if (err instanceof StillVisibleError) {
        if (err.position) patchDraft({ location: err.position });
        setMapMessage(
          "Couldn't hide this entry again after looking up its position, so it is showing on the map. Saving this edit will switch it off, or try again.",
        );
      } else {
        setMapMessage(describeError(mapApiError(err), "Couldn't look up this entry's position."));
      }
    } finally {
      setLookingUpPosition(false);
    }
  }

  async function handleConfirmedDeleteEntry(): Promise<void> {
    setConfirmDeleteEntry(false);
    setDeletingEntry(true);
    try {
      await deleteEntry(entryId);
      clearDraft();
      navigate.replace('/browse');
    } catch (err) {
      const outcome = mapApiError(err);
      setDeleteError(describeError(outcome, 'Could not delete this entry.'));
      setDeletingEntry(false);
    }
  }

  // Loading and failed both show the same header as the form, so the page doesn't jump and a way
  // back is always there.
  const loadHeader = (
    <IonHeader>
      <AppHeader
        title="Edit entry"
        variant="back"
        onBack={() => navigate.goBack()}
        accountIndicator
      />
    </IonHeader>
  );

  // The entry was saved but not every extras change went through (b-oss#1041): say so, with the
  // edit page to finish by hand. The draft is already cleared, so this comes before the load checks.
  if (extrasState !== null && extrasState !== 'updating') {
    return (
      <IonPage>
        {loadHeader}
        <IonContent>
          <div className="compose-form">
            <h2>Your changes are saved</h2>
            <ExtrasResult outcome={extrasState} lead="Your changes are saved" />
            <IonButton expand="block" onClick={() => navigate.replace(`/entry/${entryId}`)}>
              View entry
            </IonButton>
          </div>
        </IonContent>
      </IonPage>
    );
  }

  if (loading) {
    return (
      <IonPage>
        {loadHeader}
        <IonContent className="ion-padding">
          <IonSpinner />
        </IonContent>
      </IonPage>
    );
  }

  if (loadError || !draft) {
    return (
      <IonPage>
        {loadHeader}
        <IonContent>
          <LoadFailed
            transport={loadErrorIsTransport}
            message={loadError ?? 'Could not load this entry.'}
            onRefresh={() => setLoadAttempt((n) => n + 1)}
          />
        </IonContent>
      </IonPage>
    );
  }

  function handleCropComplete(percent: Area): void {
    patchDraft({ thumbnailCrop: cropToProportions(percent) });
  }

  const photoSrc = draft.photo?.webPath ?? currentImage ?? draft.existingImage ?? null;
  const photoFrame =
    photoSrc &&
    (draft.photo ? (
      <ThumbnailPhotoFrame
        photo={draft.photo}
        crop={draft.thumbnailCrop}
        canSelect={isMember === true}
        onCropChange={handleCropComplete}
      />
    ) : (
      <div className="compose-photo-thumb">
        <CachedImage src={photoSrc} alt="Current photo" />
      </div>
    ));

  return (
    <IonPage>
      <IonHeader>
        <AppHeader
          title="Edit entry"
          variant="back"
          onBack={handleBack}
          onHome={handleHome}
          accountIndicator
        />
      </IonHeader>
      <IonContent>
        <EntryFormLayout
          notices={
            <>
              {membershipFailed && draft.photo && (
                <MembershipCheckFailed onRetry={retryMembership} />
              )}
              <div className="compose-form">
                {submitError && (
                  <IonText color="danger">
                    <p>{submitError}</p>
                  </IonText>
                )}
                {deleteError && (
                  <IonText color="danger">
                    <p>{deleteError}</p>
                  </IonText>
                )}
                {editLevel !== 1 && (
                  <IonText color="medium">
                    <p>
                      {editLevel === 2
                        ? 'Blipfoto only allows the tags and location to be changed on this entry now.'
                        : "Blipfoto doesn't allow this entry to be edited."}
                    </p>
                  </IonText>
                )}
              </div>
            </>
          }
          photo={
            <>
              {photoFrame}
              {editLevel === 1 && (
                <div className="compose-form">
                  <IonButton
                    className="replace-photo-button"
                    fill="outline"
                    onClick={() => navigate.push(`/entry/${entryId}/edit/photo`)}
                  >
                    Replace photo
                  </IonButton>
                </div>
              )}
            </>
          }
          date={
            editLevel === 1 ? (
              <div className="compose-form">
                <DateField
                  value={draft.date}
                  alwaysOpen={wideForm}
                  onChange={(date) => patchDraft({ date })}
                />
              </div>
            ) : undefined
          }
          extras={
            // Also whenever the draft holds unsaved extras, whatever the membership check or the
            // website read is doing: the member's own choices are never hidden (b-oss#1056).
            (isMember === true || (draft.extras?.length ?? 0) > 0) &&
            siteSessionAvailable() &&
            editLevel !== 0 ? (
              <ExtraPhotosEditor
                entryId={entryId}
                accountId={draft.accountId}
                username={accounts.find((a) => a.id === draft.accountId)?.username ?? ''}
                additions={draft.extras ?? []}
                removals={draft.extrasRemove ?? []}
                onChange={(next) => patchDraft(next)}
                site={draft.siteExtras}
                onRead={(siteExtras) => patchLoaded({ siteExtras })}
              />
            ) : undefined
          }
          details={
            <div className="compose-form">
              {editLevel === 1 && (
                <>
                  <TextField
                    label="Title"
                    value={draft.title}
                    maxLength={50}
                    onChange={(title) => patchDraft({ title })}
                  />

                  <DescriptionField
                    value={draft.description}
                    onChange={(description) => patchDraft({ description })}
                  />
                </>
              )}

              {editLevel !== 0 && (
                <>
                  <TextField
                    label="Tags (comma-separated)"
                    value={draft.tags}
                    maxLength={255}
                    onChange={(tags) => patchDraft({ tags })}
                  />

                  <ToggleRow
                    label="Add to map"
                    caption={lookingUpPosition ? "Looking up this entry's position…" : mapMessage}
                    checked={draft.displayLocation}
                    onChange={(checked) => {
                      if (checked && !draft.displayLocation) {
                        // The picker opens at the entry's position when one is known, and
                        // confirming it turns the map on; backing out leaves it off. With none
                        // known, ask Blipfoto for the one it holds first.
                        if (draft.location) navigate.push('/compose/location');
                        else void handleAddToMap();
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
                </>
              )}
            </div>
          }
          action={
            <div className="compose-form">
              {submitting && extrasState === 'updating' ? (
                <div className="compose-form" role="status" aria-live="polite">
                  <IonSpinner name="dots" />
                  <IonText color="medium">
                    <p>Updating your extra photos… Please don&apos;t leave the app yet.</p>
                  </IonText>
                </div>
              ) : (
                submitting && <UploadingNotice what="save" />
              )}
              <IonButton
                expand="block"
                disabled={submitting || editLevel === 0}
                onClick={() => void handleSave()}
              >
                {submitting ? <IonSpinner name="dots" /> : submitError ? 'Retry' : 'Save'}
              </IonButton>

              <div className="compose-danger-zone">
                <IonButton
                  expand="block"
                  fill="outline"
                  color="danger"
                  disabled={deletingEntry}
                  onClick={() => setConfirmDeleteEntry(true)}
                >
                  Delete entry
                </IonButton>
              </div>
            </div>
          }
        />
      </IonContent>

      <IonAlert
        isOpen={confirmDeleteEntry}
        header="Delete this entry?"
        message="This can't be undone."
        onDidDismiss={() => setConfirmDeleteEntry(false)}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Delete', role: 'destructive', handler: () => void handleConfirmedDeleteEntry() },
        ]}
      />

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
              if (pendingHome.current) pendingHome.current();
              else navigate.goBack();
            },
          },
        ]}
      />
    </IonPage>
  );
}
