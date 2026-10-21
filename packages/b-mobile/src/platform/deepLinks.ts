// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/app's launch-URL/appUrlOpen surface — cold start and warm start, respectively.
// flows/deepLinkResolver.ts is the one resolver that handles all three inbound paths (the OAuth
// redirect, entry/profile deep links, and the opt-in blipfoto.com web link) against whichever of
// these two gave it the URL, so cold start and warm start can't diverge (§16). The OAuth round
// (flows/oauthRound.ts) also listens to `onAppUrlOpen` directly, scoped to just its own redirect
// prefix, for the duration of one in-progress round — both listeners coexist safely since
// deepLinkResolver's own resolution explicitly ignores the OAuth redirect (never routes it).

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';

export function onAppUrlOpen(handler: (url: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: { remove: () => void } | undefined;
  void App.addListener('appUrlOpen', (event) => handler(event.url)).then((h) => {
    handle = h;
  });
  return () => handle?.remove();
}

/** Cold start's counterpart to `onAppUrlOpen` — the URL the app was actually launched with, if
 * any (a normal launch from the home screen icon has none). Checked once, at launch. */
export async function getLaunchUrl(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;
  const result = await App.getLaunchUrl();
  return result?.url ?? null;
}
