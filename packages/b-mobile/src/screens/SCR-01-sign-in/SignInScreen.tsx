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

import { useEffect, useRef, useState } from 'react';
import {
  IonPage,
  IonHeader,
  IonContent,
  IonRadioGroup,
  IonRadio,
  IonItem,
  IonLabel,
  IonToggle,
  IonAlert,
  IonButton,
  IonSpinner,
  IonText,
} from '@ionic/react';
import { AppHeader } from '../../components/AppHeader.js';
import { signInDeliberate, OAuthCancelledError } from '../../flows/accountsFlow.js';
import type { SignInModeChoice } from '../../flows/accountsFlow.js';
import { openUrl } from '../../platform/browser.js';
import { isPushAvailable } from '../../platform/push.js';
import { isNativePlatform } from '../../platform/appState.js';
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
  // Default off: sign in inside the app's own screen (always asks for a password, so it works for
  // adding a second account). On = the phone's browser, a shortcut when already signed in to
  // Blipfoto there. Inverted from the old "Force new sign-in" toggle (b-oss#165).
  const [useBrowser, setUseBrowser] = useState(false);
  // A build without Firebase credentials can never deliver notifications — offering the toggle
  // would just silently do nothing (and used to crash). Optimistically true until the native check
  // answers, so it doesn't flicker disabled on every visit.
  const [pushAvailable, setPushAvailable] = useState(true);
  // Resolver for the "one more sign-in" interstitial below; non-null while it's showing.
  const serviceRoundAnswer = useRef<((proceed: boolean) => void) | null>(null);
  const [explainServiceRound, setExplainServiceRound] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (hydrated && !seenFirstRunExplainer) {
      showFirstRunExplainer();
      setSeenFirstRunExplainer(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, seenFirstRunExplainer]);

  useEffect(() => {
    if (!isNativePlatform()) return;
    void isPushAvailable().then(setPushAvailable);
  }, []);

  function answerServiceRound(proceed: boolean): void {
    serviceRoundAnswer.current?.(proceed);
    serviceRoundAnswer.current = null;
    setExplainServiceRound(false);
  }

  // Read-write + notifications needs a second, read-only Blipfoto approval for the notification
  // service. Without this the user is simply dropped into a second sign-in with no explanation,
  // which looks like the first one failed (b-oss#165).
  function beforeServiceRound(): Promise<boolean> {
    return new Promise((resolve) => {
      serviceRoundAnswer.current = resolve;
      setExplainServiceRound(true);
    });
  }

  async function handleContinue() {
    setError(null);
    setStatus('authenticating');
    try {
      await signInDeliberate(
        { scope, notifications: notifications && pushAvailable, useEmbedded: isNativePlatform() && !useBrowser },
        { beforeServiceRound },
      );
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
          <IonLabel className="ion-text-wrap">
            <h2>Get notifications</h2>
            {!pushAvailable && <p>Notifications aren&rsquo;t available in this build.</p>}
          </IonLabel>
          <IonToggle
            slot="end"
            aria-label="Get notifications"
            checked={notifications && pushAvailable}
            disabled={!pushAvailable}
            onIonChange={(e) => setNotifications(e.detail.checked)}
          />
        </IonItem>

        {isNativePlatform() && (
          // The explanation lives inside the same item as the toggle it describes, indented under
          // the title, so it reads as that setting's description rather than a stray paragraph.
          <IonItem>
            <IonLabel className="ion-text-wrap">
              <h2>Use browser to sign in</h2>
              <p style={{ paddingLeft: 16 }}>
                If you&rsquo;re already signed in to Blipfoto in your phone&rsquo;s browser, this is
                a shortcut. Leave it off to sign in inside this app, which always asks for your
                password &mdash; handy when adding a second account.
              </p>
            </IonLabel>
            <IonToggle
              slot="end"
              aria-label="Use browser to sign in"
              checked={useBrowser}
              onIonChange={(e) => setUseBrowser(e.detail.checked)}
            />
          </IonItem>
        )}

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

      <IonAlert
        isOpen={explainServiceRound}
        header="One more sign-in"
        message="Notifications need a separate read-only approval from Blipfoto, so you'll be asked to sign in once more. Your account stays read-write."
        backdropDismiss={false}
        onDidDismiss={() => answerServiceRound(false)}
        buttons={[
          { text: 'Skip notifications', role: 'cancel', handler: () => answerServiceRound(false) },
          { text: 'Sign in again', handler: () => answerServiceRound(true) },
        ]}
      />
    </IonPage>
  );
}
