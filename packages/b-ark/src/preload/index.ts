// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type {
  AccountConfig,
  LogCsvFilters,
  MainEvent,
  SharedSettingsPartial,
} from '@b-oss/b-ark-ui-electron';

contextBridge.exposeInMainWorld('api', {
  appVersion: __APP_VERSION__,
  addAccount: () => ipcRenderer.invoke('addAccount'),
  addAccountFresh: () => ipcRenderer.invoke('addAccountFresh'),
  removeAccount: (id: string) => ipcRenderer.invoke('removeAccount', id),
  reauthoriseAccount: (id: string) => ipcRenderer.invoke('reauthoriseAccount', id),
  reauthoriseAccountFresh: (id: string) => ipcRenderer.invoke('reauthoriseAccountFresh', id),
  startBackup: (id: string) => ipcRenderer.invoke('startBackup', id),
  cancelBackup: (id: string) => ipcRenderer.invoke('cancelBackup', id),
  openViewer: (id: string) => ipcRenderer.invoke('openViewer', id),
  getViewerUrl: (id: string) => ipcRenderer.invoke('getViewerUrl', id),
  pickFolder: () => ipcRenderer.invoke('pickFolder'),
  chooseBackupFolder: () => ipcRenderer.invoke('chooseBackupFolder'),
  moveBackupFolder: (newPath: string) => ipcRenderer.invoke('moveBackupFolder', newPath),
  updateSettings: (partial: SharedSettingsPartial) => ipcRenderer.invoke('updateSettings', partial),
  updateAccountSettings: (id: string, settings: Partial<AccountConfig>) =>
    ipcRenderer.invoke('updateAccountSettings', id, settings),
  getStore: () => ipcRenderer.invoke('getStore'),
  getAccountAvatar: (id: string) => ipcRenderer.invoke('getAccountAvatar', id),
  getBootState: () => ipcRenderer.invoke('getBootState'),
  getLogs: () => ipcRenderer.invoke('getLogs'),
  exportLogsCsv: (filters: LogCsvFilters) => ipcRenderer.invoke('exportLogsCsv', filters),
  rendererReady: () => ipcRenderer.send('renderer-ready'),
  on: (channel: 'main-event', handler: (event: MainEvent) => void): (() => void) => {
    if (channel !== 'main-event') throw new Error(`Unknown channel: ${channel as string}`);
    const listener = (_event: IpcRendererEvent, data: MainEvent): void => handler(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
