// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/** "Remind me later" hides the Store notice for this long. There is no permanent opt-out. */
export const STORE_NOTICE_SNOOZE_DAYS = 14;

export interface StoreNoticeInput {
  /** process.windowsStore === true: the Microsoft Store build, which the Store updates itself. */
  windowsStore: boolean;
  platform: NodeJS.Platform;
  /** ISO time the machine-local "Remind me later" snooze ends, if one was set. */
  snoozedUntil?: string | undefined;
  now: Date;
  /** Dismissed this session (shows again next launch). */
  dismissed: boolean;
}

/** When a snooze started at `now` ends (ISO). */
export function snoozeUntil(now: Date): string {
  return new Date(now.getTime() + STORE_NOTICE_SNOOZE_DAYS * 86_400_000).toISOString();
}

/**
 * Whether to offer the "b-ark is now on the Microsoft Store" notice: Windows builds that are not
 * the Store build, unless dismissed this session or snoozed. A snooze that has expired (or whose
 * stored value is unreadable) no longer hides it. Pure, so it is testable off Windows.
 */
export function isStoreNoticeOffered(input: StoreNoticeInput): boolean {
  if (input.platform !== 'win32') return false;
  if (input.windowsStore) return false;
  if (input.dismissed) return false;
  if (input.snoozedUntil) {
    const until = new Date(input.snoozedUntil).getTime();
    if (Number.isFinite(until) && input.now.getTime() < until) return false;
  }
  return true;
}
