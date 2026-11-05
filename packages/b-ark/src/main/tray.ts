// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Tray, Menu, nativeImage, app, type BrowserWindow } from 'electron';
import path from 'node:path';
import type Store from 'electron-store';
import type { UserDataStore } from '@b-oss/b-ark-ui-electron';
import { getWorstRag, getPortableSettings } from './store.js';

let rebuilder: (() => void) | null = null;
let iconRefresher: (() => void) | null = null;

export function createTray(
  getWindow: () => BrowserWindow | null,
  store: Store<UserDataStore>,
  actions: { onExit: () => void; onToggleScheduled: (enabled: boolean) => void },
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
        label: 'Enable scheduled backups',
        type: 'checkbox',
        checked: getPortableSettings().schedule.enabled,
        click: () => actions.onToggleScheduled(!getPortableSettings().schedule.enabled),
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => actions.onExit(),
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
 * Rebuild the tray menu so its Enable-scheduled-backups checkbox reflects the
 * current Scheduled setting. Called from ipc-handlers when it changes.
 */
export function rebuildTrayMenu(): void {
  rebuilder?.();
}

export function refreshTrayIcon(): void {
  iconRefresher?.();
}
