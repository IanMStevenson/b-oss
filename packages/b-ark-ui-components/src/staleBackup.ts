// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { StaleBackupNotice } from './backend.js';
import type { DescribedReason } from './ragReasons.js';

/**
 * Wording and actions for the launch-time "b-ark had not backed up for a while" notice.
 * Retrospective and calm: a computer that was off is normal, so it prompts a check
 * rather than alarming. Windows-only guidance is only offered on Windows.
 */
export function describeStaleBackup(notice: StaleBackupNotice, locale?: string): DescribedReason {
  const when = new Date(notice.lastBackupAt).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });
  const lead = `b-ark had not backed up for ${notice.daysSince} days (last backup ${when}). A catch-up backup is starting now.`;
  if (notice.platform !== 'win32') {
    return {
      key: 'stale_backup',
      text: `${lead} If your computer was off, that is expected.`,
      actions: ['dismiss'],
    };
  }
  const how =
    notice.startupEnabled === false
      ? "b-ark is not set to start with Windows, so scheduled backups only run while it is open. Turn on Start with Windows in Settings, and make sure it is On in Windows' Startup apps."
      : 'If your computer was off, that is expected. If it was on, check that b-ark starts with Windows: open Windows Settings, Apps, Startup, and make sure b-ark is On.';
  return {
    key: 'stale_backup',
    text: `${lead} ${how}`,
    actions: ['open_startup_settings', 'dismiss'],
  };
}
