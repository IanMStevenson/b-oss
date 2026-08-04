// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/app's appUrlOpen: inbound URL and share-intent events (§16). One resolver
// (src/flows/deepLinkResolver.ts, Phase 2+) handles all three inbound paths — the OAuth
// redirect, entry/profile deep links, and share-to-Blipfoto — so cold start and warm start can't
// diverge.
// TODO(Phase 2): implement against @capacitor/app's appUrlOpen listener.

export function onAppUrlOpen(_handler: (url: string) => void): () => void {
  return () => {};
}
