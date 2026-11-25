// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps the local EmbeddedAuthPlugin (android/app/.../EmbeddedAuthPlugin.java — not an npm
// package, single-project only, same shape as platform/blipfotoLinks.ts). Runs an OAuth round in
// an app-owned WebView with cookies cleared up front, rather than the system browser's Custom
// Tabs (platform/browser.ts), so it forces a fresh Blipfoto login even when another account is
// already signed in on the system browser — flows/oauthRound.ts's `useEmbedded` option. Android
// and the desktop shell (platform/desktop.ts: a throwaway window with its own session, behind the
// shell's bridge); no ios/ project yet. Calling this on a platform with no implementation rejects
// rather than silently hanging.

import { registerPlugin } from '@capacitor/core';
import { desktopBridge } from './desktop.js';
import { isCapacitorNative } from './platformKind.js';

interface EmbeddedAuthPlugin {
  open(options: {
    url: string;
    redirectPrefix: string;
    sessionToken?: string;
  }): Promise<{ redirectUrl: string }>;
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
 * EmbeddedAuthUnavailableError off-native.
 *
 * `sessionToken` (b-oss#1064): the sign-in page is on the website, so the round also logs the member
 * into it. Given a token, the host keeps that login under it, apart from every account's session,
 * for platform/siteSession.ts's `siteAdoptPending` (the account is not known yet) or
 * `siteDiscardPending`. Without one nothing website-side outlives the round. */
export async function openEmbeddedAuth(
  url: string,
  redirectPrefix: string,
  sessionToken?: string,
): Promise<string> {
  const desktop = desktopBridge();
  if (!desktop && !isCapacitorNative()) throw new EmbeddedAuthUnavailableError();
  try {
    if (desktop) return await desktop.openAuth(url, redirectPrefix, sessionToken);
    const result = await EmbeddedAuth.open({ url, redirectPrefix, sessionToken });
    return result.redirectUrl;
  } catch (err) {
    if (err instanceof Error && err.message === 'cancelled') throw new EmbeddedAuthCancelledError();
    throw err;
  }
}
