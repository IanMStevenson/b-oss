// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/browser: open an external URL / an OAuth round (§8, §16). On device this
// uses Android Custom Tabs / iOS SFSafariViewController — not an in-app WebView — so the user's
// existing Blipfoto session and password manager work. Web fallback opens a new tab, adequate
// for desktop-browser development though the OAuth round itself isn't testable that way (no
// appUrlOpen event exists outside a native shell — see platform/deepLinks.ts).

import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

export async function openUrl(url: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  await Browser.open({ url });
}

export async function closeBrowser(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await Browser.close();
}

/** Fires when the user closes the in-app browser manually (Android/iOS only) — the signal an
 * in-progress OAuth round uses to detect a cancellation that never reaches the redirect. */
export function onBrowserFinished(handler: () => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: { remove: () => void } | undefined;
  void Browser.addListener('browserFinished', handler).then((h) => {
    handle = h;
  });
  return () => handle?.remove();
}
