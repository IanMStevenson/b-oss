// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/app's appUrlOpen: inbound URL and share-intent events (§16). One resolver
// (src/flows/deepLinkResolver.ts, Phase 3+) will handle all three inbound paths — the OAuth
// redirect, entry/profile deep links, and share-to-Blipfoto — so cold start and warm start can't
// diverge. For now only the OAuth round (Phase 2) listens here directly.

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
