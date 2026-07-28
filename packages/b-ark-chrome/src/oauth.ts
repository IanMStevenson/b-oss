// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Distributed-app (implicit grant) OAuth capture for Chrome extensions.
// Ported from spikes/oauth-distributed-capture/sw.js.
//
// Opens the Blipfoto authorize page in a tab; captures the custom-scheme 302
// redirect via the single, proven mechanism webRequest.onBeforeRedirect. This
// fires on the HTTP 302 response at the network layer and surfaces the raw
// Location header (with the token-bearing fragment intact) before the browser
// attempts the unhandled bark-chrome:// navigation. On success, encrypts the
// token via storeToken and writes { oauthStatus, username } to
// chrome.storage.local so the popup can update its UI.

import { buildImplicitGrantUrl, parseImplicitGrantCallback } from '@b-oss/b-api';
// Import the shared platform primitive by subpath (not the package barrel) so the
// service-worker bundle doesn't pull in the React BackupPage/chip from index.ts.
import { storeToken } from '@b-oss/b-ark-ui-chrome/src/token-storage.js';

const REDIRECT_URI = 'bark-chrome://oauth/callback';
const SCHEME = 'bark-chrome://';
const TIMEOUT_MS = 120_000;

export async function startOAuthFlow(clientId: string): Promise<void> {
  // Reset any prior OAuth status (and stale error) so the eventual success/error
  // write is always a real storage transition. chrome.storage.onChanged does not
  // fire when a value is re-set to its existing value, so without this a second
  // sign-in with the same outcome as the last one (e.g. sign out → sign back in)
  // would re-write oauthStatus:'success', emit no change event, and strand the UI
  // on the sign-in screen even though the token was captured.
  await chrome.storage.local.set({ oauthStatus: 'pending' });
  await chrome.storage.local.remove('oauthError');

  if (!clientId) {
    await chrome.storage.local.set({
      oauthStatus: 'error',
      oauthError: 'No client_id configured — set VITE_CHROME_CLIENT_ID and rebuild.',
    });
    return;
  }

  const state = crypto.randomUUID();
  let captured = false;
  let authTabId: number | null = null;

  const cleanup = (): void => {
    chrome.webRequest.onBeforeRedirect.removeListener(onRedirect);
  };

  async function handle(url: string, via: string): Promise<void> {
    if (captured) return;
    captured = true;
    cleanup();
    if (authTabId !== null) chrome.tabs.remove(authTabId).catch(() => undefined);

    let accessToken: string;
    let username: string;
    try {
      const parsed = parseImplicitGrantCallback(url);
      if (parsed.state !== state) {
        await chrome.storage.local.set({ oauthStatus: 'error', oauthError: 'state mismatch' });
        return;
      }
      accessToken = parsed.accessToken;
      // Blipfoto includes username in the callback fragment — use it directly.
      username = parsed.username ?? '';
      if (!username) throw new Error('No username in OAuth callback');
    } catch (e) {
      await chrome.storage.local.set({
        oauthStatus: 'error',
        oauthError: e instanceof Error ? e.message : String(e),
      });
      return;
    }

    await storeToken({ accessToken, username });
    await chrome.storage.local.set({ oauthStatus: 'success', username, via });
  }

  const onRedirect = (
    details: Parameters<Parameters<typeof chrome.webRequest.onBeforeRedirect.addListener>[0]>[0],
  ): void => {
    const dest = details.redirectUrl ?? '';
    if (dest.startsWith(SCHEME)) void handle(dest, 'webRequest.onBeforeRedirect');
  };

  chrome.webRequest.onBeforeRedirect.addListener(onRedirect, {
    urls: ['https://*.blipfoto.com/*'],
  });

  const authUrl = buildImplicitGrantUrl({
    clientId,
    redirectUri: REDIRECT_URI,
    scope: 'read',
    state,
  });

  const tab = await chrome.tabs.create({ url: authUrl, active: true });
  authTabId = tab.id ?? null;

  setTimeout(() => {
    if (!captured) {
      cleanup();
      void chrome.storage.local.set({
        oauthStatus: 'error',
        oauthError: 'Timed out — no redirect captured within 120s.',
      });
    }
  }, TIMEOUT_MS);
}
