// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { MenuItemConstructorOptions } from 'electron';

/** The application menu: Electron's default one minus its View ▸ Zoom In / Zoom Out / Actual Size
 * items. Those accelerators (Ctrl +, -, 0) would change the page's zoom alongside the app's own
 * zoom, which handles the same keys itself (b-oss#635): there must be exactly one zoom. The menu
 * bar is hidden (autoHideMenuBar), so the other items are kept only for their shortcuts. */
export function appMenuTemplate(platform: NodeJS.Platform): MenuItemConstructorOptions[] {
  return [
    ...(platform === 'darwin' ? [{ role: 'appMenu' } as const] : []),
    { role: 'fileMenu' },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
  ];
}
