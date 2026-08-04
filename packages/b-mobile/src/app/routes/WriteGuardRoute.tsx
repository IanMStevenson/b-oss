// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The write-gate, implemented once (§5): a read-only account must never reach a write screen —
// "a dedicated write screen ... never opens in the first place; the prompt is shown instead of
// navigating to it" (rules.md). This is what makes the deep-link and share-intent bypass paths
// impossible to forget, since all three arrive through the router.
//
// Two distinct cases, per FLW-01/rules.md's "read first, gate late": **anonymous** always goes
// straight to a read-write sign-in round (never the upgrade prompt, which offers to repair an
// account that doesn't exist) and resumes here on success; **signed in but read-only** gets the
// upgrade prompt instead. Getting these branches right matters beyond SCR-06's affordances being
// hidden for a read-only account — deep links and share intents can land directly on a
// write-gated route with no account at all.
//
// The upgrade prompt itself is a plain IonAlert here rather than the full imperative-overlay
// pattern OverlayProvider will eventually own (§5) — that needs the account-switcher/upgrade-
// prompt machinery later phases build. Functionally equivalent for now: the write screen never
// mounts, and declining returns the user to where they came from.

import { useEffect, useRef, useState } from 'react';
import { Route, useHistory } from 'react-router-dom';
import type { RouteProps } from 'react-router-dom';
import { IonAlert } from '@ionic/react';
import { useActiveAccount, useCanWrite } from '../../state/accountsStore.js';
import { signInGated } from '../../flows/accountsFlow.js';

export function WriteGuardRoute(props: RouteProps) {
  const activeAccount = useActiveAccount();
  const canWrite = useCanWrite();
  const history = useHistory();
  const [dismissed, setDismissed] = useState(false);
  const attemptedSignIn = useRef(false);

  useEffect(() => {
    if (!activeAccount && !attemptedSignIn.current) {
      attemptedSignIn.current = true;
      signInGated().catch(() => history.goBack());
    }
  }, [activeAccount, history]);

  if (canWrite) {
    return <Route {...props} />;
  }

  if (!activeAccount) {
    // Waiting on the sign-in round kicked off above — the browser overlay is the visible UI.
    return null;
  }

  if (dismissed) {
    return null;
  }

  return (
    <IonAlert
      isOpen
      header="Read-only account"
      message="This account is signed in read-only. Sign in for write access to continue."
      onDidDismiss={() => {
        setDismissed(true);
        history.goBack();
      }}
      buttons={[
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Manage accounts',
          handler: () => history.push('/accounts'),
        },
      ]}
    />
  );
}
