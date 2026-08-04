// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/browser: open an external URL / an OAuth round (§8, §16). On device this
// uses Android Custom Tabs / iOS SFSafariViewController — not an in-app WebView — so the user's
// existing Blipfoto session and password manager work. Web fallback opens a new tab, adequate
// for desktop-browser development though the OAuth round itself isn't testable that way.
// TODO(Phase 2): implement the native @capacitor/browser path.

import { Capacitor } from '@capacitor/core';

export function openUrl(url: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return Promise.resolve();
  }
  return Promise.reject(
    new Error('platform/browser.ts: native browser open not implemented until Phase 2'),
  );
}
