// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import electronUpdater from 'electron-updater';
import log from 'electron-log';
import { store } from './store.js';

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
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  log.transports.file.level = 'info';
  void autoUpdater.checkForUpdatesAndNotify();
}
