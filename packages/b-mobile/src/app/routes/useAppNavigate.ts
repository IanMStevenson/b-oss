// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The thin wrapper screens use instead of react-router's own hooks (§5's hard rule: react-router
// may be imported only in src/app/routes/). This is what kept the Ionic 9 / React Router 6
// migration to one directory instead of 28 screens.

import { useLocation, useNavigate } from 'react-router-dom';

export interface AppNavigate {
  /** `state` is for screen-to-screen handoff with no deep-link use case (e.g. which comment
   * SCR-15 is replying to/editing) — anything a direct link or refresh must still work without
   * belongs in the URL as a route param instead, per §5. */
  push: (path: string, state?: unknown) => void;
  replace: (path: string, state?: unknown) => void;
  goBack: () => void;
}

export function useAppNavigate(): AppNavigate {
  const navigate = useNavigate();
  return {
    push: (path, state) => navigate(path, { state }),
    replace: (path, state) => navigate(path, { state, replace: true }),
    goBack: () => navigate(-1),
  };
}

/** True when this screen was pushed from another screen's row (a drill-in) with
 * `navigate.push(path, { drilledIn: true })`, as opposed to being reached from the nav menu. A
 * screen that is both a menu destination and a drill-in (Accounts, Hidden members — also rows in
 * Settings) uses it to choose the back arrow over the menu button. Router state, so it is gone
 * after a refresh/deep link — which correctly falls back to the menu variant. */
export function useIsDrilledIn(): boolean {
  const state: unknown = useLocation().state;
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { drilledIn?: unknown }).drilledIn === true
  );
}
