// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, expect, it, vi } from 'vitest';
import { appTokenKey, parseNotifySettings, type NotifyPayload } from '../../shared/notify.js';
import { notificationText } from '../notify-text.js';
import { TapQueue } from '../tap-queue.js';

const tap: NotifyPayload = { kind: 'activity', stream: 'comments', accountId: 'ann' };

describe('TapQueue', () => {
  it('holds a click until the page is listening, then delivers it once', () => {
    const q = new TapQueue();
    const send = vi.fn();
    q.tap(tap, send);
    expect(send).not.toHaveBeenCalled();
    q.ready(send);
    q.ready(send);
    expect(send).toHaveBeenCalledTimes(1);
    q.tap(tap, send);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('holds clicks again after the page reloads', () => {
    const q = new TapQueue(true);
    const send = vi.fn();
    q.reset();
    q.tap(tap, send);
    expect(send).not.toHaveBeenCalled();
  });
});

describe('notificationText', () => {
  it('pluralises counts and never names content', () => {
    expect(notificationText(tap, 1).body).toBe('ann: 1 new comment');
    expect(notificationText({ ...tap, stream: 'notifications' }, 3).body).toBe(
      'ann: 3 new notifications',
    );
  });

  it('asks for a new sign-in on a dead token', () => {
    expect(notificationText({ kind: 'reauth-required', accountId: 'ann' }, 0).body).toMatch(
      /Sign in again/,
    );
  });
});

describe('parseNotifySettings', () => {
  const both = { comments: true, notifications: true };

  it('accepts the exact shape, dropping accounts with every stream off and duplicates', () => {
    expect(
      parseNotifySettings({
        accounts: [
          { accountId: 'ann', streams: both },
          { accountId: 'off', streams: { comments: false, notifications: false } },
          { accountId: 'ann', streams: { comments: true, notifications: false } },
        ],
      }),
    ).toEqual({ accounts: [{ accountId: 'ann', streams: both }] });
  });

  it('rejects anything else from the page', () => {
    for (const bad of [
      null,
      'x',
      {},
      { accounts: 'x' },
      { accounts: [null] },
      { accounts: [{ accountId: '', streams: both }] },
      { accounts: [{ accountId: 'a'.repeat(200), streams: both }] },
      { accounts: [{ accountId: 'ann', streams: { comments: 1, notifications: true } }] },
      { accounts: [{ accountId: 'ann' }] },
      { accounts: Array.from({ length: 40 }, (_, i) => ({ accountId: `a${i}`, streams: both })) },
    ]) {
      expect(() => parseNotifySettings(bad)).toThrow(TypeError);
    }
  });

  it('keys the token the way the web app stores it', () => {
    expect(appTokenKey('ann')).toBe('token:ann:app');
  });
});
