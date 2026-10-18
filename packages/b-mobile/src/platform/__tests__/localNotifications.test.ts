// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The plugin schedules exact alarms unless told otherwise, and on Android 12+ without exact-alarm
// access it opens the "Alarms & reminders" settings screen first (b-oss#389). The reminder is
// meant to be inexact, so this pins the flag that crosses the JS/native boundary.

import { describe, it, expect, vi } from 'vitest';

const schedule = vi.fn<(o: { notifications: Record<string, unknown>[] }) => Promise<void>>();
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: () => Promise.resolve({ display: 'granted' }),
    requestPermissions: () => Promise.resolve({ display: 'granted' }),
    schedule: (o: { notifications: Record<string, unknown>[] }) => schedule(o),
    cancel: () => Promise.resolve(),
  },
}));

const { scheduleReminder, rescheduleReminderSkippingToday } =
  await import('../localNotifications.js');

describe('reminder scheduling', () => {
  it('never asks the plugin for an exact alarm', async () => {
    await scheduleReminder('acct1', { hour: 8, minute: 30 });
    await rescheduleReminderSkippingToday('acct1', { hour: 8, minute: 30 });
    expect(schedule).toHaveBeenCalledTimes(2);
    for (const [arg] of schedule.mock.calls) {
      expect(arg.notifications[0]).toMatchObject({ isExactNotification: false });
    }
  });
});
