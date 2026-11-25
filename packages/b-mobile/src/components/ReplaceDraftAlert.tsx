// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The warning shown when the member starts something that would replace a different unsaved draft
// (b-oss#1057): the same wording as the discard dialogs of the compose and edit screens. Keep
// editing returns to the open draft; Discard carries on. Built to be reused by the wider
// "warn before any navigation away from an unsaved draft" guard (b-oss#1059), which is now its
// other user (app/routes/DraftNavigationGuard.tsx).
//
// Only Discard has a handler. Keep editing is "the alert closed any other way": Ionic also runs a
// cancel button's handler when the alert is torn down (e.g. the screen changing under it), which
// made a handler there fire after Discard.

import { useRef } from 'react';
import { IonAlert } from '@ionic/react';
import type { ComposeDraft } from '../state/composeDraftStore.js';

interface ReplaceDraftAlertProps {
  /** The unsaved draft that would be lost; null keeps the dialog closed. */
  draft: ComposeDraft | null;
  /** Must do nothing when there is no longer a draft to keep (it can run once more on teardown). */
  onKeepEditing: () => void;
  onDiscard: () => void;
}

export function ReplaceDraftAlert({ draft, onKeepEditing, onDiscard }: ReplaceDraftAlertProps) {
  const discarded = useRef(false);
  // Ionic keeps the `buttons` it was first given, so a handler that closes over this render's props
  // can be a stale one (found as a flaky test: Discard ran with the photo not yet picked). The
  // handlers go through refs holding the latest callbacks.
  const keepRef = useRef(onKeepEditing);
  const discardRef = useRef(onDiscard);
  keepRef.current = onKeepEditing;
  discardRef.current = onDiscard;
  return (
    <IonAlert
      isOpen={draft !== null}
      header={
        draft ? (draft.mode === 'edit' ? 'Discard changes?' : 'Discard this entry?') : undefined
      }
      message={
        draft
          ? draft.mode === 'edit'
            ? 'Your changes have not been saved.'
            : 'This entry has not been published.'
          : undefined
      }
      backdropDismiss={false}
      onDidDismiss={() => {
        const wasDiscard = discarded.current;
        discarded.current = false;
        if (!wasDiscard) keepRef.current();
      }}
      buttons={[
        { text: 'Keep editing', role: 'cancel' },
        {
          text: 'Discard',
          role: 'destructive',
          handler: () => {
            discarded.current = true;
            discardRef.current();
          },
        },
      ]}
    />
  );
}
