// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-18's suppression-by-cancellation rule (§12) is the part most likely to be got subtly wrong:
// a publish must reschedule (not just leave alone) that account's reminder, and only if it's
// actually enabled. Mocks platform/localNotifications.ts at the boundary (no real device
// scheduler in jsdom), same as every other platform/** consumer test.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDevicePrefsStore } from '../../state/devicePrefsStore.js';
import { setReminderEnabled, onEntryPublished, cancelReminderForAccount } from '../reminderFlow.js';

const { scheduleReminder, cancelReminder, rescheduleReminderSkippingToday } = vi.hoisted(() => ({
  scheduleReminder: vi.fn().mockResolvedValue(undefined),
  cancelReminder: vi.fn().mockResolvedValue(undefined),
  rescheduleReminderSkippingToday: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../platform/localNotifications.js', () => ({
  scheduleReminder,
  cancelReminder,
  rescheduleReminderSkippingToday,
}));

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  useDevicePrefsStore.setState({
    confirmAccountBeforeReaction: false,
    reminders: {},
    hydrated: true,
  });
});

describe('setReminderEnabled', () => {
  it('persists the setting and schedules when enabled', async () => {
    await setReminderEnabled('acct1', true, { hour: 8, minute: 30 });
    expect(useDevicePrefsStore.getState().reminders.acct1).toEqual({
      enabled: true,
      hour: 8,
      minute: 30,
    });
    expect(scheduleReminder).toHaveBeenCalledWith('acct1', { hour: 8, minute: 30 });
    expect(cancelReminder).not.toHaveBeenCalled();
  });

  it('persists as disabled and cancels when turned off', async () => {
    await setReminderEnabled('acct1', false, { hour: 8, minute: 30 });
    expect(useDevicePrefsStore.getState().reminders.acct1.enabled).toBe(false);
    expect(cancelReminder).toHaveBeenCalledWith('acct1');
    expect(scheduleReminder).not.toHaveBeenCalled();
  });
});

describe('onEntryPublished', () => {
  it('reschedules (skipping today) when the account has an enabled reminder', () => {
    useDevicePrefsStore.getState().setReminder('acct1', { enabled: true, hour: 9, minute: 0 });
    onEntryPublished('acct1');
    expect(rescheduleReminderSkippingToday).toHaveBeenCalledWith('acct1', { hour: 9, minute: 0 });
  });

  it('does nothing for an account with no reminder configured', () => {
    onEntryPublished('acct-unknown');
    expect(rescheduleReminderSkippingToday).not.toHaveBeenCalled();
  });

  it('does nothing for an account whose reminder is disabled', () => {
    useDevicePrefsStore.getState().setReminder('acct1', { enabled: false, hour: 9, minute: 0 });
    onEntryPublished('acct1');
    expect(rescheduleReminderSkippingToday).not.toHaveBeenCalled();
  });
});

describe('cancelReminderForAccount', () => {
  it('clears the stored setting and cancels the native schedule', () => {
    useDevicePrefsStore.getState().setReminder('acct1', { enabled: true, hour: 9, minute: 0 });
    cancelReminderForAccount('acct1');
    expect(useDevicePrefsStore.getState().reminders.acct1).toBeUndefined();
    expect(cancelReminder).toHaveBeenCalledWith('acct1');
  });

  it('is a no-op (no native call) for an account that never had a reminder', () => {
    cancelReminderForAccount('acct-never-configured');
    expect(cancelReminder).not.toHaveBeenCalled();
  });
});
