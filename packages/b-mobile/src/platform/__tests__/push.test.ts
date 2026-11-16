// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';

const getDeliveredNotifications = vi.fn<() => Promise<unknown>>();
const removeDeliveredNotifications = vi.fn<(a: unknown) => Promise<void>>();
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    getDeliveredNotifications: () => getDeliveredNotifications(),
    removeDeliveredNotifications: (a: unknown) => removeDeliveredNotifications(a),
  },
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => 'android' },
  registerPlugin: () => ({}),
}));
vi.mock('../platformKind.js', () => ({ isCapacitorNative: () => true }));

const { clearDeliveredPushes } = await import('../push.js');

beforeEach(() => vi.clearAllMocks());

describe('clearDeliveredPushes', () => {
  it("removes only that account's stream", async () => {
    const mine = { id: 1, tag: 'a1:comments' };
    getDeliveredNotifications.mockResolvedValue({
      notifications: [
        mine,
        { id: 2, tag: 'a1:notifications' },
        { id: 3, tag: 'a2:comments' },
        { id: 4 },
      ],
    });
    await clearDeliveredPushes('a1', 'comments');
    expect(removeDeliveredNotifications).toHaveBeenCalledWith({ notifications: [mine] });
  });

  it('removes nothing when none match, and swallows plugin errors', async () => {
    getDeliveredNotifications.mockResolvedValue({ notifications: [{ id: 2, tag: 'x:comments' }] });
    await clearDeliveredPushes('a1', 'comments');
    expect(removeDeliveredNotifications).not.toHaveBeenCalled();
    getDeliveredNotifications.mockRejectedValue(new Error('boom'));
    await expect(clearDeliveredPushes('a1', 'comments')).resolves.toBeUndefined();
  });
});
