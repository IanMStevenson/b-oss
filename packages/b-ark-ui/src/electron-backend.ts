// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type {
  AccountConfig,
  AppStore,
  BackendContext,
  BootState,
  LogCsvFilters,
  LogEntry,
  MainEvent,
  SharedSettingsPartial,
} from './backend.js';

declare global {
  interface Window {
    api: {
      addAccount(): Promise<void>;
      addAccountFresh(): Promise<void>;
      removeAccount(id: string): Promise<void>;
      reauthoriseAccount(id: string): Promise<void>;
      reauthoriseAccountFresh(id: string): Promise<void>;
      startBackup(id: string): Promise<void>;
      cancelBackup(id: string): Promise<void>;
      openViewer(id: string): Promise<void>;
      getViewerUrl(id: string): Promise<string>;
      pickFolder(): Promise<string | null>;
      chooseBackupFolder(): Promise<{ folder: string; existingSettings: boolean } | null>;
      moveBackupFolder(newPath: string): Promise<void>;
      updateSettings(partial: SharedSettingsPartial): Promise<void>;
      updateAccountSettings(id: string, settings: Partial<AccountConfig>): Promise<void>;
      getStore(): Promise<AppStore>;
      getAccountAvatar(id: string): Promise<string | null>;
      getBootState(): Promise<BootState>;
      getLogs(): Promise<LogEntry[]>;
      exportLogsCsv(filters: LogCsvFilters): Promise<string | null>;
      on(channel: 'main-event', handler: (event: MainEvent) => void): () => void;
      rendererReady(): void;
    };
  }
}

export class ElectronBackend implements BackendContext {
  addAccount = () => window.api.addAccount();
  addAccountFresh = () => window.api.addAccountFresh();
  removeAccount = (id: string) => window.api.removeAccount(id);
  reauthoriseAccount = (id: string) => window.api.reauthoriseAccount(id);
  reauthoriseAccountFresh = (id: string) => window.api.reauthoriseAccountFresh(id);
  startBackup = (id: string) => window.api.startBackup(id);
  cancelBackup = (id: string) => window.api.cancelBackup(id);
  openViewer = (id: string) => window.api.openViewer(id);
  getViewerUrl = (id: string) => window.api.getViewerUrl(id);
  pickFolder = () => window.api.pickFolder();
  chooseBackupFolder = () => window.api.chooseBackupFolder();
  moveBackupFolder = (newPath: string) => window.api.moveBackupFolder(newPath);
  updateSettings = (partial: SharedSettingsPartial) => window.api.updateSettings(partial);
  updateAccountSettings = (id: string, settings: Partial<AccountConfig>) =>
    window.api.updateAccountSettings(id, settings);
  getStore = () => window.api.getStore();
  getAccountAvatar = (id: string) => window.api.getAccountAvatar(id);
  getBootState = () => window.api.getBootState();
  getLogs = () => window.api.getLogs();
  exportLogsCsv = (filters: LogCsvFilters) => window.api.exportLogsCsv(filters);
  subscribe = (handler: (event: MainEvent) => void) => window.api.on('main-event', handler);
  notifyRendererReady = () => window.api.rendererReady();
}
