// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// SCR-01 — Sign In. This is the *deliberate* shape (full mode choice) — reached from nav
// "Sign in" and SCR-30's "Add account" (FLW-20). The *gated* shape (no mode choice, always
// read-write, names the pending action) has no caller yet — no write action exists before
// Phase 4 to gate — so it isn't built here; signInGated() (FLW-01) already exists in
// flows/accountsFlow.ts for whichever phase adds the first gated action.
//
// Registration URL confirmed by the user 2026-08-04 (was previously the bare root domain, since
// the spec never states it).
//
// First-run explainer (Phase 12.1): marked seen the moment it's *shown*, not on dismissal —
// simpler than tracking the overlay's own open/close transition, and functionally equivalent for
// "never shown again", since it covers a backdrop/swipe dismiss the same as tapping "Got it".
// Gated on devicePrefsStore's own `hydrated` flag so a returning user's persisted `true` isn't
// raced by a not-yet-loaded default `false`.

import { useEffect, useState } from 'react';
import {
  IonPage,
  IonHeader,
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
import { AppHeader } from '../../components/AppHeader.js';
import { signInDeliberate, OAuthCancelledError } from '../../flows/accountsFlow.js';
import type { SignInModeChoice } from '../../flows/accountsFlow.js';
import { openUrl } from '../../platform/browser.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useOverlay } from '../../app/OverlayProvider.js';
import { useDevicePrefsStore } from '../../state/devicePrefsStore.js';

const SIGNUP_URL = 'https://www.blipfoto.com/account/signup';

type Status = 'idle' | 'authenticating' | 'error';

export function SignInScreen() {
  const navigate = useAppNavigate();
  const { showFirstRunExplainer } = useOverlay();
  const hydrated = useDevicePrefsStore((s) => s.hydrated);
  const seenFirstRunExplainer = useDevicePrefsStore((s) => s.seenFirstRunExplainer);
  const setSeenFirstRunExplainer = useDevicePrefsStore((s) => s.setSeenFirstRunExplainer);
  const [scope, setScope] = useState<SignInModeChoice['scope']>('read,write');
  const [notifications, setNotifications] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !seenFirstRunExplainer) {
      showFirstRunExplainer();
      setSeenFirstRunExplainer(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, seenFirstRunExplainer]);

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
        <AppHeader title="Sign In" />
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

        <IonButton expand="block" fill="clear" onClick={() => void openUrl(SIGNUP_URL)}>
          New to Blipfoto? Create account
        </IonButton>
      </IonContent>
    </IonPage>
  );
}
