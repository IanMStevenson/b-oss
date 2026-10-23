// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import electronUpdater from 'electron-updater';
import log from 'electron-log';
import { store } from './store.js';

// Updates come from the permanent `b-ark-latest` release, which .github/workflows/b-ark-latest.yml
// keeps current (latest.yml, the installer and its blockmap). We do NOT use the default GitHub
// provider: it follows the repo-wide "Latest" release, which can't mean "latest b-ark" in a monorepo
// that releases several packages (b-oss#512).
export const UPDATE_FEED_URL =
  'https://github.com/IanMStevenson/b-oss/releases/download/b-ark-latest';

export function setupAutoUpdater(): void {
  if (!store.get('app').autoUpdateEnabled) {
    log.info('Auto-update disabled by user setting — skipping update check.');
    return;
  }
  // Access `autoUpdater` lazily — it's a getter that constructs a NsisUpdater
  // on first read, which calls `app.getVersion()`. Calling it before
  // `app.whenReady()` would crash with "Cannot read properties of undefined".
  const { autoUpdater } = electronUpdater;
  autoUpdater.logger = log;
  autoUpdater.setFeedURL({ provider: 'generic', url: UPDATE_FEED_URL });
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  log.transports.file.level = 'info';
  void autoUpdater.checkForUpdatesAndNotify();
}
