// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps the local ThemePlugin (android/app/.../ThemePlugin.java — not an npm package,
// single-project only; b-oss#549). It tells Android the chosen theme so that, before and outside
// the web layer, the window and WebView background are the theme's page colour (no white flash at
// launch, including Mid on a phone that is in light mode) and Android's own night mode matches
// (system dialogs, pickers and WebViews take their dark variants for Dark and Mid). It is also
// applied natively at the next launch, before the WebView exists, from what this stored.
// Web/iOS have no such mechanism, so every export is a no-op off native, like the other
// platform/*.ts modules.

import { registerPlugin } from '@capacitor/core';
import type { ThemePreference } from '../theme/themeTypes.js';
import { isCapacitorNative } from './platformKind.js';

interface ThemePlugin {
  setTheme(options: { preference: ThemePreference }): Promise<void>;
}

const Theme = registerPlugin<ThemePlugin>('Theme');

export async function setNativeTheme(preference: ThemePreference): Promise<void> {
  if (!isCapacitorNative()) return;
  try {
    await Theme.setTheme({ preference });
  } catch {
    // Cosmetic only: the web layer still draws the theme.
  }
}
