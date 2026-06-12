// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Shared presentational kit for b-ark surfaces (electron + chrome).
// Pure, prop-driven components + the BackendContext data seam + view types.

export type {
  ScheduleInterval,
  PortableAccount,
  PortableSchedule,
  BArkSettings,
  AccountStatus,
  UserDataStore,
  AccountConfig,
  AppStore,
  LogEntry,
  BackupErrorPayload,
  BackupPhase,
  BackupEvent,
  MainEvent,
  SharedSettingsPartial,
  BootState,
  BackendContext,
  LogCsvFilters,
} from './backend.js';

export type { BackupProgress, Toast } from './view-types.js';
