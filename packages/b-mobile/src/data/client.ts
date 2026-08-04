// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The client factory (§7). Exposes getClient() rather than a singleton, because the correct
// bearer changes with the active account. Injects platform/http.ts and platform/upload.ts so
// nothing above this module knows about Capacitor.
// TODO(Phase 2): accept a `purpose` param and read the active account's token from
// platform/secureStorage.ts, falling back to the anonymous client id per auth.md — this is the
// anonymous-only version.

import { BlipfotoClient } from '@b-oss/b-api';
import { isNativePlatform } from '../platform/appState.js';
import { platformFetch } from '../platform/http.js';
import { getMultipartImpl } from '../platform/upload.js';

// Blipfoto serves no CORS headers, so a browser fetch() is blocked outside the dev proxy
// vite.config.ts sets up. On device, platform/http.ts's CapacitorHttp path has no such
// restriction, so it always talks to the real host.
function resolveBaseUrl(): string {
  if (isNativePlatform() || !import.meta.env.DEV) {
    return 'https://api.blipfoto.com/4/';
  }
  return '/api/blipfoto/4/';
}

export function getClient(): BlipfotoClient {
  const clientId = import.meta.env.VITE_BLIPFOTO_CLIENT_ID as string;
  return new BlipfotoClient(clientId, resolveBaseUrl(), platformFetch, getMultipartImpl());
}
