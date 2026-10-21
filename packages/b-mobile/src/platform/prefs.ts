// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/preferences: non-sensitive persisted key/value only — never tokens (§3, §8).
// Web fallback uses localStorage directly, which is genuinely usable for desktop-browser
// development, not just a placeholder.

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export async function getPref(key: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return localStorage.getItem(key);
  const { value } = await Preferences.get({ key });
  return value;
}

export async function setPref(key: string, value: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(key, value);
    return;
  }
  await Preferences.set({ key, value });
}

export async function deletePref(key: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.removeItem(key);
    return;
  }
  await Preferences.remove({ key });
}
