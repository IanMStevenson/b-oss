// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const fetchUnreadTotals =
  vi.fn<(...args: unknown[]) => Promise<{ comments: number; notifications: number }>>();
vi.mock('../../data/notifications.js', () => ({
  fetchUnreadTotals: (...args: unknown[]) => fetchUnreadTotals(...args),
}));

const clearDeliveredPushes = vi.fn<(accountId: string, stream: string) => Promise<void>>();
vi.mock('../../platform/push.js', () => ({
  clearDeliveredPushes: (a: string, s: string) => clearDeliveredPushes(a, s),
}));

const { useAccountsStore } = await import('../accountsStore.js');
const { useNotificationCountsStore, REFRESH_MIN_AGE_MS } =
  await import('../notificationCountsStore.js');

beforeEach(() => {
  vi.clearAllMocks();
  clearDeliveredPushes.mockResolvedValue();
  useAccountsStore.setState({ activeAccountId: 'acc1' });
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

describe('refreshIfStale', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useNotificationCountsStore.getState().reset(); // also clears the throttle
  });
  afterEach(() => vi.useRealTimers());

  it('fetches the first time, skips within a minute, fetches again after', async () => {
    fetchUnreadTotals.mockResolvedValue({ comments: 1, notifications: 1 });
    const { refreshIfStale } = useNotificationCountsStore.getState();
    await refreshIfStale();
    await refreshIfStale();
    expect(fetchUnreadTotals).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(REFRESH_MIN_AGE_MS);
    await refreshIfStale();
    expect(fetchUnreadTotals).toHaveBeenCalledTimes(2);
  });

  it('retries straight away after a failed fetch', async () => {
    fetchUnreadTotals.mockRejectedValueOnce(new Error('down'));
    fetchUnreadTotals.mockResolvedValue({ comments: 2, notifications: 0 });
    await useNotificationCountsStore.getState().refreshIfStale();
    await useNotificationCountsStore.getState().refreshIfStale();
    expect(useNotificationCountsStore.getState().comments).toBe(2);
  });

  it('plain refresh is never throttled', async () => {
    fetchUnreadTotals.mockResolvedValue({ comments: 0, notifications: 0 });
    await useNotificationCountsStore.getState().refresh();
    await useNotificationCountsStore.getState().refresh();
    expect(fetchUnreadTotals).toHaveBeenCalledTimes(2);
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

describe('a refresh that was already in flight (b-oss#148)', () => {
  function deferredTotals() {
    let resolve!: (t: { comments: number; notifications: number }) => void;
    fetchUnreadTotals.mockReturnValue(new Promise((r) => (resolve = r)));
    return (t: { comments: number; notifications: number }) => resolve(t);
  }

  it("doesn't put back a count the inbox cleared while it was fetching", async () => {
    // Push tap: the account switch starts a refresh, then the Comments inbox opens, clears the
    // badge and marks everything read. The refresh then lands with the old server figure.
    const finish = deferredTotals();
    const refreshing = useNotificationCountsStore.getState().refresh();
    useNotificationCountsStore.getState().clearComments();
    finish({ comments: 2, notifications: 4 });
    await refreshing;
    expect(useNotificationCountsStore.getState()).toMatchObject({ comments: 0, notifications: 4 });
  });

  it("doesn't apply a previous account's counts after a reset", async () => {
    const finish = deferredTotals();
    const refreshing = useNotificationCountsStore.getState().refresh();
    useNotificationCountsStore.getState().reset();
    finish({ comments: 2, notifications: 4 });
    await refreshing;
    expect(useNotificationCountsStore.getState()).toMatchObject({ comments: 0, notifications: 0 });
  });
});

describe('clearing delivered pushes (b-oss#1020)', () => {
  it("clears the active account's tray notifications when an inbox opens", () => {
    useNotificationCountsStore.getState().clearComments();
    useNotificationCountsStore.getState().clearNotifications();
    expect(clearDeliveredPushes).toHaveBeenCalledWith('acc1', 'comments');
    expect(clearDeliveredPushes).toHaveBeenCalledWith('acc1', 'notifications');
  });

  it('clears only the streams whose refreshed total is 0', async () => {
    fetchUnreadTotals.mockResolvedValue({ comments: 0, notifications: 3 });
    await useNotificationCountsStore.getState().refresh();
    expect(clearDeliveredPushes).toHaveBeenCalledTimes(1);
    expect(clearDeliveredPushes).toHaveBeenCalledWith('acc1', 'comments');
  });

  it('does nothing without an active account', () => {
    useAccountsStore.setState({ activeAccountId: null });
    useNotificationCountsStore.getState().clearComments();
    expect(clearDeliveredPushes).not.toHaveBeenCalled();
  });
});
