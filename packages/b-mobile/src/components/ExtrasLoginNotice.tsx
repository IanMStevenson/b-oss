// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Shown on an entry in a protected journal, where its extra photos would be, when there is no
// website session to read them with (b-oss#1042). Signing in uses the same session and the same
// gate as adding extras (useSiteSignInGate), so doing either serves both.

import { IonButton, IonText } from '@ionic/react';
import { useSiteSignInGate } from './useSiteSignInGate.js';

interface Props {
  username: string;
  /** Called once the member has signed in, so the extras can be read. */
  onSignedIn: () => void;
  /** Replaces the default line, e.g. when the website is signed in as someone else. */
  message?: string;
  buttonLabel?: string;
}

export function ExtrasLoginNotice({
  username,
  onSignedIn,
  message = 'Extras require a web login.',
  buttonLabel = 'Sign in to see extras',
}: Props) {
  const gate = useSiteSignInGate(username);
  return (
    <div className="extras-login-notice" role="note">
      <IonText color="medium">
        <p>{message}</p>
      </IonText>
      {gate.notice && (
        <IonText color="danger">
          <p>{gate.notice}</p>
        </IonText>
      )}
      <IonButton
        size="small"
        fill="outline"
        disabled={gate.busy}
        onClick={() => void gate.start(onSignedIn)}
      >
        {buttonLabel}
      </IonButton>
      {gate.alerts}
    </div>
  );
}
