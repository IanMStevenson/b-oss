// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { BRIDGE_GLOBAL, CHANNELS, type DesktopBridge } from '../shared/bridge.js';
import type { NotifyPayload, NotifyStatus, TestNotifyResult } from '../shared/notify.js';

function subscribe(
  channel: string,
  handler: (payload: NotifyPayload) => void,
  onFirst?: () => void,
): () => void {
  const listener = (_event: IpcRendererEvent, payload: NotifyPayload): void => handler(payload);
  ipcRenderer.on(channel, listener);
  onFirst?.();
  return () => ipcRenderer.removeListener(channel, listener);
}

const bridge: DesktopBridge = {
  version: 1,
  secure: {
    get: (key) => ipcRenderer.invoke(CHANNELS.secureGet, key) as Promise<string | null>,
    set: (key, value) => ipcRenderer.invoke(CHANNELS.secureSet, key, value) as Promise<void>,
    remove: (key) => ipcRenderer.invoke(CHANNELS.secureRemove, key) as Promise<void>,
  },
  openAuth: (url, redirectPrefix) =>
    ipcRenderer.invoke(CHANNELS.authOpen, url, redirectPrefix) as Promise<string>,
  notify: {
    configure: (settings) =>
      ipcRenderer.invoke(CHANNELS.notifyConfigure, settings) as Promise<void>,
    status: () => ipcRenderer.invoke(CHANNELS.notifyStatus) as Promise<NotifyStatus>,
    checkNow: () => ipcRenderer.invoke(CHANNELS.notifyCheckNow) as Promise<NotifyStatus>,
    sendTest: () => ipcRenderer.invoke(CHANNELS.notifyTest) as Promise<TestNotifyResult>,
    onReceived: (handler) => subscribe(CHANNELS.notifyReceived, handler),
    // Asking main to flush any click that arrived before a listener existed.
    onTapped: (handler) =>
      subscribe(CHANNELS.notifyTapped, handler, () => {
        void ipcRenderer.invoke(CHANNELS.notifyTappedReady);
      }),
  },
  shell: {
    info: () => ipcRenderer.invoke(CHANNELS.shellInfo) as Promise<{ build: string }>,
  },
  diagnostics: {
    logError: (entry) => ipcRenderer.invoke(CHANNELS.diagLog, entry) as Promise<void>,
    openLogFolder: () => ipcRenderer.invoke(CHANNELS.diagOpenLogFolder) as Promise<void>,
    copyText: (text) => ipcRenderer.invoke(CHANNELS.diagCopy, text) as Promise<void>,
  },
};

contextBridge.exposeInMainWorld(BRIDGE_GLOBAL, bridge);
