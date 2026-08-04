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
// Web has no real implementation of scheduled notifications (the plugin's web fallback exists
// but can't survive a page reload, let alone actually fire while the tab is closed) — every
// export here is a silent no-op off native, which is honest given rules.md's own "reminders...
// no fire-time network check" framing already assumes a real OS scheduler.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

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
 * remembered "blocked" state distinct from the setting itself (rules.md, applied to reminders per
 * §12's explicit note). Returns whether the permission is held after this call. */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
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

async function scheduleAt(
  accountId: string,
  time: ReminderTime,
  skipToday: boolean,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const granted = await ensureNotificationPermission();
  if (!granted) return; // A refusal turns the reminder off rather than a third state (§12).

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
      },
    ],
  });
}

/** Used when the reminder is (re)enabled or its time changes — anchors at the next occurrence
 * from now (today, if that time hasn't passed yet; otherwise tomorrow). */
export async function scheduleReminder(accountId: string, time: ReminderTime): Promise<void> {
  await scheduleAt(accountId, time, false);
}

/** FLW-18's cancel-and-reschedule-on-publish — always anchors at tomorrow, regardless of whether
 * today's time has passed, since a publish happening now always means today is covered. */
export async function rescheduleReminderSkippingToday(
  accountId: string,
  time: ReminderTime,
): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.cancel({ notifications: [{ id: reminderIdFor(accountId) }] });
  await scheduleAt(accountId, time, true);
}

export async function cancelReminder(accountId: string): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.cancel({ notifications: [{ id: reminderIdFor(accountId) }] });
}

/** FLW-18's "tapping it switches to that account, then opens SCR-09" — reads the `extra` payload
 * `scheduleAt` attaches above. Returns a no-op unsubscribe on web, same convention as
 * platform/browser.ts's onBrowserFinished / platform/deepLinks.ts's onAppUrlOpen. */
export function onReminderTapped(handler: (accountId: string) => void): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};
  let handle: { remove: () => void } | undefined;
  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    const extra = action.notification.extra as { accountId?: string; kind?: string } | undefined;
    if (extra?.kind === 'daily-reminder' && extra.accountId) handler(extra.accountId);
  }).then((h) => {
    handle = h;
  });
  return () => handle?.remove();
}
