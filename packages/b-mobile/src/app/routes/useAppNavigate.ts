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
  /** Pop history if this screen was reached from inside the app; otherwise (a deep link opened
   * fresh, no earlier entry) replace with `fallback`. Use for "close/save and return" paths so a
   * return never stacks a second copy of the screen underneath. */
  goBackOr: (fallback: string) => void;
}

/** Router state marking an in-app push: the header shows ← rather than ☰ for such a screen. */
function markDrilledIn(state: unknown): unknown {
  if (state === undefined || state === null) return { drilledIn: true };
  if (typeof state === 'object') return { ...state, drilledIn: true };
  return state;
}

export function useAppNavigate(): AppNavigate {
  const navigate = useNavigate();
  const location = useLocation();
  return {
    // Every in-app push marks itself drilled-in; menu links (plain routerLink) don't.
    push: (path, state) => navigate(path, { state: markDrilledIn(state) }),
    replace: (path, state) => navigate(path, { state, replace: true }),
    goBack: () => navigate(-1),
    // React Router gives the first location of a session the key 'default'.
    goBackOr: (fallback) => {
      if (location.key === 'default') navigate(fallback, { replace: true });
      else navigate(-1);
    },
  };
}

/** The entry id whose screen pushed the full-screen photo (router state `photoFrom`), if any. */
export function usePhotoOpenedFrom(): string | undefined {
  const state: unknown = useLocation().state;
  if (typeof state !== 'object' || state === null) return undefined;
  const from = (state as { photoFrom?: unknown }).photoFrom;
  return typeof from === 'string' ? from : undefined;
}
