// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The daily reminder on the desktop shell (b-oss#894). On Android the OS holds the schedule; on
// desktop the shell's main process runs the clock (it keeps going with the window hidden in the
// tray), so it is told the full set of reminders that are on: once the device prefs have loaded, and
// again whenever they change. That also covers a reminder switched on before the shell could run it.
// Off the desktop shell this does nothing.

import { useDevicePrefsStore } from '../state/devicePrefsStore.js';
import { configureDesktopReminders } from '../platform/desktopNotify.js';

/** The reminders that are on, in a stable order so an unchanged set is recognised. */
export function enabledReminders(
  reminders: ReturnType<typeof useDevicePrefsStore.getState>['reminders'],
): { accountId: string; hour: number; minute: number }[] {
  return Object.entries(reminders)
    .filter(([, setting]) => setting.enabled)
    .map(([accountId, { hour, minute }]) => ({ accountId, hour, minute }))
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
}

/** Starts keeping the shell's reminders in step with the stored settings. Returns the unsubscribe. */
export function startReminderSync(): () => void {
  let last = '';
  const push = (): void => {
    const state = useDevicePrefsStore.getState();
    if (!state.hydrated) return;
    const reminders = enabledReminders(state.reminders);
    const key = JSON.stringify(reminders);
    if (key === last) return;
    last = key;
    void configureDesktopReminders(reminders).catch(() => {
      // Retry on the next change; forgetting the key makes an identical state send again.
      last = '';
    });
  };
  const unsubscribe = useDevicePrefsStore.subscribe(push);
  push();
  return unsubscribe;
}
