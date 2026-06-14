// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Content script: detect publish / save-changes on Blipfoto entry pages.
// Runs only on /publish and /entry/*/edit — see manifest content_scripts.
// Never calls preventDefault() or stopPropagation(); purely observes the click.

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

const btn = document.querySelector<HTMLButtonElement>('button#publish');
if (btn) {
  btn.addEventListener('click', () => {
    if (!backupOnPublish) return;
    const label = btn.textContent?.trim() ?? 'Publish';
    console.log(`[b-ark] "${label}" detected — triggering backup`);
    void chrome.runtime.sendMessage({ type: 'publish_detected' }).catch(() => {});
  });
}
