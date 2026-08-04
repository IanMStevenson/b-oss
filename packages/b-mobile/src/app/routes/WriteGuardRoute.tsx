// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The write-gate, implemented once (§5): a read-only account must never reach a write screen —
// "a dedicated write screen ... never opens in the first place; the prompt is shown instead of
// navigating to it" (rules.md). This is what makes the deep-link and share-intent bypass paths
// impossible to forget, since all three arrive through the router.
// TODO(Phase 2): show the in-place "this account is read-only" upgrade prompt (rules.md's only
// unprompted route to a mode change) instead of redirecting; wire the Star/Favourite/comment
// "confirm the account" pre-check ordering rules.md describes.

import { Route, Redirect } from 'react-router-dom';
import type { RouteProps } from 'react-router-dom';
import { useCanWrite } from '../../state/accountsStore.js';

export function WriteGuardRoute(props: RouteProps) {
  const canWrite = useCanWrite();
  if (!canWrite) {
    return <Redirect to="/browse" />;
  }
  return <Route {...props} />;
}
