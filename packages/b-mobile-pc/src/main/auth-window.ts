// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { BrowserWindow } from 'electron';
import { randomUUID } from 'node:crypto';
import { reachedRedirect } from './auth-request.js';

/** Opens `url` in a clean window (its own in-memory session, so no cookies carry over: a second
 * account always sees the login form) and resolves with the first navigation that reaches
 * `redirectPrefix`, which is captured and never loaded. Rejects with Error('cancelled') if the
 * window is closed first. Callers must have validated both arguments (auth-request.ts). */
export function openAuthWindow(
  parent: BrowserWindow | null,
  url: string,
  redirectPrefix: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const win = new BrowserWindow({
      width: 520,
      height: 760,
      parent: parent ?? undefined,
      modal: parent !== null,
      autoHideMenuBar: true,
      title: 'Sign in to Blipfoto',
      webPreferences: {
        // No "persist:" prefix, so the partition lives in memory and dies with the window.
        partition: `auth-${randomUUID()}`,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    let settled = false;
    const finish = (settle: () => void): void => {
      if (settled) return;
      settled = true;
      settle();
      if (!win.isDestroyed()) win.close();
    };

    const onNavigate = (event: { preventDefault: () => void }, target: string): void => {
      if (!reachedRedirect(target, redirectPrefix)) return;
      event.preventDefault();
      finish(() => resolve(target));
    };
    win.webContents.on('will-redirect', onNavigate);
    win.webContents.on('will-navigate', onNavigate);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.on('closed', () => finish(() => reject(new Error('cancelled'))));

    void win.loadURL(url).catch((err: unknown) => {
      finish(() => reject(err instanceof Error ? err : new Error(String(err))));
    });
  });
}
