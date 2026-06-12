// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { startOAuthFlow } from './oauth.js';

const CLIENT_ID = import.meta.env.VITE_CHROME_CLIENT_ID ?? '';

chrome.runtime.onMessage.addListener((msg: unknown) => {
  if (typeof msg === 'object' && msg !== null && 'type' in msg) {
    if ((msg as { type: string }).type === 'start_oauth') void startOAuthFlow(CLIENT_ID);
  }
});

export {};
