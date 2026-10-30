// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Where the tray icon file lives. Pure so a unit test can pin it against electron-builder.json: the
// packaged app once looked for a file that extraResources never shipped (b-oss#640).

import { join } from 'node:path';

/** The directory under `resources/` (packaged) and `build/` (dev) that holds the tray icons. */
export const TRAY_DIR = 'tray';

/** The 16 px base file; Electron picks the `@1.5x`/`@2x`/`@3x` siblings by display scale. A multi-size
 * .ico was tried and loaded empty on Linux, so PNG is used on every platform. */
export const TRAY_ICON_FILE = 'tray-icon.png';

/** The app icon, used if the tray icon cannot be loaded: shipped beside it when packaged (an .exe is
 * not an image `nativeImage.createFromPath` can read), `build/icon.png` in dev. */
export function appIconPath(opts: TrayIconPaths): string {
  return opts.packaged
    ? join(opts.resourcesPath, TRAY_DIR, 'app-icon.png')
    : join(opts.mainDir, '../../build/icon.png');
}

export interface TrayIconPaths {
  packaged: boolean;
  resourcesPath: string;
  /** The compiled main bundle's directory (`dist/main`). */
  mainDir: string;
}

export function trayIconPath(opts: TrayIconPaths): string {
  return opts.packaged
    ? join(opts.resourcesPath, TRAY_DIR, TRAY_ICON_FILE)
    : join(opts.mainDir, '../../build', TRAY_DIR, TRAY_ICON_FILE);
}
