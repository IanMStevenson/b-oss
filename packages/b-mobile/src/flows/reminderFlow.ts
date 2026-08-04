// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-18 — the daily publish reminder. The data model (devicePrefsStore.reminders) and this
// module's scheduling logic are built now even though SCR-25's own on/off + time-picker UI is
// Phase 8 — same "gate built ahead of its screen" shape Phase 4 established for
// confirmAccountBeforeReaction. Nothing calls setReminderEnabled() yet outside tests until that
// screen lands, which is fine: a reminder that was never enabled is never scheduled.

import { useDevicePrefsStore } from '../state/devicePrefsStore.js';
import type { ReminderSetting } from '../state/devicePrefsStore.js';
import {
  scheduleReminder,
  cancelReminder,
  rescheduleReminderSkippingToday,
} from '../platform/localNotifications.js';

/** FLW-18 step 1/2: reminders are per read-write account, each with its own on/off + time.
 * Cancels immediately when disabled — never leaves a stale schedule running. */
export async function setReminderEnabled(
  accountId: string,
  enabled: boolean,
  time: { hour: number; minute: number },
): Promise<void> {
  const setting: ReminderSetting = { enabled, hour: time.hour, minute: time.minute };
  useDevicePrefsStore.getState().setReminder(accountId, setting);
  if (enabled) {
    await scheduleReminder(accountId, time);
  } else {
    await cancelReminder(accountId);
  }
}

/** FLW-18 step 3 / §12: called by flows/uploadQueueRunner.ts whenever a publish (new entry or
 * edit — either counts as "published through the app today") succeeds. A no-op if that account
 * has no enabled reminder. Never awaited by the caller — scheduling failures here must never
 * surface as an upload failure; best-effort. */
export function onEntryPublished(accountId: string): void {
  const setting = useDevicePrefsStore.getState().reminders[accountId];
  if (!setting?.enabled) return;
  void rescheduleReminderSkippingToday(accountId, { hour: setting.hour, minute: setting.minute });
}

/** FLW-18 step: account removed, or changed to read-only (a read-only account can't publish, so
 * it's never offered a reminder — any it had must be cancelled). Safe to call for an account that
 * never had a reminder configured. */
export function cancelReminderForAccount(accountId: string): void {
  const hadReminder = accountId in useDevicePrefsStore.getState().reminders;
  useDevicePrefsStore.getState().clearReminder(accountId);
  if (hadReminder) void cancelReminder(accountId);
}
