// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Unit tests for the account token-lifecycle rules (auth.md) — this is the density §19 asks
// for, since these are the rules most likely to be got subtly wrong. Mocks every platform/data
// boundary so this runs as pure logic, no jsdom/native runtime needed.

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const tokenStore = new Map<string, string>();

vi.mock('../../platform/secureStorage.js', () => ({
  getToken: vi.fn((accountId: string, purpose: string) =>
    Promise.resolve(tokenStore.get(`${accountId}:${purpose}`) ?? null),
  ),
  setToken: vi.fn((accountId: string, purpose: string, token: string) => {
    tokenStore.set(`${accountId}:${purpose}`, token);
    return Promise.resolve();
  }),
  deleteToken: vi.fn((accountId: string, purpose: string) => {
    tokenStore.delete(`${accountId}:${purpose}`);
    return Promise.resolve();
  }),
}));

const revokeToken = vi.fn().mockResolvedValue({ success: 1 });
vi.mock('../../data/client.js', () => ({
  getClientForToken: vi.fn(() => ({ revokeToken })),
}));

const runOAuthRound = vi.fn();
vi.mock('../oauthRound.js', async () => {
  const actual = await vi.importActual<typeof import('../oauthRound.js')>('../oauthRound.js');
  return { ...actual, runOAuthRound };
});

// pushFlow.ts has its own dedicated tests (pushFlow.test.ts) — mocked at this boundary here so
// accountsFlow's own token-lifecycle logic (this file's actual subject) doesn't also have to
// stand up platform/push.js, platform/secureStorage.js's registration-secret calls, and
// data/pushService.ts's network layer. Defaults to "permission granted, registration succeeds" —
// individual tests override where the refusal/failure path itself is what's under test.
const ensurePushPermission = vi
  .fn<(...args: unknown[]) => Promise<boolean>>()
  .mockResolvedValue(true);
const registerAccountForPush = vi
  .fn<(...args: unknown[]) => Promise<boolean>>()
  .mockResolvedValue(true);
const deregisterAccountFromPush = vi
  .fn<(...args: unknown[]) => Promise<void>>()
  .mockResolvedValue(undefined);
vi.mock('../pushFlow.js', () => ({
  ensurePushPermission: (...args: unknown[]) => ensurePushPermission(...args),
  registerAccountForPush: (...args: unknown[]) => registerAccountForPush(...args),
  deregisterAccountFromPush: (...args: unknown[]) => deregisterAccountFromPush(...args),
}));

const { useAccountsStore } = await import('../../state/accountsStore.js');
const { getToken } = await import('../../platform/secureStorage.js');
const {
  signInGated,
  signInDeliberate,
  switchAccount,
  removeAccount,
  changeAccountMode,
  handleForcedLogout,
  NeedsReauthError,
} = await import('../accountsFlow.js');

function resetStore() {
  tokenStore.clear();
  useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
  vi.clearAllMocks();
}

beforeEach(resetStore);

describe('signInGated (FLW-01)', () => {
  it('always signs in read-write, notifications off, and makes the account active', async () => {
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-rw',
      grantedScope: 'read,write',
      username: 'alice',
    });
    const id = await signInGated();
    expect(runOAuthRound).toHaveBeenCalledWith('read,write');
    expect(id).toBe('alice');
    const account = useAccountsStore.getState().accounts.find((a) => a.id === 'alice');
    expect(account?.appTokenScope).toBe('read,write');
    expect(account?.hasServiceToken).toBe(false);
    expect(useAccountsStore.getState().activeAccountId).toBe('alice');
  });
});

describe('signInDeliberate (FLW-20)', () => {
  it('read-only + notifications: reuses the single token for both purposes, no second round', async () => {
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-r',
      grantedScope: 'read',
      username: 'bob',
    });
    await signInDeliberate({ scope: 'read', notifications: true });
    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    expect(await getToken('bob', 'app')).toBe('tok-r');
    expect(await getToken('bob', 'service')).toBe('tok-r');
    expect(useAccountsStore.getState().accounts[0]?.hasServiceToken).toBe(true);
  });

  it('read-write + notifications: runs two distinct, separately visible rounds', async () => {
    runOAuthRound
      .mockResolvedValueOnce({
        accessToken: 'tok-rw',
        grantedScope: 'read,write',
        username: 'carol',
      })
      .mockResolvedValueOnce({
        accessToken: 'tok-r-service',
        grantedScope: 'read',
        username: 'carol',
      });
    await signInDeliberate({ scope: 'read,write', notifications: true });
    expect(runOAuthRound).toHaveBeenNthCalledWith(1, 'read,write');
    expect(runOAuthRound).toHaveBeenNthCalledWith(2, 'read');
    expect(await getToken('carol', 'app')).toBe('tok-rw');
    expect(await getToken('carol', 'service')).toBe('tok-r-service');
  });

  it('a failed/cancelled second round keeps the first token — signed in read-write, no notifications', async () => {
    const { OAuthCancelledError } = await import('../oauthRound.js');
    runOAuthRound
      .mockResolvedValueOnce({
        accessToken: 'tok-rw',
        grantedScope: 'read,write',
        username: 'dave',
      })
      .mockRejectedValueOnce(new OAuthCancelledError('declined'));
    const id = await signInDeliberate({ scope: 'read,write', notifications: true });
    expect(id).toBe('dave');
    const account = useAccountsStore.getState().accounts.find((a) => a.id === 'dave');
    expect(account?.appTokenScope).toBe('read,write');
    expect(account?.hasServiceToken).toBe(false);
  });
});

describe('switchAccount (FLW-21)', () => {
  it('is instant, local, and makes no OAuth call', () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'a',
          username: 'a',
          avatarUrl: null,
          appTokenScope: 'read,write',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
        {
          id: 'b',
          username: 'b',
          avatarUrl: null,
          appTokenScope: 'read',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'a',
      hydrated: true,
    });
    switchAccount('b');
    expect(useAccountsStore.getState().activeAccountId).toBe('b');
    expect(runOAuthRound).not.toHaveBeenCalled();
  });

  it('offers re-authorization instead of switching to a needs-reauth account', () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'a',
          username: 'a',
          avatarUrl: null,
          appTokenScope: null,
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: null,
      hydrated: true,
    });
    expect(() => switchAccount('a')).toThrow(NeedsReauthError);
  });
});

describe('removeAccount (FLW-22)', () => {
  it('revokes every token the account holds and forgets it', async () => {
    tokenStore.set('alice:app', 'tok-app');
    tokenStore.set('alice:service', 'tok-service');
    useAccountsStore.setState({
      accounts: [
        {
          id: 'alice',
          username: 'alice',
          avatarUrl: null,
          appTokenScope: 'read,write',
          hasServiceToken: true,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    await removeAccount('alice');
    expect(revokeToken).toHaveBeenCalledTimes(2);
    expect(tokenStore.has('alice:app')).toBe(false);
    expect(tokenStore.has('alice:service')).toBe(false);
    expect(useAccountsStore.getState().accounts).toHaveLength(0);
    expect(useAccountsStore.getState().activeAccountId).toBeNull();
  });

  it('switches the active account to another stored one when the removed account was active', async () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'a',
          username: 'a',
          avatarUrl: null,
          appTokenScope: 'read',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
        {
          id: 'b',
          username: 'b',
          avatarUrl: null,
          appTokenScope: 'read',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'a',
      hydrated: true,
    });
    await removeAccount('a');
    expect(useAccountsStore.getState().activeAccountId).toBe('b');
  });
});

describe('changeAccountMode (FLW-22)', () => {
  it('a transition needing a token not currently held runs a fresh authorization', async () => {
    tokenStore.set('alice:app', 'old-read-token');
    useAccountsStore.setState({
      accounts: [
        {
          id: 'alice',
          username: 'alice',
          avatarUrl: null,
          appTokenScope: 'read',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'new-write-token',
      grantedScope: 'read,write',
      username: 'alice',
    });

    await changeAccountMode('alice', { scope: 'read,write', notifications: false });

    expect(runOAuthRound).toHaveBeenCalledWith('read,write');
    // The superseded token is revoked, never left dangling.
    expect(revokeToken).toHaveBeenCalledTimes(1);
    expect(await getToken('alice', 'app')).toBe('new-write-token');
    expect(useAccountsStore.getState().accounts[0]?.appTokenScope).toBe('read,write');
  });

  it('a transition to the same scope with no token change makes no OAuth call', async () => {
    tokenStore.set('alice:app', 'existing-token');
    useAccountsStore.setState({
      accounts: [
        {
          id: 'alice',
          username: 'alice',
          avatarUrl: null,
          appTokenScope: 'read,write',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    await changeAccountMode('alice', { scope: 'read,write', notifications: false });
    expect(runOAuthRound).not.toHaveBeenCalled();
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it('turning notifications off in read-write mode revokes the separate service token', async () => {
    tokenStore.set('alice:app', 'write-token');
    tokenStore.set('alice:service', 'separate-read-token');
    useAccountsStore.setState({
      accounts: [
        {
          id: 'alice',
          username: 'alice',
          avatarUrl: null,
          appTokenScope: 'read,write',
          hasServiceToken: true,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    await changeAccountMode('alice', { scope: 'read,write', notifications: false });
    expect(revokeToken).toHaveBeenCalledTimes(1);
    expect(tokenStore.has('alice:service')).toBe(false);
    expect(useAccountsStore.getState().accounts[0]?.hasServiceToken).toBe(false);
  });

  it('turning notifications off in read-only mode does not revoke the shared app token', async () => {
    tokenStore.set('alice:app', 'shared-read-token');
    tokenStore.set('alice:service', 'shared-read-token');
    useAccountsStore.setState({
      accounts: [
        {
          id: 'alice',
          username: 'alice',
          avatarUrl: null,
          appTokenScope: 'read',
          hasServiceToken: true,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    await changeAccountMode('alice', { scope: 'read', notifications: false });
    expect(revokeToken).not.toHaveBeenCalled();
    expect(await getToken('alice', 'app')).toBe('shared-read-token');
    expect(tokenStore.has('alice:service')).toBe(false);
  });

  it('read-only -> read-only+notifications is free: no new authorization', async () => {
    tokenStore.set('alice:app', 'read-token');
    useAccountsStore.setState({
      accounts: [
        {
          id: 'alice',
          username: 'alice',
          avatarUrl: null,
          appTokenScope: 'read',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    await changeAccountMode('alice', { scope: 'read', notifications: true });
    expect(runOAuthRound).not.toHaveBeenCalled();
    expect(await getToken('alice', 'service')).toBe('read-token');
    expect(useAccountsStore.getState().accounts[0]?.hasServiceToken).toBe(true);
  });
});

describe('handleForcedLogout (FLW-02)', () => {
  it('clears only the specific token that failed, keeping the other', () => {
    tokenStore.set('alice:app', 'write-token');
    tokenStore.set('alice:service', 'service-token');
    useAccountsStore.setState({
      accounts: [
        {
          id: 'alice',
          username: 'alice',
          avatarUrl: null,
          appTokenScope: 'read,write',
          hasServiceToken: true,
          notificationRegistrationId: null,
          notificationStatus: 'active',
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    handleForcedLogout('alice', 'service');
    const account = useAccountsStore.getState().accounts[0];
    expect(account?.appTokenScope).toBe('read,write');
    expect(account?.hasServiceToken).toBe(false);
    expect(account?.notificationStatus).toBe('read-token-invalid');
    // The active account isn't disturbed — it still has a usable (write) token.
    expect(useAccountsStore.getState().activeAccountId).toBe('alice');
  });

  it('switches the active account when the failing token was its only usable one', () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'alice',
          username: 'alice',
          avatarUrl: null,
          appTokenScope: 'read',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
        {
          id: 'bob',
          username: 'bob',
          avatarUrl: null,
          appTokenScope: 'read',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    handleForcedLogout('alice', 'app');
    expect(
      useAccountsStore.getState().accounts.find((a) => a.id === 'alice')?.appTokenScope,
    ).toBeNull();
    expect(useAccountsStore.getState().activeAccountId).toBe('bob');
  });

  it('does not remove the account from the stored list — it moves to needs-reauth', () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'alice',
          username: 'alice',
          avatarUrl: null,
          appTokenScope: 'read,write',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    handleForcedLogout('alice', 'app');
    expect(useAccountsStore.getState().accounts).toHaveLength(1);
  });
});
