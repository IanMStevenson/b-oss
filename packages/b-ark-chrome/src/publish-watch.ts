// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Content script: detect publish / save-changes on Blipfoto entry pages.
// Runs only on /publish and /entry/*/edit — see manifest content_scripts.
// Never calls preventDefault() or stopPropagation(); purely observes.

import { debug } from '@b-oss/b-ark-ui-chrome/src/debug.js';

// Cache the setting so the click handler can check it synchronously.
let backupOnPublish = false;
chrome.storage.local.get('backup_on_publish', (r) => {
  backupOnPublish = r['backup_on_publish'] === true;
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && 'backup_on_publish' in changes) {
    backupOnPublish = (changes['backup_on_publish']?.newValue as boolean | undefined) === true;
  }
});

function triggerBackup(reason: string): void {
  if (!backupOnPublish) return;
  debug.log(`[b-ark] ${reason} — triggering backup`);
  void chrome.runtime.sendMessage({ type: 'publish_detected' }).catch(() => {});
}

// New entries: /publish is one URL for upload -> edit -> success, so the success screen may be
// swapped in by the page without a navigation (a one-shot check at load would miss it) or
// arrive as a fresh page load. Watch for the success marker (`.publish-success`) appearing and
// trigger on that — never on the button click: a click can race the publish request, fires
// even if the publish then fails, and may start before the entry exists. The marker going
// absent -> present is the edge that counts, so "Add another" then a second publish re-fires.
let successShowing = false;
function checkPublishSuccess(): void {
  const showing = document.querySelector('.publish-success') !== null;
  if (showing && !successShowing) triggerBackup('Entry published');
  successShowing = showing;
}
if (location.pathname === '/publish') {
  // The settings cache above is read async; make sure it has landed before the first check.
  chrome.storage.local.get('backup_on_publish', (r) => {
    backupOnPublish = r['backup_on_publish'] === true;
    checkPublishSuccess();
    new MutationObserver(checkPublishSuccess).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  });
}

// Edits (/entry/*/edit): success page not yet characterised, so still keyed off the click.
if (location.pathname.endsWith('/edit')) {
  const btn = document.querySelector<HTMLButtonElement>('button#publish');
  btn?.addEventListener('click', () => {
    triggerBackup(`"${btn.textContent?.trim() ?? 'Save changes'}" clicked`);
  });
}
