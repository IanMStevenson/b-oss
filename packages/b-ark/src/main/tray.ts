// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Tray, Menu, nativeImage, app, type BrowserWindow } from 'electron';
import path from 'node:path';

export function createTray(getWindow: () => BrowserWindow | null): Tray {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'resources', 'tray-icon.png')
    : path.join(__dirname, '../../resources/tray-icon.png');

  const icon = nativeImage.createFromPath(iconPath);
  const tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);

  tray.setToolTip('b-ark');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open b-ark', click: () => getWindow()?.show() },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]),
  );

  tray.on('double-click', () => getWindow()?.show());

  return tray;
}
