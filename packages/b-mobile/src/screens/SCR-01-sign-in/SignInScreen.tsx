// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-01 — Sign In. This is the *deliberate* shape (full mode choice) — reached from nav
// "Sign in" and SCR-30's "Add account" (FLW-20). The *gated* shape (no mode choice, always
// read-write, names the pending action) has no caller yet — no write action exists before
// Phase 4 to gate — so it isn't built here; signInGated() (FLW-01) already exists in
// flows/accountsFlow.ts for whichever phase adds the first gated action.
//
// TODO: the exact Blipfoto registration/terms/help URLs aren't confirmed anywhere in the spec
// (only the OAuth authorize and developer-apps URLs are). Linking to the confirmed root domain
// for now rather than guessing a sub-path.

import { useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonRadioGroup,
  IonRadio,
  IonItem,
  IonLabel,
  IonToggle,
  IonButton,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { signInDeliberate, OAuthCancelledError } from '../../flows/accountsFlow.js';
import type { SignInModeChoice } from '../../flows/accountsFlow.js';
import { openUrl } from '../../platform/browser.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';

const BLIPFOTO_ROOT = 'https://www.blipfoto.com';

type Status = 'idle' | 'authenticating' | 'error';

export function SignInScreen() {
  const navigate = useAppNavigate();
  const [scope, setScope] = useState<SignInModeChoice['scope']>('read,write');
  const [notifications, setNotifications] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    setError(null);
    setStatus('authenticating');
    try {
      await signInDeliberate({ scope, notifications });
      navigate.replace('/accounts');
    } catch (err) {
      if (err instanceof OAuthCancelledError) {
        setStatus('idle');
        return;
      }
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    }
  }

  const busy = status === 'authenticating';

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Sign In</IonTitle>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p>How do you want to sign in?</p>
        <IonRadioGroup
          value={scope}
          onIonChange={(e) => setScope(e.detail.value as SignInModeChoice['scope'])}
        >
          <IonItem>
            <IonRadio slot="start" value="read,write" aria-label="Read-write" />
            <IonLabel>
              <h2>Read-write</h2>
              <p>Post, react, comment and follow. Most people want this.</p>
            </IonLabel>
          </IonItem>
          <IonItem>
            <IonRadio slot="start" value="read" aria-label="Read-only" />
            <IonLabel>
              <h2>Read-only</h2>
              <p>Browse and read only — nothing you do can change your account.</p>
            </IonLabel>
          </IonItem>
        </IonRadioGroup>

        <IonItem>
          <IonToggle
            checked={notifications}
            onIonChange={(e) => setNotifications(e.detail.checked)}
          >
            Get notifications
          </IonToggle>
        </IonItem>

        {status === 'error' && error && (
          <IonText color="danger">
            <p>{error}</p>
          </IonText>
        )}

        <IonButton expand="block" disabled={busy} onClick={() => void handleContinue()}>
          {busy ? <IonSpinner name="dots" /> : 'Continue'}
        </IonButton>

        <IonButton expand="block" fill="clear" onClick={() => void openUrl(BLIPFOTO_ROOT)}>
          New to Blipfoto? Create account
        </IonButton>
      </IonContent>
    </IonPage>
  );
}
