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

/** What setReminderEnabled() did: `'refused'` means the notification permission was refused, so
 * the reminder was stored as off instead (§12: a refusal turns it off, no third state). */
export type ReminderResult = 'ok' | 'refused';

/** FLW-18 step 1/2: reminders are per read-write account, each with its own on/off + time.
 * Cancels immediately when disabled — never leaves a stale schedule running. When enabling, a
 * refused permission or a scheduling error leaves the reminder stored as off (time kept), so the
 * toggle never claims a reminder that won't fire; an error is rethrown for the caller to show. */
export async function setReminderEnabled(
  accountId: string,
  enabled: boolean,
  time: { hour: number; minute: number },
): Promise<ReminderResult> {
  const setting: ReminderSetting = { enabled, hour: time.hour, minute: time.minute };
  const { setReminder } = useDevicePrefsStore.getState();
  setReminder(accountId, setting);
  if (!enabled) {
    await cancelReminder(accountId);
    return 'ok';
  }
  let scheduled: boolean;
  try {
    scheduled = await scheduleReminder(accountId, time);
  } catch (err) {
    setReminder(accountId, { ...setting, enabled: false });
    // A time change on an already-scheduled reminder may have left the old one in place.
    void cancelReminder(accountId).catch(() => {});
    throw err;
  }
  if (scheduled) return 'ok';
  setReminder(accountId, { ...setting, enabled: false });
  return 'refused';
}

/** FLW-18 step 3 / §12: called by flows/composeFlow.ts whenever a publish (new entry or
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
