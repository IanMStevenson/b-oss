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
//
// Browser default (b-oss#240): the very first account defaults to the phone's browser (reuses an
// existing Blipfoto login); with an account already here it defaults to the clean in-app browser,
// since the phone's browser is probably still logged in as that first account. The choice stays
// visible either way. The second (notifications) round uses the same browser as the first and is
// owner-checked by the flow; if it comes back as someone else, the account stays signed in without
// notifications and the mismatch alert offers to redo just that round in the app.

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
import {
  signInDeliberate,
  changeAccountMode,
  OAuthCancelledError,
} from '../../flows/accountsFlow.js';
import type { SignInModeChoice } from '../../flows/accountsFlow.js';
import { AccountMismatchError } from '../../flows/accountMismatch.js';
import { AccountMismatchAlert, canRetryInApp } from '../../components/AccountMismatchAlert.js';
import { useServiceRoundExplainer } from '../../components/ServiceRoundExplainer.js';
import { openUrl } from '../../platform/browser.js';
import { isPushAvailable } from '../../platform/push.js';
import { isNativePlatform } from '../../platform/appState.js';
import { useAppNavigate } from '../../app/routes/useAppNavigate.js';
import { useOverlay } from '../../app/OverlayProvider.js';
import { useDevicePrefsStore } from '../../state/devicePrefsStore.js';
import { useActiveAccount, useAccountsStore } from '../../state/accountsStore.js';
import { t } from '../../strings/index.js';

const SIGNUP_URL = 'https://www.blipfoto.com/account/signup';

type Status = 'idle' | 'authenticating' | 'error';

export function SignInScreen() {
  const navigate = useAppNavigate();
  // With an account already signed in this screen was reached by drilling in (Accounts → Add
  // account), so it gets Back like every other drilled-into screen. The signed-out landing page has
  // nothing to go back to and keeps the menu button (b-oss#195).
  const drilledIn = useActiveAccount() !== null;
  const { showFirstRunExplainer } = useOverlay();
  const hydrated = useDevicePrefsStore((s) => s.hydrated);
  const seenFirstRunExplainer = useDevicePrefsStore((s) => s.seenFirstRunExplainer);
  const setSeenFirstRunExplainer = useDevicePrefsStore((s) => s.setSeenFirstRunExplainer);
  const [scope, setScope] = useState<SignInModeChoice['scope']>('read,write');
  const [notifications, setNotifications] = useState(false);
  // On = the phone's browser, a shortcut when already signed in to Blipfoto there; off = inside
  // the app's own screen, which always asks for a password (b-oss#165). Until the user flips it,
  // it follows the account count (b-oss#240): on for the first account, off when adding another.
  // Derived rather than initialised so it's right even if the accounts store hydrates after mount.
  const accountCount = useAccountsStore((s) => s.accounts.length);
  const [browserChoice, setBrowserChoice] = useState<boolean | null>(null);
  const useBrowser = browserChoice ?? accountCount === 0;
  // A build without Firebase credentials can never deliver notifications — offering the toggle
  // would just silently do nothing (and used to crash). Optimistically true until the native check
  // answers, so it doesn't flicker disabled on every visit.
  const [pushAvailable, setPushAvailable] = useState(true);
  // Read-write + notifications needs a second, read-only Blipfoto approval for the notification
  // service. Without this the user is simply dropped into a second sign-in with no explanation,
  // which looks like the first one failed (b-oss#165).
  const explainer = useServiceRoundExplainer({
    cancel: t('SCR-01.second_auth.button_skip'),
    proceed: t('SCR-01.second_auth.button_continue'),
  });
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<AccountMismatchError | null>(null);

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

  function fail(err: unknown): void {
    if (err instanceof AccountMismatchError) {
      // The account itself is signed in; only its notifications round went to someone else.
      setStatus('idle');
      setMismatch(err);
      return;
    }
    setStatus('error');
    setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
  }

  async function handleContinue() {
    setError(null);
    setStatus('authenticating');
    setBrowserChoice(useBrowser); // freeze it: the first round adds an account
    try {
      await signInDeliberate(
        {
          scope,
          notifications: notifications && pushAvailable,
          useEmbedded: isNativePlatform() && !useBrowser,
        },
        { beforeServiceRound: explainer.ask },
      );
      navigate.replace('/accounts');
    } catch (err) {
      if (err instanceof OAuthCancelledError) {
        setStatus('idle');
        return;
      }
      fail(err);
    }
  }

  /** After a mismatch: Not now leaves the account signed in without notifications; retry redoes
   * just the notifications round, for that account, in the clean in-app browser. */
  async function handleMismatchClosed(err: AccountMismatchError, retry: boolean) {
    setMismatch(null);
    if (!retry) {
      navigate.replace('/accounts');
      return;
    }
    setError(null);
    setStatus('authenticating');
    const account = useAccountsStore.getState().accounts.find((a) => a.id === err.expected);
    try {
      await changeAccountMode(err.expected, {
        scope: account?.appTokenScope ?? 'read,write',
        notifications: true,
        useEmbedded: true,
      });
      navigate.replace('/accounts');
    } catch (retryErr) {
      if (retryErr instanceof OAuthCancelledError) {
        navigate.replace('/accounts');
        return;
      }
      fail(retryErr);
    }
  }

  const mismatchScope = mismatch
    ? (useAccountsStore.getState().accounts.find((a) => a.id === mismatch.expected)
        ?.appTokenScope ?? null)
    : null;

  const busy = status === 'authenticating';

  return (
    <IonPage>
      <IonHeader>
        <AppHeader title="Sign In" variant={drilledIn ? 'back' : 'menu'} backHref="/accounts" />
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
                a shortcut. Turn it off to sign in inside this app, which always asks for your
                password &mdash; handy when adding a second account.
              </p>
            </IonLabel>
            <IonToggle
              slot="end"
              aria-label="Use browser to sign in"
              checked={useBrowser}
              onIonChange={(e) => setBrowserChoice(e.detail.checked)}
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

      {explainer.element}
      <AccountMismatchAlert
        error={mismatch}
        canRetry={mismatch !== null && canRetryInApp(mismatch, mismatchScope)}
        onClose={(retry) => {
          if (mismatch) void handleMismatchClosed(mismatch, retry);
        }}
      />
    </IonPage>
  );
}
