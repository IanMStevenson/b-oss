// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

const clientIdEl = document.getElementById('clientId');
const redirectUriEl = document.getElementById('redirectUri');
const logEl = document.getElementById('log');
const resultEl = document.getElementById('result');

clientIdEl.value = sessionStorage.getItem('dist_client_id') ?? '';
clientIdEl.addEventListener('change', () => sessionStorage.setItem('dist_client_id', clientIdEl.value));

function render(store) {
  if (store.oauthlog) logEl.textContent = store.oauthlog.join('\n');
  if (store.oauthresult) resultEl.textContent = store.oauthresult;
  logEl.scrollTop = logEl.scrollHeight;
}

chrome.storage.local.get(['oauthlog', 'oauthresult'], render);
chrome.storage.onChanged.addListener((changes) => {
  const store = {};
  if (changes.oauthlog) store.oauthlog = changes.oauthlog.newValue;
  if (changes.oauthresult) store.oauthresult = changes.oauthresult.newValue;
  render(store);
});

document.getElementById('signin').addEventListener('click', () => {
  const clientId = clientIdEl.value.trim();
  const redirectUri = redirectUriEl.value.trim();
  if (!clientId || !redirectUri) {
    resultEl.textContent = 'enter client_id and redirect_uri first';
    return;
  }
  resultEl.textContent = '(running…)';
  chrome.runtime.sendMessage({ type: 'start', clientId, redirectUri });
});
