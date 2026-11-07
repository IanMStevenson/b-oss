// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Wraps @capacitor/local-notifications: schedule/cancel the daily reminder (FLW-18), and (later,
// §11) post notifications the app builds itself. Inexact scheduling only — nothing here ever sets
// `allowWhileIdle` or requests SCHEDULE_EXACT_ALARM/USE_EXACT_ALARM (§12: a "post your blip"
// nudge is not the kind of app Play policy reserves exact alarms for).
//
// Scheduling shape is a deliberate refinement of app-architecture.md §12's literal wording, not a
// literal `on: {hour, minute}, repeats: true` — worth explaining, since the naive reading has a
// real bug. §12 also requires suppression-by-cancellation: "cancel A's reminder occurrence for
// today and schedule the next one for tomorrow" whenever a publish succeeds. But a plain
// `on: {hour, minute}, repeats: true` schedule is a recurring *pattern* with no notion of "skip
// just today" — cancelling and re-issuing the identical pattern doesn't skip today at all when
// today's time hasn't passed yet (the plugin just computes the next hour:minute match from *now*,
// which is still today). That would silently fail to suppress a reminder for anyone who publishes
// before their reminder time — the exact case the feature exists for. Using `every: 'day'`
// anchored at an explicit `at` Date instead gives app code (which only needs to run at the two
// moments that matter: enabling the reminder, and a successful publish) precise control over
// *which* day the series' first occurrence lands on, while the plugin's own `every: 'day'` still
// handles every subsequent day natively with no app involvement — satisfying FLW-18's "fires
// reliably without requiring the app to have been opened that day" on its own.
//
// On the desktop shell the main process runs the clock instead (b-oss#894): the shell is sent the
// stored reminders by flows/reminderSync.ts, and skip-today and tap go through its `reminders` bridge,
// so flows/reminderFlow.ts is unchanged.
//
// Web has no real implementation of scheduled notifications (the plugin's web fallback exists
// but can't survive a page reload, let alone actually fire while the tab is closed) — every
// export here is a silent no-op off native, which is honest given reminders (no fire-time network
// check) already assume a real OS scheduler.

import { LocalNotifications } from '@capacitor/local-notifications';
import { isCapacitorNative } from './platformKind.js';
import { desktopBridge } from './desktop.js';

export interface ReminderTime {
  hour: number;
  minute: number;
}

/** A stable 31-bit positive int from an accountId (username) — LocalNotificationSchema.id must
 * be a 32-bit int, and re-deriving it from the accountId (rather than storing one) means
 * schedule/cancel always agree without persisting anything extra. */
function reminderIdFor(accountId: string): number {
  let hash = 0;
  for (let i = 0; i < accountId.length; i++) {
    hash = (hash * 31 + accountId.charCodeAt(i)) | 0;
  }
  return hash & 0x7fffffff;
}

/** Shared with push (§12) — the same POST_NOTIFICATIONS runtime permission on Android 13+, no
 * remembered "blocked" state distinct from the setting itself (applied to reminders per §12's
 * explicit note). Returns whether the permission is held after this call. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isCapacitorNative()) return false;
  const current = await LocalNotifications.checkPermissions();
  if (current.display === 'granted') return true;
  const requested = await LocalNotifications.requestPermissions();
  return requested.display === 'granted';
}

function nextOccurrence(time: ReminderTime, skipToday: boolean): Date {
  const now = new Date();
  const candidate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    time.hour,
    time.minute,
    0,
    0,
  );
  if (skipToday || candidate.getTime() <= now.getTime()) {
    candidate.setDate(candidate.getDate() + 1);
  }
  return candidate;
}

/** Resolves false only when the notification permission is refused — the caller turns the
 * reminder off rather than keeping a third state (§12). Off native there's nothing to refuse, so
 * that's true too (the no-op stance above). */
async function scheduleAt(
  accountId: string,
  time: ReminderTime,
  skipToday: boolean,
): Promise<boolean> {
  // Desktop: the shell runs the clock and is sent the stored settings by flows/reminderSync.ts
  // (b-oss#894), so there is nothing to schedule here and a toast needs no permission prompt. A shell
  // too old to have reminders cannot remind: say so rather than store one that will never fire.
  const desktop = desktopBridge();
  if (desktop) {
    if (!desktop.reminders) throw new Error('This b-mobile desktop shell cannot show reminders.');
    return true;
  }
  if (!isCapacitorNative()) return true;
  const granted = await ensureNotificationPermission();
  if (!granted) return false;

  await LocalNotifications.schedule({
    notifications: [
      {
        id: reminderIdFor(accountId),
        title: 'Post your daily blip',
        body: `${accountId} hasn't published an entry today.`,
        schedule: { at: nextOccurrence(time, skipToday), every: 'day' },
        extra: { accountId, kind: 'daily-reminder' },
        // Must match the channel id android/'s MainActivity creates at launch
        // (app-architecture.md §17's "notification channel per category").
        channelId: 'reminders',
        // The plugin defaults to an exact alarm and, on Android 12+ without exact-alarm access,
        // opens the "Alarms & reminders" settings screen before scheduling. Inexact is the
        // intent here (see the header), so ask for it explicitly.
        isExactNotification: false,
      },
    ],
  });
  return true;
}

/** Used when the reminder is (re)enabled or its time changes — anchors at the next occurrence
 * from now (today, if that time hasn't passed yet; otherwise tomorrow). Resolves false if the
 * notification permission was refused, so nothing was scheduled. */
export function scheduleReminder(accountId: string, time: ReminderTime): Promise<boolean> {
  return scheduleAt(accountId, time, false);
}

/** FLW-18's cancel-and-reschedule-on-publish — always anchors at tomorrow, regardless of whether
 * today's time has passed, since a publish happening now always means today is covered. */
export async function rescheduleReminderSkippingToday(
  accountId: string,
  time: ReminderTime,
): Promise<void> {
  const desktop = desktopBridge();
  if (desktop) {
    await desktop.reminders?.skipToday(accountId);
    return;
  }
  if (!isCapacitorNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: reminderIdFor(accountId) }] });
  await scheduleAt(accountId, time, true);
}

export async function cancelReminder(accountId: string): Promise<void> {
  // Desktop: the stored setting is already off; flows/reminderSync.ts tells the shell.
  if (desktopBridge() || !isCapacitorNative()) return;
  await LocalNotifications.cancel({ notifications: [{ id: reminderIdFor(accountId) }] });
}

/** FLW-18's "tapping it switches to that account, then opens SCR-09" — reads the `extra` payload
 * `scheduleAt` attaches above. Returns a no-op unsubscribe on web, same convention as
 * platform/browser.ts's onBrowserFinished / platform/deepLinks.ts's onAppUrlOpen. */
export function onReminderTapped(handler: (accountId: string) => void): () => void {
  const desktop = desktopBridge();
  if (desktop) return desktop.reminders?.onTapped(handler) ?? (() => {});
  if (!isCapacitorNative()) return () => {};
  let handle: { remove: () => void } | undefined;
  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const extra = action.notification.extra as { accountId?: string; kind?: string } | undefined;
    if (extra?.kind === 'daily-reminder' && extra.accountId) handler(extra.accountId);
  }).then((h) => {
    handle = h;
  });
  return () => handle?.remove();
}
