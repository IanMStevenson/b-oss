// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The BackendContext data seam now lives in the shared kit. This re-export
// keeps every internal `from '../backend.js'` import (and electron-backend.ts)
// resolving unchanged.
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
} from '@b-oss/b-ark-ui-components';
