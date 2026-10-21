// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps the local EmbeddedAuthPlugin (android/app/.../EmbeddedAuthPlugin.java — not an npm
// package, single-project only, same shape as platform/blipfotoLinks.ts). Runs an OAuth round in
// an app-owned WebView with cookies cleared up front, rather than the system browser's Custom
// Tabs (platform/browser.ts), so it forces a fresh Blipfoto login even when another account is
// already signed in on the system browser — flows/oauthRound.ts's `useEmbedded` option. Android
// only for now (no ios/ project in this app yet); calling this off-native or on a platform with
// no registered implementation rejects rather than silently hanging.

import { Capacitor, registerPlugin } from '@capacitor/core';

interface EmbeddedAuthPlugin {
  open(options: { url: string; redirectPrefix: string }): Promise<{ redirectUrl: string }>;
}

const EmbeddedAuth = registerPlugin<EmbeddedAuthPlugin>('EmbeddedAuth');

export class EmbeddedAuthCancelledError extends Error {
  constructor() {
    super('Embedded sign-in cancelled');
    this.name = 'EmbeddedAuthCancelledError';
  }
}

export class EmbeddedAuthUnavailableError extends Error {
  constructor() {
    super('Embedded sign-in is only available on Android');
    this.name = 'EmbeddedAuthUnavailableError';
  }
}

/** Opens the embedded sign-in WebView and resolves with the redirect URL it captured once
 * navigation reaches `redirectPrefix` — same shape as a captured `appUrlOpen` event, so
 * oauthRound.ts's `finishRound()` parses it identically either way. Rejects with
 * EmbeddedAuthCancelledError if the user backs out without completing, or
 * EmbeddedAuthUnavailableError off-native. */
export async function openEmbeddedAuth(url: string, redirectPrefix: string): Promise<string> {
  if (!Capacitor.isNativePlatform()) throw new EmbeddedAuthUnavailableError();
  try {
    const result = await EmbeddedAuth.open({ url, redirectPrefix });
    return result.redirectUrl;
  } catch (err) {
    if (err instanceof Error && err.message === 'cancelled') throw new EmbeddedAuthCancelledError();
    throw err;
  }
}
