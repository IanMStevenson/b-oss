// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Tray, Menu, nativeImage, app, type BrowserWindow } from 'electron';
import path from 'node:path';
import type Store from 'electron-store';
import type { AppStore } from '@b-oss/b-ark-ui';

export function createTray(getWindow: () => BrowserWindow | null, store: Store<AppStore>): Tray {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'tray-icon.png')
    : path.join(__dirname, '../../resources/tray-icon.png');

  const icon = nativeImage.createFromPath(iconPath);
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  function buildMenu(): Electron.Menu {
    return Menu.buildFromTemplate([
      { label: 'Open b-ark', click: () => getWindow()?.show() },
      { type: 'separator' },
      {
        label: 'Start with Windows',
        type: 'checkbox',
        checked: store.get('app').startWithWindows,
        click() {
          const next = !store.get('app').startWithWindows;
          store.set('app', { ...store.get('app'), startWithWindows: next });
          app.setLoginItemSettings({ openAtLogin: next });
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

  tray.setToolTip('b-ark');
  tray.setContextMenu(buildMenu());
  tray.on('double-click', () => getWindow()?.show());

  return tray;
}
