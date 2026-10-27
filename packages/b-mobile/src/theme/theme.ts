// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Colour theme (b-oss#549). The user's choice is a ThemePreference; what is actually drawn is a
// ResolvedTheme. "system" follows Android's dark-theme setting and picks light or dark — never mid
// (mid is a deliberate choice). The resolved theme is written to <html data-theme>, which is what
// b-visual's themes.css keys on. Mid is a dark theme for everything outside the colour tokens
// (system-bar icons, `color-scheme`, native pickers), hence isDarkTheme().
//
// Launch without a flash: the persisted prefs load asynchronously (Capacitor Preferences), far too
// late for the first paint. So the choice is mirrored into localStorage, which the inline script in
// index.html reads synchronously before anything draws; initTheme() then takes over.

import { useDevicePrefsStore } from '../state/devicePrefsStore.js';
import { applySystemBarStyles } from '../platform/systemBars.js';
import { isThemePreference, type ResolvedTheme, type ThemePreference } from './themeTypes.js';

export type { ThemePreference, ResolvedTheme } from './themeTypes.js';
export { THEME_PREFERENCES, isThemePreference } from './themeTypes.js';

/** Key shared with the inline pre-paint script in index.html. */
export const THEME_STORAGE_KEY = 'b-mobile:theme';

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}

export function isDarkTheme(theme: ResolvedTheme): boolean {
  return theme !== 'light';
}

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches;
}

/** Draws `theme`: the attribute themes.css keys on, plus the native system bars. */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset.theme = theme;
  void applySystemBarStyles(isDarkTheme(theme));
}

function mirror(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Storage unavailable: the next launch just resolves from the persisted prefs a beat later.
  }
}

/**
 * Applies the stored preference now (synchronously, before first render) and keeps the DOM in step
 * with the Theme setting and, for "system", with Android's dark-theme setting. Call once at startup.
 */
export function initTheme(): void {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    // Treated as no stored choice.
  }
  const initial = isThemePreference(stored) ? stored : 'system';
  applyTheme(resolveTheme(initial, systemPrefersDark()));

  const current = (): ThemePreference => useDevicePrefsStore.getState().theme;
  useDevicePrefsStore.subscribe((state, prev) => {
    if (state.theme === prev.theme) return;
    mirror(state.theme);
    applyTheme(resolveTheme(state.theme, systemPrefersDark()));
  });
  if (typeof window.matchMedia === 'function') {
    window.matchMedia(DARK_QUERY).addEventListener('change', (e) => {
      if (current() === 'system') applyTheme(resolveTheme('system', e.matches));
    });
  }
}
