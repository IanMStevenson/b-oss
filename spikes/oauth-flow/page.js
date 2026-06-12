// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Zero-build spike of the production OAuth path. Mirrors what b-api's
// buildImplicitGrantUrl / parseImplicitGrantCallback do (inlined here so no bundler is
// needed). The genuine unknowns this checks: (a) Blipfoto accepts the chromiumapp.org
// redirect at registration, and (b) the implicit-grant (response_type=token, hash
// fragment) round-trip survives chrome.identity.launchWebAuthFlow.

const AUTHORIZE_URL = 'https://www.blipfoto.com/oauth/authorize';
const API_BASE = 'https://api.blipfoto.com/4/';

const logEl = document.getElementById('log');
const clientIdEl = document.getElementById('clientId');

function log(msg) {
  logEl.textContent += `${new Date().toISOString()}  ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

// Show the redirect URI to register and the extension id.
const redirectUri = chrome.identity.getRedirectURL();
document.getElementById('redirect').textContent = redirectUri;
document.getElementById('extid').textContent = chrome.runtime.id;

// Keep the pasted client_id across reloads (sessionStorage only, never written to a file).
clientIdEl.value = sessionStorage.getItem('oauth_client_id') ?? '';
clientIdEl.addEventListener('change', () =>
  sessionStorage.setItem('oauth_client_id', clientIdEl.value),
);

document.getElementById('signin').addEventListener('click', async () => {
  const clientId = clientIdEl.value.trim();
  if (!clientId) {
    log('paste the client_id first');
    return;
  }

  const state = crypto.randomUUID();
  const authUrl = new URL(AUTHORIZE_URL);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'read');
  authUrl.searchParams.set('state', state);

  log(`launching auth flow → ${AUTHORIZE_URL} (redirect_uri=${redirectUri})`);

  let responseUrl;
  try {
    responseUrl = await chrome.identity.launchWebAuthFlow({
      url: authUrl.toString(),
      interactive: true,
    });
  } catch (e) {
    log(`launchWebAuthFlow FAILED: ${e?.message ?? e}`);
    return;
  }
  log(`returned to redirect: ${responseUrl.split('#')[0]}#…`);

  // Parse the implicit-grant hash fragment (hash wins over query, per the spec).
  const u = new URL(responseUrl);
  const params = new URLSearchParams(u.hash.slice(1));
  const err = params.get('error');
  if (err) {
    log(`OAuth error in callback: ${err} — ${params.get('error_description') ?? ''}`);
    return;
  }
  if (params.get('state') !== state) {
    log('STATE MISMATCH — aborting (possible CSRF / wrong redirect)');
    return;
  }
  const token = params.get('access_token');
  if (!token) {
    log('no access_token in callback');
    return;
  }
  log(`✓ access_token received (${token.slice(0, 6)}…${token.slice(-4)})`);

  // Verify the token works.
  try {
    const resp = await fetch(`${API_BASE}user/profile.json`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await resp.json();
    if (json.error) {
      log(`verify FAILED: API error ${json.error.code}: ${json.error.message}`);
      return;
    }
    log(`SUCCESS ✓  authenticated as "${json.data.user.username}" — full OAuth round-trip works.`);
  } catch (e) {
    log(`verify request failed: ${e?.message ?? e}`);
  }
});
