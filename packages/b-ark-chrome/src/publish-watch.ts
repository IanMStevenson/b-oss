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

// New entries: /publish is one URL for upload -> edit -> success, and the publish itself is
// a form POST whose response is a full page load. Trigger only once the server has rendered
// the success page (`.publish-success`), never on the button click: a click can race the
// publish request, fires even if the publish then fails, and may start before the entry
// exists. The settings cache above is read async, so wait for it before deciding.
if (document.querySelector('.publish-success')) {
  chrome.storage.local.get('backup_on_publish', (r) => {
    backupOnPublish = r['backup_on_publish'] === true;
    triggerBackup('Entry published');
  });
}

// Edits (/entry/*/edit): success page not yet characterised, so still keyed off the click.
if (location.pathname.endsWith('/edit')) {
  const btn = document.querySelector<HTMLButtonElement>('button#publish');
  btn?.addEventListener('click', () => {
    triggerBackup(`"${btn.textContent?.trim() ?? 'Save changes'}" clicked`);
  });
}
