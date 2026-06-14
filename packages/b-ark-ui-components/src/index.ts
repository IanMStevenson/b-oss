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

export { SplitButton } from './SplitButton.js';
export type { SplitButtonAction } from './SplitButton.js';
export { BackupBanner } from './BackupBanner.js';
export { AccountHeaderBar } from './AccountHeaderBar.js';
export type { AccountHeaderBarProps } from './AccountHeaderBar.js';
export { IconButton } from './IconButton.js';
export type { IconButtonProps } from './IconButton.js';
export { BackupButton } from './BackupButton.js';
export type { BackupButtonProps } from './BackupButton.js';
export { Avatar } from './Avatar.js';
export { StatusBar } from './StatusBar.js';
export { AuthErrorBanner } from './AuthErrorBanner.js';
export { ToastHost } from './ToastHost.js';
export { InfoBadge } from './InfoBadge.js';
export { LogPanel } from './LogPanel.js';
