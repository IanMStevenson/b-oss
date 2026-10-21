// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// A read-gate, for account-scoped routes that aren't a *write* action (WriteGuardRoute handles
// those) but still need a signed-in account before they can render anything at all — SCR-23/
// SCR-24, reached via a badge tap in the nav *and* via a tapped push, which can happen while
// signed out (FLW-16 step 3: "If the user isn't signed in, route via FLW-01"). Most account-
// scoped screens in this app (SCR-20/21/25/30...) don't need this — they're only ever reached
// through nav items that are themselves hidden while signed out. The inboxes are reachable from
// outside the app's own nav (a system push notification), so they need their own gate.
//
// Same "You must be signed in to do this" prompt as every other gated entry point (FLW-01,
// b-oss#397): Sign in now goes to the sign-in screen, which returns here once signed in (read-only
// is enough for an inbox); Cancel goes to Browse, since a push tap may have opened the app here.

import { useState } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useActiveAccount } from '../../state/accountsStore.js';
import { SignInRequiredAlert } from '../../components/SignInRequiredAlert.js';
import { signInPathFor } from './signInReturn.js';

export function AccountGuardRoute({ children }: { children: ReactNode }) {
  const activeAccount = useActiveAccount();
  const { pathname, search } = useLocation();
  const navigate = useNavigate();
  const [dismissed, setDismissed] = useState(false);

  if (activeAccount) {
    return <>{children}</>;
  }

  return (
    <SignInRequiredAlert
      isOpen={!dismissed}
      onClose={(signIn) => {
        setDismissed(true);
        navigate(signIn ? signInPathFor(pathname + search) : '/browse', { replace: true });
      }}
    />
  );
}
