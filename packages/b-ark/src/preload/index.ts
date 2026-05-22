// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { AccountConfig, MainEvent } from '@b-oss/b-ark-ui';

contextBridge.exposeInMainWorld('api', {
  addAccount: () => ipcRenderer.invoke('addAccount'),
  addAccountFresh: () => ipcRenderer.invoke('addAccountFresh'),
  removeAccount: (id: string) => ipcRenderer.invoke('removeAccount', id),
  reauthoriseAccount: (id: string) => ipcRenderer.invoke('reauthoriseAccount', id),
  startBackup: (id: string) => ipcRenderer.invoke('startBackup', id),
  cancelBackup: (id: string) => ipcRenderer.invoke('cancelBackup', id),
  openViewer: (id: string) => ipcRenderer.invoke('openViewer', id),
  getViewerUrl: (id: string) => ipcRenderer.invoke('getViewerUrl', id),
  pickFolder: () => ipcRenderer.invoke('pickFolder'),
  updateAccountSettings: (id: string, settings: Partial<AccountConfig>) =>
    ipcRenderer.invoke('updateAccountSettings', id, settings),
  getStore: () => ipcRenderer.invoke('getStore'),
  getLogs: (id: string) => ipcRenderer.invoke('getLogs', id),
  on: (channel: 'main-event', handler: (event: MainEvent) => void): (() => void) => {
    if (channel !== 'main-event') throw new Error(`Unknown channel: ${channel as string}`);
    const listener = (_event: IpcRendererEvent, data: MainEvent): void => handler(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
