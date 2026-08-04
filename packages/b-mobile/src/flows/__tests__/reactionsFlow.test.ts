// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-06/08/11's error-code interpretation is the part most likely to be got subtly wrong (§19) —
// 221/222 must resolve as success, 223 must surface as the quota-specific error type. Runs as
// pure logic against a fake client, no jsdom/network needed.

import { describe, it, expect, vi } from 'vitest';
import { BlipfotoError } from '@b-oss/b-api';
import {
  starEntry,
  favoriteEntry,
  followUser,
  unfollowUser,
  FavoriteQuotaError,
} from '../reactionsFlow.js';

const client = {
  starEntry: vi.fn(),
  favoriteEntry: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
};

vi.mock('../../data/client.js', () => ({
  getClient: () => Promise.resolve(client),
}));

describe('starEntry', () => {
  it('resolves normally on success', async () => {
    client.starEntry.mockResolvedValue({ success: 1 });
    await expect(starEntry('1')).resolves.toBeUndefined();
  });

  it('treats "already starred" (221) as success, not a failure', async () => {
    client.starEntry.mockRejectedValue(new BlipfotoError(221, 'Already starred'));
    await expect(starEntry('1')).resolves.toBeUndefined();
  });

  it('rethrows any other error', async () => {
    client.starEntry.mockRejectedValue(new BlipfotoError(500, 'Server error'));
    await expect(starEntry('1')).rejects.toThrow('Server error');
  });
});

describe('favoriteEntry', () => {
  it('treats "already favourited" (222) as success', async () => {
    client.favoriteEntry.mockRejectedValue(new BlipfotoError(222, 'Already favourited'));
    await expect(favoriteEntry('1')).resolves.toBeUndefined();
  });

  it('surfaces the daily quota (223) as FavoriteQuotaError', async () => {
    client.favoriteEntry.mockRejectedValue(new BlipfotoError(223, 'Quota reached'));
    await expect(favoriteEntry('1')).rejects.toBeInstanceOf(FavoriteQuotaError);
  });

  it('rethrows any other error unchanged', async () => {
    client.favoriteEntry.mockRejectedValue(new BlipfotoError(500, 'Server error'));
    await expect(favoriteEntry('1')).rejects.not.toBeInstanceOf(FavoriteQuotaError);
  });
});

describe('followUser / unfollowUser', () => {
  it('returns the resulting friendship state', async () => {
    client.follow.mockResolvedValue({
      friendships: [
        { source: 'me', target: 'alice', state: 1, actions: { follow: 0, unfollow: 1 } },
      ],
    });
    const result = await followUser('alice');
    expect(result.state).toBe(1);
    expect(client.follow).toHaveBeenCalledWith(['alice']);
  });

  it('throws if the server returns no friendship', async () => {
    client.follow.mockResolvedValue({ friendships: [] });
    await expect(followUser('alice')).rejects.toThrow();
  });

  it('unfollow calls the client with the target username', async () => {
    client.unfollow.mockResolvedValue({
      friendships: [
        { source: 'me', target: 'alice', state: 0, actions: { follow: 1, unfollow: 0 } },
      ],
    });
    await unfollowUser('alice');
    expect(client.unfollow).toHaveBeenCalledWith(['alice']);
  });
});
