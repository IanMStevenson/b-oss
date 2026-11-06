// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { createRequire } from 'node:module';
import { join } from 'node:path';
import { app, shell } from 'electron';
import log from 'electron-log';
import type { StartupTaskInfo } from '@b-oss/b-ark-ui-electron';
import {
  createStartAtSignInService,
  loadStartupAddon,
  selectStartAtSignIn,
  type StartAtSignInService,
} from './start-at-sign-in-pure.js';

// Electron glue for StartAtSignIn (see start-at-sign-in-pure.ts). The implementation is chosen
// once, on first use. The Microsoft Store one loads the native add-on lazily, so Linux dev,
// typecheck, lint and tests never need it, and a missing or broken add-on only ever means `unknown`.

/** Only a Microsoft Store install uses the startup task. */
export const isStoreBuild = (): boolean => process.windowsStore === true;

/** Where electron-builder.store.json copies the add-on (packages/b-win-startup), outside the asar. */
function addonPath(): string {
  return join(process.resourcesPath, 'native', 'win-startup.node');
}

let service: StartAtSignInService | null = null;

function getService(): StartAtSignInService {
  service ??= createStartAtSignInService(
    selectStartAtSignIn({
      windowsStore: isStoreBuild(),
      login: {
        platform: process.platform,
        isPackaged: app.isPackaged,
        api: {
          get: () => app.getLoginItemSettings(),
          set: (openAtLogin) => app.setLoginItemSettings({ openAtLogin }),
        },
        openExternal: (url) => shell.openExternal(url),
        onError: (message, err) => log.warn(message, err),
      },
      store: {
        getAddon: () =>
          loadStartupAddon(
            () => createRequire(import.meta.url)(addonPath()) as unknown,
            (message, err) => log.warn(message, err),
          ),
        openExternal: (url) => shell.openExternal(url),
        onError: (message, err) => log.warn(message, err),
      },
    }),
    { onInfo: (message) => log.info(message) },
  );
  return service;
}

/** Make the sign-in behaviour match Scheduled (the master setting). */
export const applyStartAtSignIn = (wanted: boolean): Promise<void> => getService().apply(wanted);

/** At launch; with Scheduled off in a Store build nothing is checked or changed. */
export const reconcileStartAtSignInOnLaunch = (wanted: boolean): void =>
  getService().reconcileOnLaunch(wanted);

/** `scheduled` false: nothing is wanted, so the banner has nothing to say and the platform isn't asked. */
export const getStartupTaskInfo = (scheduled: boolean): Promise<StartupTaskInfo | null> =>
  getService().getInfo(scheduled);

export const enableStartupTask = (): Promise<StartupTaskInfo | null> => getService().enable();

export const openStartupSettings = (): Promise<void> => getService().openSettings();
