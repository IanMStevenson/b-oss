// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The in-place progress state for publish and edit-save (§9): the upload runs while this screen is
// open, so the user is told to stay in the app until it completes.

import { IonSpinner, IonText } from '@ionic/react';

export function UploadingNotice({ what }: { what: 'publish' | 'save' }) {
  return (
    <div className="compose-form" role="status" aria-live="polite">
      <IonSpinner name="dots" />
      <IonText color="medium">
        <p>
          {what === 'publish' ? 'Publishing your entry…' : 'Saving your changes…'} Please don&apos;t
          leave the app until the upload completes.
        </p>
      </IonText>
    </div>
  );
}
