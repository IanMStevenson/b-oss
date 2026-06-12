// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { startOAuthFlow } from './oauth.js';

const CLIENT_ID = import.meta.env.VITE_CHROME_CLIENT_ID ?? '';
const BACKUP_PAGE = 'src/backup-page.html';

async function openOrFocusBackupPage(): Promise<void> {
  const url = chrome.runtime.getURL(BACKUP_PAGE);
  const tabs = await chrome.tabs.query({ url });
  if (tabs.length > 0 && tabs[0]?.id !== undefined) {
    await chrome.tabs.update(tabs[0].id, { active: true });
  } else {
    await chrome.tabs.create({ url, active: true });
  }
}

chrome.action.onClicked.addListener(() => {
  void openOrFocusBackupPage();
});

chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (typeof msg !== 'object' || msg === null || !('type' in msg)) return;
  const { type } = msg as { type: string };
  if (type === 'start_oauth') void startOAuthFlow(CLIENT_ID);
  if (type === 'open_backup_page') void openOrFocusBackupPage();
});

export {};
