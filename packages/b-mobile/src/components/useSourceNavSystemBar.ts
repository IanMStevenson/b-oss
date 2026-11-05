// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// While the source-list bar (b-oss#819) shows, the Android navigation-bar area below it takes the
// bar's green (CSS: `.source-nav-active .system-nav-strip`, globals.css) so the two read as one,
// and the navigation bar's icons go light to stay legible on it. Reverts when the bar goes.

import { useEffect } from 'react';
import { applySystemBarStyles } from '../platform/systemBars.js';
import { getResolvedTheme, isDarkTheme } from '../theme/theme.js';

export function useSourceNavSystemBar(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    document.documentElement.classList.add('source-nav-active');
    void applySystemBarStyles(true);
    return () => {
      document.documentElement.classList.remove('source-nav-active');
      void applySystemBarStyles(isDarkTheme(getResolvedTheme()));
    };
  }, [active]);
}
