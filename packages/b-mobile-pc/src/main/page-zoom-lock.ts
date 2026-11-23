// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { Menu } from 'electron';
import type { WebContents } from 'electron';
import { appMenuTemplate } from './app-menu.js';

/** Takes Chromium's page zoom out of play: the web app zooms its own grid and photo (Ctrl+wheel,
 * Ctrl +/-/0), and a second, page-wide zoom on top of it would double up (b-oss#635).
 * - no zoom accelerators in the application menu (the only source of keyboard page zoom in Electron);
 * - visual (pinch / Ctrl+wheel) zoom limited to 1x;
 * - the zoom factor pinned back to 1 if anything still changes it.
 *
 * The visual-zoom limit needs a live main frame, which does not exist yet when the window is
 * created, and a new frame after each navigation starts without it. So it is applied when a page
 * has loaded, and a rejection (frame gone again) is swallowed: the next load applies it (b-oss#1044).
 */
export function lockPageZoom(contents: WebContents): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(appMenuTemplate(process.platform)));
  contents.on('zoom-changed', () => contents.setZoomFactor(1));
  contents.on('did-finish-load', () => {
    contents.setZoomFactor(1);
    contents.setVisualZoomLevelLimits(1, 1).catch(() => undefined);
  });
}
