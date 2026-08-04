// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The thin wrapper screens use instead of react-router's own hooks (§5's hard rule: react-router
// may be imported only in src/app/routes/). This is what keeps the eventual Ionic 9 / React
// Router 6 migration to one directory instead of 28 screens.

import { useHistory } from 'react-router-dom';

export interface AppNavigate {
  push: (path: string) => void;
  replace: (path: string) => void;
  goBack: () => void;
}

export function useAppNavigate(): AppNavigate {
  const history = useHistory();
  return {
    push: (path) => history.push(path),
    replace: (path) => history.replace(path),
    goBack: () => history.goBack(),
  };
}
