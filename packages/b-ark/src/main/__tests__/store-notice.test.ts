// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect } from 'vitest';
import { isStoreNoticeOffered, snoozeUntil, STORE_NOTICE_SNOOZE_DAYS } from '../store-notice.js';

const now = new Date('2026-11-10T12:00:00Z');
const base = { windowsStore: false, platform: 'win32' as const, now, dismissed: false };

describe('isStoreNoticeOffered', () => {
  it('is offered on a Windows GitHub-installer build', () => {
    expect(isStoreNoticeOffered(base)).toBe(true);
  });
  it('is never offered in the Store build', () => {
    expect(isStoreNoticeOffered({ ...base, windowsStore: true })).toBe(false);
  });
  it('is not offered off Windows', () => {
    expect(isStoreNoticeOffered({ ...base, platform: 'linux' })).toBe(false);
    expect(isStoreNoticeOffered({ ...base, platform: 'darwin' })).toBe(false);
  });
  it('is hidden once dismissed this session', () => {
    expect(isStoreNoticeOffered({ ...base, dismissed: true })).toBe(false);
  });
  it('is hidden while snoozed', () => {
    expect(isStoreNoticeOffered({ ...base, snoozedUntil: snoozeUntil(now) })).toBe(false);
    expect(isStoreNoticeOffered({ ...base, snoozedUntil: '2026-11-10T12:00:01Z' })).toBe(false);
  });
  it('shows again once the snooze has expired', () => {
    expect(isStoreNoticeOffered({ ...base, snoozedUntil: '2026-11-10T12:00:00Z' })).toBe(true);
    expect(isStoreNoticeOffered({ ...base, snoozedUntil: '2026-11-01T00:00:00Z' })).toBe(true);
  });
  it('ignores an unreadable snooze value', () => {
    expect(isStoreNoticeOffered({ ...base, snoozedUntil: 'garbage' })).toBe(true);
  });
  it('a snooze never makes a Store build show it', () => {
    expect(
      isStoreNoticeOffered({ ...base, windowsStore: true, snoozedUntil: '2026-01-01T00:00:00Z' }),
    ).toBe(false);
  });
});

describe('snoozeUntil', () => {
  it('is 14 days ahead', () => {
    expect(STORE_NOTICE_SNOOZE_DAYS).toBe(14);
    expect(snoozeUntil(now)).toBe('2026-11-24T12:00:00.000Z');
  });
});
