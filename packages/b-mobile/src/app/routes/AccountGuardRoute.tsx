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
// Deliberately reuses signInGated() (FLW-01) rather than inventing a read-only-capable gated sign-
// in — this app has no separate "gated read" flow; every other gated entry point (WriteGuardRoute,
// ProfileScreen's follow action, SCR-06's star/favourite/comment) reuses the same function.

import { useEffect, useRef, useState } from 'react';
import { Route, useHistory } from 'react-router-dom';
import type { RouteProps } from 'react-router-dom';
import { useActiveAccount } from '../../state/accountsStore.js';
import { signInGated } from '../../flows/accountsFlow.js';

export function AccountGuardRoute(props: RouteProps) {
  const activeAccount = useActiveAccount();
  const history = useHistory();
  const attemptedSignIn = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!activeAccount && !attemptedSignIn.current) {
      attemptedSignIn.current = true;
      signInGated().catch(() => setFailed(true));
    }
  }, [activeAccount]);

  useEffect(() => {
    if (failed) history.replace('/browse');
  }, [failed, history]);

  if (activeAccount) {
    return <Route {...props} />;
  }

  // Waiting on the sign-in round kicked off above (or, once it's failed, on the redirect effect
  // above) — the browser overlay is the visible UI in the meantime.
  return null;
}
