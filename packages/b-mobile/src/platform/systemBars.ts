// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// System-bar contrast (b-oss#300). The app draws edge-to-edge, so the status and navigation bars
// are transparent and show whatever is behind them. Top: the header's green, so the status bar
// takes light icons. Bottom: a solid strip drawn by the web layer (.system-nav-strip,
// globals.css) so scrolling content never shows through the navigation bar, so the navigation bar
// takes dark icons. Native only; a no-op in a browser.
//
// Dark and Mid (b-oss#549): the top bar stays brand green in every theme, so the status bar keeps
// light icons; the strip under the navigation bar takes the theme's page colour, so the navigation
// bar's icons follow whether the theme is dark.

import { SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';
import { isCapacitorNative } from './platformKind.js';

export async function applySystemBarStyles(darkTheme = false): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    // "Dark" = light icons (for a dark background); "Light" = dark icons.
    await SystemBars.setStyle({ bar: SystemBarType.StatusBar, style: SystemBarsStyle.Dark });
    await SystemBars.setStyle({
      bar: SystemBarType.NavigationBar,
      style: darkTheme ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
    });
  } catch {
    // Cosmetic only; the bars keep their default appearance.
  }
}
