// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Distributed-app (implicit grant) OAuth capture for Chrome extensions.
// Ported from spikes/oauth-distributed-capture/sw.js.
//
// Opens the Blipfoto authorize page in a tab; captures the custom-scheme 302
// redirect via webRequest.onBeforeRedirect (proven to preserve the fragment).
// On success, encrypts the token via storeToken and writes { oauthStatus,
// username } to chrome.storage.local so the popup can update its UI.

import { buildImplicitGrantUrl, parseImplicitGrantCallback } from '@b-oss/b-api';
import { storeToken } from './token-storage.js';

const REDIRECT_URI = 'bark-chrome://oauth/callback';
const SCHEME = 'bark-chrome://';
const TIMEOUT_MS = 120_000;

export async function startOAuthFlow(clientId: string): Promise<void> {
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
    try {
      chrome.webNavigation.onBeforeNavigate.removeListener(onNav);
    } catch {
      // listener may not have been added if the filter registration failed
    }
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

  const onRedirect = (details: chrome.webRequest.WebRedirectionResponseDetails): void => {
    const dest = details.redirectUrl ?? '';
    if (dest.startsWith(SCHEME)) void handle(dest, 'webRequest.onBeforeRedirect');
  };

  const onNav = (details: chrome.webNavigation.WebNavigationParentedCallbackDetails): void => {
    if (details.url.startsWith(SCHEME)) void handle(details.url, 'webNavigation.onBeforeNavigate');
  };

  chrome.webRequest.onBeforeRedirect.addListener(onRedirect, {
    urls: ['https://*.blipfoto.com/*'],
  });
  try {
    chrome.webNavigation.onBeforeNavigate.addListener(onNav, {
      url: [{ schemes: [SCHEME.replace('://', '')] }],
    });
  } catch {
    // Scheme filter may fail in some Chrome versions — webRequest capture is primary
  }

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
