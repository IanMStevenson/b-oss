// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The screen shown when a member has replaced an entry's photo AND chosen its thumbnail (b-oss#1062).
// The API ignores a thumbnail selection when a photo is replaced, so saving as it stands would
// quietly give the new photo the default thumbnail. The member decides instead (flows/
// thumbnailDecision.ts): carry on with the default, delete the entry and post the edits as a new
// one, or cancel the edits. The first two lose or change something, so the screen only offers the
// three plainly; "delete and repost" is asked once more on a screen of its own, which says exactly
// what is lost, and cancelling goes through the screen's usual discard question (the caller's).

import { IonButton, IonSpinner, IonText } from '@ionic/react';

interface Props {
  /** The entry's edit page on the website, where the thumbnail can be chosen. */
  websiteUrl: string;
  onOpenWebsite: (url: string) => void;
  /** An action is running (the delete and the post take a moment). */
  busy: boolean;
  /** Which of its two pages is showing: the options, or the red "are you sure". Held by the screen,
   * so the header's Back and the hardware Back step from the second page to the first. */
  confirming: boolean;
  onConfirmingChange: (confirming: boolean) => void;
  onContinueWithDefault: () => void;
  onDeleteAndRepost: () => void;
  /** Asks the usual "discard changes?" question and, if confirmed, leaves. */
  onCancelEdits: () => void;
}

export function ReplaceThumbnailDecision({
  websiteUrl,
  onOpenWebsite,
  busy,
  confirming,
  onConfirmingChange,
  onContinueWithDefault,
  onDeleteAndRepost,
  onCancelEdits,
}: Props) {
  if (confirming) {
    return (
      <div
        className="compose-form thumb-decision"
        role="alertdialog"
        aria-labelledby="repost-confirm"
      >
        <h2 id="repost-confirm">Delete this entry and post it again?</h2>
        <IonText>
          <p>
            The current entry will be deleted for good, and your edits posted as a new entry. Its
            likes, hearts, comments, view count and existing extra photos will be lost. This cannot
            be undone.
          </p>
        </IonText>
        {busy && <IonSpinner name="dots" />}
        <IonButton expand="block" color="danger" disabled={busy} onClick={onDeleteAndRepost}>
          Delete and post as a new entry
        </IonButton>
        <IonButton
          expand="block"
          fill="outline"
          disabled={busy}
          onClick={() => onConfirmingChange(false)}
        >
          Back
        </IonButton>
      </div>
    );
  }

  // The default is the solid button; the two that lose something are outlined.
  const options: { label: string; onClick: () => void; outline?: boolean }[] = [
    { label: 'Continue posting with the default thumbnail', onClick: onContinueWithDefault },
    {
      label: 'Delete the current entry and upload your changes as a replacement entry',
      onClick: () => onConfirmingChange(true),
      outline: true,
    },
    {
      label: 'Cancel the edits (lose any changes you made)',
      onClick: onCancelEdits,
      outline: true,
    },
  ];

  return (
    <div className="compose-form thumb-decision" role="group" aria-labelledby="thumb-decision">
      <h2 id="thumb-decision">Thumbnail on a replacement photo</h2>
      <IonText>
        <p>
          The Blipfoto API has a bug and doesn&apos;t accept thumbnail edits on replacement images.
          If you want to edit the thumbnail on a replacement image, you can do so on the{' '}
          <a
            href={websiteUrl}
            onClick={(event) => {
              event.preventDefault();
              onOpenWebsite(websiteUrl);
            }}
          >
            website
          </a>
          .
        </p>
        <p>Please decide what to do with the edits you made here:</p>
      </IonText>
      {busy && <IonSpinner name="dots" />}
      {options.map((option) => (
        <IonButton
          key={option.label}
          expand="block"
          fill={option.outline ? 'outline' : 'solid'}
          disabled={busy}
          onClick={option.onClick}
        >
          {option.label}
        </IonButton>
      ))}
    </div>
  );
}
