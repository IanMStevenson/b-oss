// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { StaleBackupNotice } from './backend.js';
import type { DescribedReason } from './ragReasons.js';

/**
 * Wording and actions for the launch-time "scheduled backups had not run" notice.
 * Retrospective and calm: a computer that was off is normal, so it prompts a check
 * rather than alarming. (If Scheduled is on but start at sign-in is broken, the
 * startup-task banner is the one that says so.)
 */
export function describeStaleBackup(notice: StaleBackupNotice, locale?: string): DescribedReason {
  const when = new Date(notice.lastBackupAt).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
  });
  return {
    key: 'stale_backup',
    text: `Scheduled backups had not run for ${notice.daysSince} days (last backup ${when}). A catch-up backup is starting now. If your computer was off, that is expected; if it was on, check that b-ark is starting when you sign in.`,
    actions: ['dismiss', 'dont_show_again'],
  };
}
