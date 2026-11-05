// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Cases ported from b-push's poll tests (poll.test.ts), expressed against the pure rule.

import { describe, expect, it, vi } from 'vitest';
import { decideNotifications, settle, type Notify, type StreamSettings } from '../decide.js';

const BOTH_ON: StreamSettings = { comments: true, notifications: true };

describe('decideNotifications', () => {
  it('notifies once per stream whose total rose, and stores the new totals', () => {
    const d = decideNotifications({
      totals: { comments: 3, notifications: 2 },
      lastSeen: { comments: 1, notifications: 2 },
      streams: BOTH_ON,
    });
    expect(d.notify).toEqual([{ stream: 'comments', count: 2 }]);
    expect(d.nextSeen).toEqual({ comments: 3, notifications: 2 });
  });

  it('notifies for both streams independently, comments first', () => {
    const d = decideNotifications({
      totals: { comments: 2, notifications: 5 },
      lastSeen: { comments: 0, notifications: 0 },
      streams: BOTH_ON,
    });
    expect(d.notify).toEqual([
      { stream: 'comments', count: 2 },
      { stream: 'notifications', count: 5 },
    ]);
  });

  it('never notifies for a falling or unchanged total, but stores it', () => {
    const d = decideNotifications({
      totals: { comments: 1, notifications: 4 },
      lastSeen: { comments: 3, notifications: 4 },
      streams: BOTH_ON,
    });
    expect(d.notify).toEqual([]);
    expect(d.nextSeen).toEqual({ comments: 1, notifications: 4 });
  });

  it('skips a switched-off stream but still records its total (b-oss#244)', () => {
    const d = decideNotifications({
      totals: { comments: 4, notifications: 6 },
      lastSeen: { comments: 0, notifications: 0 },
      streams: { comments: false, notifications: true },
    });
    expect(d.notify).toEqual([{ stream: 'notifications', count: 6 }]);
    expect(d.nextSeen).toEqual({ comments: 4, notifications: 6 });
  });

  it('with both streams off: nothing to deliver, totals recorded, so a re-enabled stream sends no catch-up (b-oss#244)', () => {
    const off: StreamSettings = { comments: false, notifications: false };
    const first = decideNotifications({
      totals: { comments: 4, notifications: 6 },
      lastSeen: { comments: 0, notifications: 0 },
      streams: off,
    });
    expect(first.notify).toEqual([]);
    const second = decideNotifications({
      totals: { comments: 4, notifications: 6 },
      lastSeen: first.nextSeen,
      streams: BOTH_ON,
    });
    expect(second.notify).toEqual([]);
  });
});

describe('settle', () => {
  const lastSeen = { comments: 1, notifications: 0 };
  const decide = (streams: StreamSettings = BOTH_ON) =>
    decideNotifications({ totals: { comments: 4, notifications: 5 }, lastSeen, streams });

  it('stores every total when every delivery succeeds', async () => {
    const deliver = vi.fn<(n: Notify) => Promise<void>>().mockResolvedValue(undefined);
    const s = await settle(decide(), lastSeen, deliver);
    expect(deliver.mock.calls.map((c) => c[0])).toEqual([
      { stream: 'comments', count: 3 },
      { stream: 'notifications', count: 5 },
    ]);
    expect(s.nextSeen).toEqual({ comments: 4, notifications: 5 });
    expect(s.error).toBeNull();
    expect(s.delivered).toHaveLength(2);
  });

  it('keeps the old total when a delivery fails, so the next poll sends it again', async () => {
    const deliver = vi.fn().mockRejectedValueOnce(new Error('boom'));
    const s = await settle(decide({ comments: true, notifications: false }), lastSeen, deliver);
    expect(s.nextSeen).toEqual({ comments: 1, notifications: 5 });
    expect(s.error?.message).toBe('boom');
    expect(s.delivered).toEqual([]);
  });

  it('stores a delivered stream but not a failed second one', async () => {
    const deliver = vi
      .fn<(n: Notify) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('503'));
    const s = await settle(decide(), lastSeen, deliver);
    expect(s.nextSeen).toEqual({ comments: 4, notifications: 0 });
    expect(s.delivered).toEqual([{ stream: 'comments', count: 3 }]);
  });

  it('does not try the second delivery after the first fails, and keeps both totals', async () => {
    const deliver = vi.fn().mockRejectedValueOnce(new Error('boom'));
    const s = await settle(decide(), lastSeen, deliver);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(s.nextSeen).toEqual({ comments: 1, notifications: 0 });
  });

  it('still stores the total of a switched-off stream when the other delivery fails', async () => {
    const deliver = vi.fn().mockRejectedValueOnce(new Error('503'));
    const s = await settle(decide({ comments: true, notifications: false }), lastSeen, deliver);
    expect(s.nextSeen).toEqual({ comments: 1, notifications: 5 });
  });

  it('wraps a non-Error rejection', async () => {
    const s = await settle(decide(), lastSeen, () => {
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors -- the point of the test
      return Promise.reject('nope');
    });
    expect(s.error).toBeInstanceOf(Error);
  });
});
