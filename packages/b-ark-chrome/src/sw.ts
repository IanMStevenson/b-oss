// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { startOAuthFlow } from './oauth.js';

const CLIENT_ID = import.meta.env.VITE_CHROME_CLIENT_ID ?? '';

chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (typeof msg !== 'object' || msg === null || !('type' in msg)) return;
  const { type } = msg as { type: string };
  if (type === 'start_oauth') void startOAuthFlow(CLIENT_ID);
  if (type === 'open_backup_page')
    void chrome.tabs.create({ url: chrome.runtime.getURL('src/backup.html'), active: false });
});

export {};
