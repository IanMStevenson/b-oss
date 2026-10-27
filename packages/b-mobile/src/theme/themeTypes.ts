// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The theme vocabulary, kept apart from theme.ts so the prefs store can use it without a cycle
// (theme.ts reads the store).

export type ThemePreference = 'system' | 'light' | 'dark' | 'mid';
export type ResolvedTheme = 'light' | 'dark' | 'mid';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark', 'mid'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === 'string' && (THEME_PREFERENCES as readonly string[]).includes(value);
}
