// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The thin wrapper screens use instead of react-router's own hooks (§5's hard rule: react-router
// may be imported only in src/app/routes/). This is what keeps the eventual Ionic 9 / React
// Router 6 migration to one directory instead of 28 screens.

import { useHistory } from 'react-router-dom';

export interface AppNavigate {
  /** `state` is for screen-to-screen handoff with no deep-link use case (e.g. which comment
   * SCR-15 is replying to/editing) — anything a direct link or refresh must still work without
   * belongs in the URL as a route param instead, per §5. */
  push: (path: string, state?: unknown) => void;
  replace: (path: string, state?: unknown) => void;
  goBack: () => void;
}

export function useAppNavigate(): AppNavigate {
  const history = useHistory();
  return {
    push: (path, state) => history.push(path, state),
    replace: (path, state) => history.replace(path, state),
    goBack: () => history.goBack(),
  };
}
