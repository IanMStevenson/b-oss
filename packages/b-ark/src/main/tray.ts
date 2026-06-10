// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Tray, Menu, nativeImage, app, type BrowserWindow } from 'electron';
import path from 'node:path';
import type Store from 'electron-store';
import type { UserDataStore } from '@b-oss/b-ark-ui';
import { getWorstRag } from './store.js';

let rebuilder: (() => void) | null = null;
let iconRefresher: (() => void) | null = null;

export function createTray(
  getWindow: () => BrowserWindow | null,
  store: Store<UserDataStore>,
): Tray {
  function ragIconPath(rag: 'green' | 'amber' | 'red' | null): string {
    const filename =
      rag === 'green'
        ? 'tray-icon-green.png'
        : rag === 'amber'
          ? 'tray-icon-amber.png'
          : rag === 'red'
            ? 'tray-icon-red.png'
            : 'tray-icon.png';
    return app.isPackaged
      ? path.join(process.resourcesPath, 'resources', filename)
      : path.join(__dirname, '../../resources', filename);
  }

  const initialIcon = nativeImage.createFromPath(ragIconPath(getWorstRag()));
  const tray = new Tray(initialIcon.isEmpty() ? nativeImage.createEmpty() : initialIcon);

  function buildMenu(): Electron.Menu {
    return Menu.buildFromTemplate([
      { label: 'Open b-ark', click: () => getWindow()?.show() },
      { type: 'separator' },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: store.get('app').startWithWindows,
        enabled: app.isPackaged,
        click() {
          const next = !store.get('app').startWithWindows;
          store.set('app', { ...store.get('app'), startWithWindows: next });
          if (app.isPackaged) {
            app.setLoginItemSettings({ openAtLogin: next });
          }
          tray.setContextMenu(buildMenu());
        },
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);
  }

  function refreshIcon(): void {
    const image = nativeImage.createFromPath(ragIconPath(getWorstRag()));
    if (!image.isEmpty()) tray.setImage(image);
  }

  tray.setToolTip('b-ark');
  tray.setContextMenu(buildMenu());
  tray.on('double-click', () => getWindow()?.show());

  rebuilder = () => tray.setContextMenu(buildMenu());
  iconRefresher = refreshIcon;

  store.onDidChange('status', () => refreshIcon());
  refreshIcon();

  return tray;
}

/**
 * Rebuild the tray menu so its Start-with-Windows checkbox reflects the
 * latest value from the local store. Called from ipc-handlers after the
 * Settings panel toggles the setting.
 */
export function rebuildTrayMenu(): void {
  rebuilder?.();
}

export function refreshTrayIcon(): void {
  iconRefresher?.();
}
