// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { idbPutHandle, idbGetHandle } from './idb.js';

const logEl = document.getElementById('log');
const resultEl = document.getElementById('result');
const onloadEl = document.getElementById('onload');

function log(msg) {
  logEl.textContent += `${new Date().toISOString()}  ${msg}\n`;
}

// Decisive instrument: report queryPermission on load, with NO gesture. After the
// "Allow on every visit" re-grant + a restart, this should read "granted" untouched.
(async () => {
  const handle = await idbGetHandle();
  if (!handle) {
    onloadEl.textContent = 'no stored handle yet — do Stage 0';
    return;
  }
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    onloadEl.textContent = `${perm}   (handle "${handle.name}")`;
    log(`on-load queryPermission = ${perm}`);
  } catch (e) {
    onloadEl.textContent = `queryPermission threw: ${e.name} (stale handle)`;
  }
})();

// Surface whatever the background writer tab last reported.
function showResult(text) {
  resultEl.textContent = text;
}
chrome.storage.local.get('writerResult', (v) => {
  if (v.writerResult) showResult(v.writerResult);
});
chrome.storage.onChanged.addListener((changes) => {
  if (changes.writerResult) showResult(changes.writerResult.newValue);
});

// Stage 0: pick + store only. showDirectoryPicker({mode:'readwrite'}) already grants for
// this session — that satisfies the "granted during last visit" precondition. We do NOT
// call requestPermission here; the persistent three-way prompt is expected on the NEXT visit.
document.getElementById('pick').addEventListener('click', async () => {
  let dir;
  try {
    dir = await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (e) {
    if (e.name !== 'AbortError') log(`picker error: ${e.name}`);
    return;
  }
  await idbPutHandle(dir);
  log(`Stage 0 done: stored "${dir.name}". Now fully quit & reopen Chrome, then do Stage 1 (Re-grant).`);
});

// Stage 1: the repeat-visit re-grant. requestPermission() on the stored handle from a
// focused gesture — this is the documented trigger for the "Allow on every visit" prompt.
document.getElementById('regrant').addEventListener('click', async () => {
  const handle = await idbGetHandle();
  if (!handle) {
    log('no stored handle — do Stage 0 first');
    return;
  }
  const before = await handle.queryPermission({ mode: 'readwrite' });
  let after;
  try {
    after = await handle.requestPermission({ mode: 'readwrite' });
  } catch (e) {
    log(`requestPermission threw: ${e.name}`);
    return;
  }
  log(
    `Stage 1: requestPermission before="${before}" after="${after}". ` +
      `Did Chrome offer "Allow on every visit"? If so and you chose it, restart and reload — ` +
      `the readout at the top should be "granted" with no click.`,
  );
});
