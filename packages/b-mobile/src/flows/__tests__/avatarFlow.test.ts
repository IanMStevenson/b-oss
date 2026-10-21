// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { refreshAccountAvatar, refreshAccountAvatars } from '../avatarFlow.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import type { StoredAccount } from '../../state/accountsStore.js';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const tokens: Record<string, string | null> = { a1: 'tok-a1', a2: 'tok-a2' };
vi.mock('../../platform/secureStorage.js', () => ({
  getToken: (id: string) => Promise.resolve(tokens[id] ?? null),
}));

const getUserProfile = vi.fn<(token: string, opts: { username: string }) => Promise<unknown>>();
const clientFor = vi.fn((token: string) => ({
  getUserProfile: (opts: { username: string }) => getUserProfile(token, opts),
}));
vi.mock('../../data/client.js', () => ({
  getClientForToken: (token: string) => clientFor(token),
}));

const account = (id: string, avatarUrl: string | null = null): StoredAccount => ({
  id,
  username: id,
  avatarUrl,
  appTokenScope: 'read',
  hasServiceToken: false,
  notificationRegistrationId: null,
  notificationStatus: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  tokens.a1 = 'tok-a1';
  tokens.a2 = 'tok-a2';
  useAccountsStore.setState({ accounts: [account('a1'), account('a2')], activeAccountId: 'a1' });
});

describe('avatarFlow', () => {
  it("fills in every account's picture using that account's own token", async () => {
    getUserProfile.mockImplementation((token: string) =>
      Promise.resolve({ user: { avatar_url: `https://img/${token}.jpg` } }),
    );
    await refreshAccountAvatars();
    const urls = useAccountsStore.getState().accounts.map((a) => a.avatarUrl);
    expect(urls).toEqual(['https://img/tok-a1.jpg', 'https://img/tok-a2.jpg']);
  });

  it('leaves the stored picture alone if the lookup fails or there is no token', async () => {
    useAccountsStore.setState({ accounts: [account('a1', 'old.jpg'), account('a2', 'old2.jpg')] });
    tokens.a2 = null;
    getUserProfile.mockRejectedValue(new Error('offline'));
    await refreshAccountAvatars();
    expect(useAccountsStore.getState().accounts.map((a) => a.avatarUrl)).toEqual([
      'old.jpg',
      'old2.jpg',
    ]);
  });

  it('clears the picture if the user has removed theirs', async () => {
    useAccountsStore.setState({ accounts: [account('a1', 'old.jpg')] });
    getUserProfile.mockResolvedValue({ user: { avatar_url: '' } });
    await refreshAccountAvatar('a1');
    expect(useAccountsStore.getState().accounts[0]?.avatarUrl).toBeNull();
  });
});
