// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/local-notifications: schedule/cancel the daily reminder, post notifications
// the app builds itself (§11, §12). Inexact scheduling only — never requests SCHEDULE_EXACT_ALARM.
// TODO(Phase 7/12): implement against @capacitor/local-notifications.

export function scheduleReminder(
  _accountId: string,
  _time: { hour: number; minute: number },
): Promise<void> {
  return Promise.reject(new Error('platform/localNotifications.ts: not implemented until Phase 7'));
}

export function cancelReminder(_accountId: string): Promise<void> {
  return Promise.reject(new Error('platform/localNotifications.ts: not implemented until Phase 7'));
}
