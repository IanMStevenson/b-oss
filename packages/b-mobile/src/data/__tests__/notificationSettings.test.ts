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

  it('records a failed save (status, request body, what was last read) for diagnosis, then rethrows (b-oss#245)', async () => {
    client.getNotificationSettings.mockResolvedValue({
      feed: { configured: 1, settings: { feed_friends: 1 } },
    });
    await fetchNotificationSettings();
    const failure = new HttpError({
      method: 'PUT',
      url: 'https://api.blipfoto.com/4/user/settings/notifications.json',
      requestBody: 'feed_friends=0',
      status: 500,
      statusText: '',
      responseHeaders: {},
      responseBody: '',
    });
    client.updateNotificationSettings.mockRejectedValueOnce(failure);

    await expect(saveNotificationSettings({ feed_friends: 0 })).rejects.toBe(failure);

    expect(setPref).toHaveBeenCalledTimes(1);
    const [key, value] = setPref.mock.calls[0] as [string, string];
    expect(key).toBe('b-mobile:last-http-failure');
    expect(JSON.parse(value)).toMatchObject({
      status: 500,
      requestBody: 'feed_friends=0',
      context: { lastFeedRead: { configured: 1, settings: { feed_friends: 1 } } },
    });
  });
});
