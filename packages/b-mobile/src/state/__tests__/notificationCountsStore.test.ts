// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach, vi } from 'vitest';

const fetchUnreadTotals =
  vi.fn<(...args: unknown[]) => Promise<{ comments: number; notifications: number }>>();
vi.mock('../../data/notifications.js', () => ({
  fetchUnreadTotals: (...args: unknown[]) => fetchUnreadTotals(...args),
}));

const { useNotificationCountsStore } = await import('../notificationCountsStore.js');

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationCountsStore.setState({ comments: 0, notifications: 0 });
});

describe('refresh', () => {
  it('sets both counts from a successful fetch', async () => {
    fetchUnreadTotals.mockResolvedValue({ comments: 3, notifications: 7 });
    await useNotificationCountsStore.getState().refresh();
    expect(useNotificationCountsStore.getState()).toMatchObject({ comments: 3, notifications: 7 });
  });

  it('leaves the last-known counts in place on a failed fetch', async () => {
    useNotificationCountsStore.setState({ comments: 2, notifications: 4 });
    fetchUnreadTotals.mockRejectedValue(new Error('network down'));
    await useNotificationCountsStore.getState().refresh();
    expect(useNotificationCountsStore.getState()).toMatchObject({ comments: 2, notifications: 4 });
  });
});

describe('clearComments / clearNotifications', () => {
  it('zero exactly the one stream, leaving the other untouched', () => {
    useNotificationCountsStore.setState({ comments: 5, notifications: 9 });
    useNotificationCountsStore.getState().clearComments();
    expect(useNotificationCountsStore.getState()).toMatchObject({ comments: 0, notifications: 9 });
    useNotificationCountsStore.getState().clearNotifications();
    expect(useNotificationCountsStore.getState()).toMatchObject({ comments: 0, notifications: 0 });
  });
});

describe('reset', () => {
  it('zeroes both counts, e.g. on account switch/sign-out', () => {
    useNotificationCountsStore.setState({ comments: 5, notifications: 9 });
    useNotificationCountsStore.getState().reset();
    expect(useNotificationCountsStore.getState()).toMatchObject({ comments: 0, notifications: 0 });
  });
});
