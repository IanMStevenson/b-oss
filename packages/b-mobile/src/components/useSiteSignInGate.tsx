// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one way into the website session (b-oss#1037, b-oss#1042): extras are added, edited and read
// through it, so every place that needs it asks here and signing in for one serves all. `start`
// runs `then` straight away when the stored session is already this member's; otherwise it asks
// the gate question first. Only a member who signs in to Blipfoto with an email address and
// password can: a Facebook or Twitter member is pointed at "Forgotten your details?" to set one
// (their social sign-in keeps working), and the sign-in itself is Blipfoto's own page, so the
// password never passes through the app.

import { useRef, useState, type ReactElement } from 'react';
import { IonAlert } from '@ionic/react';
import { openUrl } from '../platform/browser.js';
import {
  SIGN_IN_URL,
  currentSiteUser,
  isSameMember,
  signInToSite,
  type SiteAccount,
} from '../flows/extrasFlow.js';

type Gate = 'ask' | 'set-password' | null;

export interface SiteSignInGate {
  /** Runs `then` once the website session is this member's, asking to sign in first if it isn't. */
  start: (then: () => Promise<void> | void) => Promise<void>;
  busy: boolean;
  /** A problem to show the member (wrong account, sign-in not confirmed), or null. */
  notice: string | null;
  /** The gate's dialogs; render once, anywhere. */
  alerts: ReactElement;
}

export function useSiteSignInGate(account: SiteAccount): SiteSignInGate {
  const username = account.username;
  const [gate, setGate] = useState<Gate>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  // Confirmed this session, so a second use does not re-check.
  const signedIn = useRef(false);
  const pending = useRef<(() => Promise<void> | void) | null>(null);

  async function run(then: () => Promise<void> | void): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      await then();
    } catch {
      setNotice('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function start(then: () => Promise<void> | void): Promise<void> {
    if (busy) return;
    if (signedIn.current) return run(then);
    setBusy(true);
    setNotice(null);
    let ready = false;
    try {
      ready = isSameMember(await currentSiteUser(account), username);
    } finally {
      setBusy(false);
    }
    if (ready) {
      signedIn.current = true;
      return run(then);
    }
    pending.current = then;
    setGate('ask');
  }

  async function signInThenRun(): Promise<void> {
    const then = pending.current;
    pending.current = null;
    if (!then) return;
    setBusy(true);
    setNotice(null);
    try {
      if (!(await signInToSite(account))) return;
      const who = await currentSiteUser(account);
      if (!isSameMember(who, username)) {
        setNotice(
          who
            ? `You signed in as ${who}, not ${username}. This needs the same member as the account in use.`
            : "Couldn't confirm the Blipfoto sign-in. Please try again.",
        );
        return;
      }
      signedIn.current = true;
    } catch {
      setNotice("Couldn't sign in. Please try again.");
      return;
    } finally {
      setBusy(false);
    }
    await run(then);
  }

  const alerts = (
    <>
      <IonAlert
        isOpen={gate === 'ask'}
        header="Sign in to Blipfoto"
        message="Extra photos use your Blipfoto website sign-in. Do you sign in to Blipfoto with an email address and password?"
        onDidDismiss={() => setGate((g) => (g === 'ask' ? null : g))}
        buttons={[
          {
            text: 'Cancel',
            role: 'cancel',
            handler: () => {
              pending.current = null;
            },
          },
          {
            text: 'No',
            handler: () => {
              pending.current = null;
              setGate('set-password');
            },
          },
          { text: 'Yes, sign in', handler: () => void signInThenRun() },
        ]}
      />
      <IonAlert
        isOpen={gate === 'set-password'}
        header="Set a password first"
        message="If you sign in with Facebook or Twitter, you can set a password using “Forgotten your details?” on Blipfoto's sign-in page. You can keep using your Facebook or Twitter sign-in as well. Then come back and try again."
        onDidDismiss={() => setGate(null)}
        buttons={[
          { text: 'Not now', role: 'cancel' },
          { text: 'Open Blipfoto sign-in', handler: () => void openUrl(SIGN_IN_URL) },
        ]}
      />
    </>
  );

  return { start, busy, notice, alerts };
}
