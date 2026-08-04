// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The client factory (§7). Exposes getClient() rather than a singleton, because the correct
// bearer changes with the active account and, for the notification service's read token, with
// the purpose. Reads the right token from secure storage (§8), falling back to the app's
// registered client id when there is no active account or its token is missing (needs-reauth) —
// auth.md's anonymous rule, and never a credential-less request. Injects platform/http.ts and
// platform/upload.ts so nothing above this module knows about Capacitor.

import { BlipfotoClient } from '@b-oss/b-api';
import { isNativePlatform } from '../platform/appState.js';
import { platformFetch } from '../platform/http.js';
import { getMultipartImpl } from '../platform/upload.js';
import { getToken } from '../platform/secureStorage.js';
import type { TokenPurpose } from '../platform/secureStorage.js';
import { useAccountsStore } from '../state/accountsStore.js';

// Blipfoto serves no CORS headers, so a browser fetch() is blocked outside the dev proxy
// vite.config.ts sets up. On device, platform/http.ts's CapacitorHttp path has no such
// restriction, so it always talks to the real host.
function resolveBaseUrl(): string {
  if (isNativePlatform() || !import.meta.env.DEV) {
    return 'https://api.blipfoto.com/4/';
  }
  return '/api/blipfoto/4/';
}

function anonymousClient(): BlipfotoClient {
  const clientId = import.meta.env.VITE_BLIPFOTO_CLIENT_ID as string;
  return new BlipfotoClient(clientId, resolveBaseUrl(), platformFetch, getMultipartImpl());
}

/** A client bearing the active account's token for the given purpose, or the anonymous client
 * id if there's no active account or its token for that purpose is missing. */
export async function getClient(purpose: TokenPurpose = 'app'): Promise<BlipfotoClient> {
  const { accounts, activeAccountId } = useAccountsStore.getState();
  const active = accounts.find((a) => a.id === activeAccountId);
  if (!active) return anonymousClient();

  const token = await getToken(active.id, purpose);
  if (!token) return anonymousClient();

  return new BlipfotoClient(token, resolveBaseUrl(), platformFetch, getMultipartImpl());
}

/** A client bearing an explicit token — for verifying a just-obtained OAuth token (before it's
 * stored against any account) and for revoking a specific token, which auth.md requires be
 * authenticated with itself, not whichever token is currently active. */
export function getClientForToken(accessToken: string): BlipfotoClient {
  return new BlipfotoClient(accessToken, resolveBaseUrl(), platformFetch, getMultipartImpl());
}
