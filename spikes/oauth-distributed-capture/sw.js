// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Distributed-app (implicit grant) capture, inside Chrome, WITHOUT launchWebAuthFlow.
// We open the Blipfoto authorize page in a tab; Blipfoto 302-redirects to the registered
// custom-scheme redirect_uri with the token in the URI fragment. We try to read that
// fragment via two observational mechanisms and report which (if either) preserves it:
//   1. chrome.webRequest.onBeforeRedirect  — redirectUrl (the Location of the 302)
//   2. chrome.webNavigation.onBeforeNavigate — url of the attempted custom-scheme nav
//
// Results/logs go to chrome.storage.local so the page can show them without messaging races.

const AUTHORIZE_URL = 'https://www.blipfoto.com/oauth/authorize';

async function setLog(lines) {
  await chrome.storage.local.set({ oauthlog: lines });
}
let logLines = [];
async function log(msg) {
  logLines.push(`${new Date().toISOString()}  ${msg}`);
  await setLog(logLines);
}
async function result(msg) {
  await chrome.storage.local.set({ oauthresult: `${new Date().toISOString()}  ${msg}` });
}

function fragmentOf(url) {
  const i = url.indexOf('#');
  return i === -1 ? '' : url.slice(i + 1);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'start') void startFlow(msg.clientId, msg.redirectUri);
});

async function startFlow(clientId, redirectUri) {
  logLines = [];
  await setLog([]);
  await chrome.storage.local.remove('oauthresult');

  const state = crypto.randomUUID();
  const scheme = `${redirectUri.split('://')[0]}://`;
  let captured = false;
  let authTabId = null;

  const cleanup = () => {
    chrome.webRequest.onBeforeRedirect.removeListener(onRedirect);
    chrome.webNavigation.onBeforeNavigate.removeListener(onNav);
  };

  async function handle(url, via) {
    if (captured) return;
    captured = true;
    cleanup();
    await log(`CAPTURED via ${via}: ${url.slice(0, 120)}`);
    if (authTabId != null) chrome.tabs.remove(authTabId).catch(() => {});
    const frag = fragmentOf(url);
    if (!frag) {
      await result(`Captured the redirect via ${via}, but it carried NO fragment — token not recoverable this way.`);
      return;
    }
    const params = new URLSearchParams(frag);
    if (params.get('error')) {
      await result(`OAuth error: ${params.get('error')} ${params.get('error_description') ?? ''}`);
      return;
    }
    if (params.get('state') !== state) {
      await result('state mismatch — aborting');
      return;
    }
    const token = params.get('access_token');
    if (!token) {
      await result(`Captured fragment via ${via} but no access_token in it: "${frag.slice(0, 80)}"`);
      return;
    }
    await result(`SUCCESS ✓ via ${via} — access_token ${token.slice(0, 6)}…${token.slice(-4)} (distributed flow works in Chrome).`);
  }

  const onRedirect = (details) => {
    void log(`onBeforeRedirect → ${(details.redirectUrl ?? '').slice(0, 100)}`);
    if (details.redirectUrl && details.redirectUrl.startsWith(scheme)) void handle(details.redirectUrl, 'webRequest.onBeforeRedirect');
  };
  const onNav = (details) => {
    void log(`onBeforeNavigate → ${(details.url ?? '').slice(0, 100)}`);
    if (details.url && details.url.startsWith(scheme)) void handle(details.url, 'webNavigation.onBeforeNavigate');
  };

  chrome.webRequest.onBeforeRedirect.addListener(onRedirect, { urls: ['https://*.blipfoto.com/*'] });
  try {
    chrome.webNavigation.onBeforeNavigate.addListener(onNav, {
      url: [{ schemes: [scheme.replace('://', '')] }],
    });
  } catch (e) {
    void log(`could not add webNavigation filter for scheme "${scheme}": ${e?.message ?? e}`);
  }

  const authUrl = new URL(AUTHORIZE_URL);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'read');
  authUrl.searchParams.set('state', state);

  await log(`opening authorize (redirect_uri=${redirectUri}, scheme=${scheme})`);
  const tab = await chrome.tabs.create({ url: authUrl.toString(), active: true });
  authTabId = tab.id ?? null;

  setTimeout(() => {
    if (!captured) {
      cleanup();
      void result('TIMEOUT — no custom-scheme redirect captured within 120s.');
    }
  }, 120000);
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('page.html'), active: true });
});
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('page.html'), active: true });
});
