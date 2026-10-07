// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The client factory (§7). Exposes getClient() rather than a singleton, because the correct
// bearer changes with the active account and, for the notification service's read token, with
// the purpose. Reads the right token from secure storage (§8), falling back to the app's
// registered client id when there is no active account or its token is missing (needs-reauth) —
// auth.md's anonymous rule, and never a credential-less request. Injects platform/http.ts and
// platform/upload.ts so nothing above this module knows about Capacitor.

import { BlipfotoClient, BlipfotoError } from '@b-oss/b-api';
import { isNativePlatform } from '../platform/appState.js';
import { platformFetch } from '../platform/http.js';
import { getMultipartImpl } from '../platform/upload.js';
import { getToken } from '../platform/secureStorage.js';
import type { TokenPurpose } from '../platform/secureStorage.js';
import { useAccountsStore } from '../state/accountsStore.js';
import { authReady } from '../state/authReady.js';

// Blipfoto serves no CORS headers, so a browser fetch() is blocked outside the dev proxy
// vite.config.ts sets up. On device, platform/http.ts's CapacitorHttp path has no such
// restriction, so it always talks to the real host.
function resolveBaseUrl(): string {
  if (isNativePlatform() || !import.meta.env.DEV) {
    return 'https://api.blipfoto.com/4/';
  }
  // Must be absolute — b-api's buildUrl() does `new URL(path, baseUrl)`, and the WHATWG URL
  // constructor rejects a relative base ("Invalid base URL") even though a relative path here
  // would otherwise resolve fine against the page's own origin via fetch().
  return `${window.location.origin}/api/blipfoto/4/`;
}

// FLW-02: a 50/51 on any call made with an account's own app token means that token is dead
// (revoked on blipfoto.com, say), so the account must drop into needs-reauth rather than show
// "The user access token is invalid" with a Retry that can never work. Only the upload queue used
// to act on it (b-oss#261). The handler is registered by flows/accountsFlow.ts, which owns
// handleForcedLogout; importing it here would be circular (accountsFlow.ts imports this module).
let onAppTokenRejected: (accountId: string) => void = () => {};

export function setAppTokenRejectedHandler(handler: (accountId: string) => void): void {
  onAppTokenRejected = handler;
}

// Blipfoto reports errors inside a normal 200 envelope, so the status alone says nothing. A cheap
// text check first: every response carries an "error" key, but only a token failure has code 50/51.
const TOKEN_REJECTED = /"code"\s*:\s*5[01]\b/;

function fetchForAppToken(accountId: string): typeof fetch {
  return async (input, init) => {
    const response = await platformFetch(input, init);
    const text = await response.clone().text();
    if (TOKEN_REJECTED.test(text)) {
      try {
        const code = (JSON.parse(text) as { error?: { code?: unknown } | null }).error?.code;
        if (code === 50 || code === 51) onAppTokenRejected(accountId);
      } catch {
        // Not JSON: not a Blipfoto error envelope, so nothing to act on.
      }
    }
    return response;
  };
}

/** The fetch a client for `accountId`'s token should use: the app token is watched for
 * rejection; the service token is b-push's to judge, so it isn't. */
function fetchFor(accountId: string, purpose: TokenPurpose): typeof fetch {
  return purpose === 'app' ? fetchForAppToken(accountId) : platformFetch;
}

function anonymousClient(): BlipfotoClient {
  const clientId = import.meta.env.VITE_BLIPFOTO_CLIENT_ID as string;
  return new BlipfotoClient(clientId, resolveBaseUrl(), platformFetch, getMultipartImpl());
}

/** A client bearing the active account's token for the given purpose, or the anonymous client
 * id if there's no active account or its token for that purpose is missing. Waits for authReady
 * first — accountsStore's own hydration (and, in dev/browser-testing, the VITE_DEV_TOKEN seed)
 * is asynchronous, and a screen that fetches on mount would otherwise race ahead of it and read
 * a not-yet-populated activeAccountId as "signed out," silently falling back to the anonymous
 * client (see authReady.ts's own doc comment for what that produces downstream). */
export async function getClient(purpose: TokenPurpose = 'app'): Promise<BlipfotoClient> {
  await authReady;
  const { accounts, activeAccountId } = useAccountsStore.getState();
  const active = accounts.find((a) => a.id === activeAccountId);
  if (!active) return anonymousClient();

  const token = await getToken(active.id, purpose);
  if (!token) return anonymousClient();

  return new BlipfotoClient(
    token,
    resolveBaseUrl(),
    fetchFor(active.id, purpose),
    getMultipartImpl(),
  );
}

/** For calls whose content doesn't depend on who's asking — Browse (Recent/Popular/Nearby, not
 * Following/Just-me, which are genuinely account-specific), Tag entries, Search, entry viewing,
 * and Map. Rate limits are tracked per access token (api-general.md: "your app and each user of
 * your app has a separate limit"), so the app-level anonymous token has its own separate 15-
 * minute allowance from the active account's own token — if the account's token is rate-limited,
 * retrying once against the anonymous client can still succeed instead of surfacing a hard
 * failure for what would otherwise look the same either way.
 *
 * Never use this for identity-bound calls (Me/Following/Just-me/Followers/Requests/Refused/
 * Awards/Notifications/Settings, or any write) — anonymous doesn't make sense for "my" data, and
 * those should keep surfacing a clean rate-limit error rather than silently switching identity. */
export async function withRateLimitFallback<T>(
  fn: (client: BlipfotoClient) => Promise<T>,
): Promise<T> {
  const client = await getClient();
  try {
    return await fn(client);
  } catch (err) {
    if (err instanceof BlipfotoError && err.isRateLimited) {
      return fn(anonymousClient());
    }
    throw err;
  }
}

/** A client bearing an explicit token — for verifying a just-obtained OAuth token (before it's
 * stored against any account) and for revoking a specific token, which auth.md requires be
 * authenticated with itself, not whichever token is currently active. */
export function getClientForToken(accessToken: string): BlipfotoClient {
  return new BlipfotoClient(accessToken, resolveBaseUrl(), platformFetch, getMultipartImpl());
}

/** A client bearing a specific account's token, regardless of which account is currently active —
 * the upload queue runner (§9) needs this: a background upload for account A must keep running
 * even if the user switches the active account to B mid-upload. Throws (never silently falls
 * back to the anonymous client) if the account has no token for the purpose, since a queued
 * upload with no usable token is exactly the "needs reauth" case the runner must surface as a
 * failed item, not attempt anonymously. */
export async function getClientForAccount(
  accountId: string,
  purpose: TokenPurpose = 'app',
): Promise<BlipfotoClient> {
  const token = await getToken(accountId, purpose);
  if (!token) {
    throw new Error(`No ${purpose} token held for account ${accountId} — needs reauthorization.`);
  }
  return new BlipfotoClient(
    token,
    resolveBaseUrl(),
    fetchFor(accountId, purpose),
    getMultipartImpl(),
  );
}
