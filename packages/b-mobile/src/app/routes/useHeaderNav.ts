// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The router bits AppHeader needs, kept out of useAppNavigate so screens that mock that module
// still get a working header.

import { useContext } from 'react';
import { NavContext } from '@ionic/react';
import { useInRouterContext, useLocation, useNavigate } from 'react-router-dom';

export const HOME_PATH = '/browse';

export interface HeaderNav {
  /** True when this screen was pushed from inside another screen (every `navigate.push` marks
   * it), as opposed to being reached from the nav menu. Router state, so it is gone after a
   * refresh/deep link — which correctly falls back to the menu variant. */
  drilledIn: boolean;
  isHome: boolean;
  /** Go to Browse (the home screen) and clear the page stack. */
  goHome: () => void;
}

export function useHeaderNav(): HeaderNav {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const ionNav = useContext(NavContext);
  const marked: unknown = location.state;
  return {
    drilledIn:
      typeof marked === 'object' &&
      marked !== null &&
      (marked as { drilledIn?: unknown }).drilledIn === true,
    isHome: pathname === HOME_PATH || pathname === `${HOME_PATH}/`,
    goHome: () => {
      // Under Ionic's router, a 'root' replace resets the page stack; without it (tests) a plain
      // replace is the closest equivalent.
      if (ionNav.hasIonicRouter()) ionNav.navigate(HOME_PATH, 'root', 'replace');
      else navigate(HOME_PATH, { replace: true });
    },
  };
}

/** False when rendered outside any Router (isolated screen tests). */
export function useHasRouter(): boolean {
  return useInRouterContext();
}
