// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import electronUpdater from 'electron-updater';
import log from 'electron-log';

export function setupAutoUpdater(): void {
  // Access `autoUpdater` lazily — it's a getter that constructs a NsisUpdater
  // on first read, which calls `app.getVersion()`. Calling it before
  // `app.whenReady()` would crash with "Cannot read properties of undefined".
  const { autoUpdater } = electronUpdater;
  autoUpdater.logger = log;
  log.transports.file.level = 'info';
  void autoUpdater.checkForUpdatesAndNotify();
}
