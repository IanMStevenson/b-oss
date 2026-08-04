// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps CapacitorHttp in a fetch-shaped function for b-api's transport seam (§7). Required on
// device regardless of preference: Blipfoto serves no CORS headers, so a WebView fetch() to
// api.blipfoto.com is blocked. On web (vite dev / desktop browser), plain fetch works via the
// dev-only proxy configured in vite.config.ts.
// TODO(Phase 2): implement the CapacitorHttp-backed native path.

import { Capacitor } from '@capacitor/core';

export const platformFetch: typeof fetch = (input, init) => {
  if (Capacitor.isNativePlatform()) {
    throw new Error(
      'platform/http.ts: native CapacitorHttp transport not implemented until Phase 2',
    );
  }
  return fetch(input, init);
};
