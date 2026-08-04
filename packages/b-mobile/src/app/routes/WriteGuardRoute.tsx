// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The write-gate, implemented once (§5): a read-only account must never reach a write screen —
// "a dedicated write screen ... never opens in the first place; the prompt is shown instead of
// navigating to it" (rules.md). This is what makes the deep-link and share-intent bypass paths
// impossible to forget, since all three arrive through the router.
//
// The prompt itself is a plain IonAlert here rather than the full imperative-overlay pattern
// OverlayProvider will eventually own (§5) — that needs the account-switcher/upgrade-prompt
// machinery later phases build. Functionally equivalent for now: the write screen never mounts,
// and declining returns the user to where they came from.

import { useState } from 'react';
import { Route, useHistory } from 'react-router-dom';
import type { RouteProps } from 'react-router-dom';
import { IonAlert } from '@ionic/react';
import { useCanWrite } from '../../state/accountsStore.js';

export function WriteGuardRoute(props: RouteProps) {
  const canWrite = useCanWrite();
  const history = useHistory();
  const [dismissed, setDismissed] = useState(false);

  if (canWrite) {
    return <Route {...props} />;
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
