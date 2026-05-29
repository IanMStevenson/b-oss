// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Notification, type BrowserWindow } from 'electron';

export function showBackupFailedNotification(
  username: string,
  errorMessage: string,
  getWindow: () => BrowserWindow | null,
): void {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: `Backup failed — ${username}`,
    body: errorMessage,
  });
  n.on('click', () => {
    const win = getWindow();
    win?.show();
    win?.focus();
  });
  n.show();
}
