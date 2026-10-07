// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#244: the app reads and writes only Blipfoto's feed_* notification settings — never push_*
// (b-push holds the app's own push-stream choice now) or email_*.

import { describe, it, expect, vi } from 'vitest';
import { HttpError } from '@b-oss/b-api';
import { fetchNotificationSettings, saveNotificationSettings } from '../settings.js';

const setPref = vi.fn<(...a: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
vi.mock('../../platform/prefs.js', () => ({ setPref: (...a: unknown[]) => setPref(...a) }));

const client = {
  getNotificationSettings: vi.fn(),
  updateNotificationSettings: vi.fn().mockResolvedValue({ success: 1 }),
};

vi.mock('../client.js', () => ({
  getClient: () => Promise.resolve(client),
}));

describe('notification settings (feed only)', () => {
  it('asks for the feed group only', async () => {
    client.getNotificationSettings.mockResolvedValue({
      feed: { configured: 1, settings: { feed_friends: 1 } },
    });
    const result = await fetchNotificationSettings();
    expect(client.getNotificationSettings).toHaveBeenCalledWith({ returnFeed: true });
    expect(result).toEqual({ feed: { configured: 1, settings: { feed_friends: 1 } } });
  });

  it('never writes push_* or email_* keys', async () => {
    await saveNotificationSettings({ feed_friends: 0, push_comment: 1, email_comment: 0 });
    expect(client.updateNotificationSettings).toHaveBeenCalledWith({ feed_friends: 0 });
  });

  const server500 = () =>
    new HttpError({
      method: 'PUT',
      url: 'https://api.blipfoto.com/4/user/settings/notifications.json',
      requestBody: 'feed_friends=0',
      status: 500,
      statusText: '',
      responseHeaders: {},
      responseBody: '',
    });

  it('treats a 500 as saved when the read-back holds what was sent (Blipfoto bug, b-oss#245)', async () => {
    setPref.mockClear();
    client.updateNotificationSettings.mockRejectedValueOnce(server500());
    client.getNotificationSettings.mockResolvedValueOnce({
      feed: { configured: 1, settings: { feed_friends: 0, feed_new_award: 1 } },
    });

    await expect(saveNotificationSettings({ feed_friends: 0 })).resolves.toBeUndefined();

    expect(client.getNotificationSettings).toHaveBeenLastCalledWith({ returnFeed: true });
    expect(setPref).not.toHaveBeenCalled();
  });

  it('surfaces the 500 and records it when the read-back does not match', async () => {
    setPref.mockClear();
    const failure = server500();
    client.updateNotificationSettings.mockRejectedValueOnce(failure);
    client.getNotificationSettings.mockResolvedValueOnce({
      feed: { configured: 1, settings: { feed_friends: 1 } },
    });

    await expect(saveNotificationSettings({ feed_friends: 0 })).rejects.toBe(failure);

    const [key, value] = setPref.mock.calls[0] as [string, string];
    expect(key).toBe('b-mobile:last-http-failure');
    expect(JSON.parse(value)).toMatchObject({ status: 500, requestBody: 'feed_friends=0' });
  });

  it('surfaces the 500 when the read-back itself fails', async () => {
    const failure = server500();
    client.updateNotificationSettings.mockRejectedValueOnce(failure);
    client.getNotificationSettings.mockRejectedValueOnce(new Error('offline'));
    await expect(saveNotificationSettings({ feed_friends: 0 })).rejects.toBe(failure);
  });

  it('does not read back for anything but a 5xx (a 4xx or API error is a real failure)', async () => {
    client.getNotificationSettings.mockClear();
    const apiError = new Error('nope');
    client.updateNotificationSettings.mockRejectedValueOnce(apiError);
    await expect(saveNotificationSettings({ feed_friends: 0 })).rejects.toBe(apiError);
    expect(client.getNotificationSettings).not.toHaveBeenCalled();
  });
});
