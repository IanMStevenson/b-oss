// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

export { default as App } from './App.js';
export type {
  BackendContext,
  AccountConfig,
  AppStore,
  LogEntry,
  MainEvent,
  BackupEvent,
  BackupErrorPayload,
} from './backend.js';
export { ElectronBackend } from './electron-backend.js';
