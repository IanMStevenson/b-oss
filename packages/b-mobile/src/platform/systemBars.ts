// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// System-bar contrast (b-oss#300). The app draws edge-to-edge, so the status and navigation bars
// are transparent and show whatever is behind them. Top: the header's green, so the status bar
// takes light icons. Bottom: a solid strip drawn by the web layer (.system-nav-strip,
// globals.css) so scrolling content never shows through the navigation bar, so the navigation bar
// takes dark icons. Native only; a no-op in a browser.

import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from '@capacitor/core';

export async function applySystemBarStyles(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    // "Dark" = light icons (for a dark background); "Light" = dark icons.
    await SystemBars.setStyle({ bar: SystemBarType.StatusBar, style: SystemBarsStyle.Dark });
    await SystemBars.setStyle({ bar: SystemBarType.NavigationBar, style: SystemBarsStyle.Light });
  } catch {
    // Cosmetic only; the bars keep their default appearance.
  }
}
