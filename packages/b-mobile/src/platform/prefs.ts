// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/preferences: non-sensitive persisted key/value only — never tokens (§3, §8).
// Web fallback uses localStorage directly, which is genuinely usable for desktop-browser
// development, not just a placeholder.
// TODO(Phase 2): implement the native @capacitor/preferences path.

import { Capacitor } from '@capacitor/core';

export function getPref(key: string): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return Promise.resolve(localStorage.getItem(key));
  return Promise.reject(
    new Error('platform/prefs.ts: native preferences not implemented until Phase 2'),
  );
}

export function setPref(key: string, value: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.setItem(key, value);
    return Promise.resolve();
  }
  return Promise.reject(
    new Error('platform/prefs.ts: native preferences not implemented until Phase 2'),
  );
}

export function deletePref(key: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    localStorage.removeItem(key);
    return Promise.resolve();
  }
  return Promise.reject(
    new Error('platform/prefs.ts: native preferences not implemented until Phase 2'),
  );
}
