// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#244: the app reads and writes only Blipfoto's feed_* notification settings — never push_*
// (b-push holds the app's own push-stream choice now) or email_*.

import { describe, it, expect, vi } from 'vitest';
import { fetchNotificationSettings, saveNotificationSettings } from '../settings.js';

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
});
