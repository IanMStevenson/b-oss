// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { AccountConfig, AppStore, LogEntry, MainEvent, BackendContext } from './backend.js';

declare global {
  interface Window {
    api: {
      addAccount(): Promise<void>;
      addAccountFresh(): Promise<void>;
      removeAccount(id: string): Promise<void>;
      reauthoriseAccount(id: string): Promise<void>;
      startBackup(id: string): Promise<void>;
      cancelBackup(id: string): Promise<void>;
      openViewer(id: string): Promise<void>;
      getViewerUrl(id: string): Promise<string>;
      pickFolder(): Promise<string | null>;
      updateAccountSettings(id: string, settings: Partial<AccountConfig>): Promise<void>;
      getStore(): Promise<AppStore>;
      getLogs(id: string): Promise<LogEntry[]>;
      on(channel: 'main-event', handler: (event: MainEvent) => void): () => void;
    };
  }
}

export class ElectronBackend implements BackendContext {
  addAccount = () => window.api.addAccount();
  addAccountFresh = () => window.api.addAccountFresh();
  removeAccount = (id: string) => window.api.removeAccount(id);
  reauthoriseAccount = (id: string) => window.api.reauthoriseAccount(id);
  startBackup = (id: string) => window.api.startBackup(id);
  cancelBackup = (id: string) => window.api.cancelBackup(id);
  openViewer = (id: string) => window.api.openViewer(id);
  getViewerUrl = (id: string) => window.api.getViewerUrl(id);
  pickFolder = () => window.api.pickFolder();
  updateAccountSettings = (id: string, settings: Partial<AccountConfig>) =>
    window.api.updateAccountSettings(id, settings);
  getStore = () => window.api.getStore();
  getLogs = (id: string) => window.api.getLogs(id);
  subscribe = (handler: (event: MainEvent) => void) => window.api.on('main-event', handler);
}
