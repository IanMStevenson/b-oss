// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { contextBridge, ipcRenderer } from 'electron';
import { BRIDGE_GLOBAL, CHANNELS, type DesktopBridge } from '../shared/bridge.js';

const bridge: DesktopBridge = {
  version: 1,
  secure: {
    get: (key) => ipcRenderer.invoke(CHANNELS.secureGet, key) as Promise<string | null>,
    set: (key, value) => ipcRenderer.invoke(CHANNELS.secureSet, key, value) as Promise<void>,
    remove: (key) => ipcRenderer.invoke(CHANNELS.secureRemove, key) as Promise<void>,
  },
  openAuth: (url, redirectPrefix) =>
    ipcRenderer.invoke(CHANNELS.authOpen, url, redirectPrefix) as Promise<string>,
};

contextBridge.exposeInMainWorld(BRIDGE_GLOBAL, bridge);
