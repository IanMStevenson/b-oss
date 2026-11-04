// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { ScheduleInterval, StaleBackupNotice } from '@b-oss/b-ark-ui-electron';

/** Default threshold, in schedule intervals. 0 means the alert is off. */
export const DEFAULT_STALE_ALERT_INTERVALS = 3;

/** Never alert for a gap shorter than this, whatever the schedule (a long weekend is normal). */
export const MIN_STALE_THRESHOLD_DAYS = 3;

const DAY_MS = 86_400_000;
const INTERVAL_DAYS: Record<ScheduleInterval, number> = { daily: 1, weekly: 7, monthly: 30 };

export interface StaleCheckAccount {
  last_backup_at: string | null;
  rag_state: 'green' | 'amber' | 'red';
}

export interface StaleCheckInput {
  accounts: StaleCheckAccount[];
  schedule: { enabled: boolean; interval: ScheduleInterval };
  /** Threshold in schedule intervals; 0 (or undefined-as-default handled by caller) is off. */
  intervals: number;
  now: Date;
}

export function thresholdDays(intervals: number, interval: ScheduleInterval): number {
  return Math.max(MIN_STALE_THRESHOLD_DAYS, intervals * INTERVAL_DAYS[interval]);
}

/**
 * Decide whether to show the stale-backup notice. Call at launch, BEFORE the catch-up
 * backup runs, so the gap is measured against the backup that came before it.
 *
 * - Off when intervals <= 0 or the schedule is disabled (manual-only users chose that).
 * - Uses the OLDEST last successful backup across accounts, since one neglected journal
 *   is the problem. Accounts with no backup yet are ignored (nothing to be stale), as are
 *   red accounts (signed out: the red banner already explains why they are not backing up).
 * - A last backup in the future (clock changed) or an invalid date never alerts.
 */
export function checkStaleBackup(input: StaleCheckInput): StaleBackupNotice | null {
  if (!Number.isFinite(input.intervals) || input.intervals <= 0) return null;
  if (!input.schedule.enabled) return null;
  const nowMs = input.now.getTime();
  if (!Number.isFinite(nowMs)) return null;

  let oldest: number | null = null;
  for (const a of input.accounts) {
    if (a.rag_state === 'red' || !a.last_backup_at) continue;
    const t = new Date(a.last_backup_at).getTime();
    if (!Number.isFinite(t)) continue;
    if (oldest === null || t < oldest) oldest = t;
  }
  if (oldest === null) return null;

  const gapMs = nowMs - oldest;
  if (gapMs < 0) return null;
  if (gapMs <= thresholdDays(input.intervals, input.schedule.interval) * DAY_MS) return null;

  return {
    lastBackupAt: new Date(oldest).toISOString(),
    daysSince: Math.floor(gapMs / DAY_MS),
  };
}
