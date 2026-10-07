// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Unit tests for the account token-lifecycle rules (auth.md) — this is the density §19 asks
// for, since these are the rules most likely to be got subtly wrong. Mocks every platform/data
// boundary so this runs as pure logic, no jsdom/native runtime needed.

import type { StoredAccount } from '../../state/accountsStore.js';
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
// Which tokens were revoked, in order (b-oss#240's tests care which one, not just how many).
const revokedTokens: string[] = [];
// recoverNotifications' app-token check (b-oss#261): resolves when the token is alive, rejects with
// a BlipfotoError 51 when a test says it's dead.
const verifyAppToken = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const appTokenRejectedHandlers: ((accountId: string) => void)[] = [];
vi.mock('../../data/client.js', () => ({
  getClientForAccount: vi.fn(() => Promise.resolve({ verifyToken: verifyAppToken })),
  setAppTokenRejectedHandler: (handler: (accountId: string) => void) => {
    appTokenRejectedHandlers.push(handler);
  },
  getClientForToken: vi.fn((token: string) => ({
    revokeToken: () => {
      revokedTokens.push(token);
      return revokeToken() as Promise<unknown>;
    },
  })),
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

// Off-native by default (a desktop/CI run); the b-oss#240 browser-default tests flip it.
let isNative = false;
vi.mock('../../platform/appState.js', () => ({ isNativePlatform: () => isNative }));

const { useAccountsStore } = await import('../../state/accountsStore.js');
const { getToken } = await import('../../platform/secureStorage.js');
const { AccountMismatchError } = await import('../accountMismatch.js');
const {
  signInGated,
  signInDeliberate,
  switchAccount,
  removeAccount,
  changeAccountMode,
  clearServiceToken,
  handleForcedLogout,
  recoverNotifications,
  reauthorizeAccount,
  NeedsReauthError,
  OAuthCancelledError,
} = await import('../accountsFlow.js');
const { BlipfotoError } = await import('@b-oss/b-api');

function resetStore() {
  tokenStore.clear();
  revokedTokens.length = 0;
  isNative = false;
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
    expect(runOAuthRound).toHaveBeenNthCalledWith(1, 'read,write', { useEmbedded: undefined });
    expect(runOAuthRound).toHaveBeenNthCalledWith(2, 'read', { useEmbedded: undefined });
    expect(await getToken('carol', 'app')).toBe('tok-rw');
    expect(await getToken('carol', 'service')).toBe('tok-r-service');
  });

  it('beforeServiceRound: false skips the second round — signed in read-write without notifications', async () => {
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-rw',
      grantedScope: 'read,write',
      username: 'erin',
    });
    const beforeServiceRound = vi.fn().mockResolvedValue(false);
    await signInDeliberate({ scope: 'read,write', notifications: true }, { beforeServiceRound });
    expect(beforeServiceRound).toHaveBeenCalledTimes(1);
    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    expect(await getToken('erin', 'app')).toBe('tok-rw');
    expect(await getToken('erin', 'service')).toBeNull();
  });

  it('beforeServiceRound: true proceeds with the second round as before', async () => {
    runOAuthRound
      .mockResolvedValueOnce({ accessToken: 'tok-rw', grantedScope: 'read,write', username: 'fay' })
      .mockResolvedValueOnce({ accessToken: 'tok-svc', grantedScope: 'read', username: 'fay' });
    await signInDeliberate(
      { scope: 'read,write', notifications: true },
      { beforeServiceRound: () => Promise.resolve(true) },
    );
    expect(runOAuthRound).toHaveBeenCalledTimes(2);
    expect(await getToken('fay', 'service')).toBe('tok-svc');
  });

  it('beforeServiceRound is not consulted for read-only (no second round exists to explain)', async () => {
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-r',
      grantedScope: 'read',
      username: 'gus',
    });
    const beforeServiceRound = vi.fn().mockResolvedValue(true);
    await signInDeliberate({ scope: 'read', notifications: true }, { beforeServiceRound });
    expect(beforeServiceRound).not.toHaveBeenCalled();
  });

  it('useEmbedded: true runs every round (including the notifications one) through the embedded browser', async () => {
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
    await signInDeliberate({ scope: 'read,write', notifications: true, useEmbedded: true });
    expect(runOAuthRound).toHaveBeenNthCalledWith(1, 'read,write', { useEmbedded: true });
    expect(runOAuthRound).toHaveBeenNthCalledWith(2, 'read', { useEmbedded: true });
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

    expect(runOAuthRound).toHaveBeenCalledWith('read,write', { useEmbedded: false });
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

  it('clearServiceToken (the OS-permission-withdrawn path) leaves no notifications state behind (b-oss#251)', async () => {
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
          notificationRegistrationId: 'reg-1',
          notificationStatus: 'active',
          pushComments: true,
          pushNotifications: true,
        },
      ],
      activeAccountId: 'alice',
      hydrated: true,
    });
    await clearServiceToken('alice', 'read,write');
    const account = useAccountsStore.getState().accounts[0];
    expect(revokeToken).toHaveBeenCalledTimes(1);
    expect(tokenStore.has('alice:service')).toBe(false);
    expect(tokenStore.get('alice:app')).toBe('write-token');
    expect(account?.hasServiceToken).toBe(false);
    // The registration-specific fields are deregisterAccountFromPush's job (mocked here).
    expect(deregisterAccountFromPush).toHaveBeenCalledWith('alice');
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

describe('changeAccountMode push streams (b-oss#244)', () => {
  function rwAccount(overrides: Record<string, unknown> = {}) {
    return {
      id: 'alice',
      username: 'alice',
      avatarUrl: null,
      appTokenScope: 'read,write' as const,
      hasServiceToken: false,
      notificationRegistrationId: null,
      notificationStatus: null,
      ...overrides,
    };
  }

  beforeEach(() => resetStore());

  it('registers with the streams the caller chose', async () => {
    tokenStore.set('alice:app', 'write-token');
    useAccountsStore.setState({ accounts: [rwAccount()], activeAccountId: 'alice' });
    runOAuthRound.mockResolvedValue({
      accessToken: 'read-token',
      grantedScope: 'read',
      username: 'alice',
    });
    await changeAccountMode('alice', {
      scope: 'read,write',
      notifications: true,
      pushStreams: { comments: false, notifications: true },
    });
    expect(registerAccountForPush).toHaveBeenCalledWith('alice', 'read-token', {
      comments: false,
      notifications: true,
    });
  });

  it('without a choice, re-registers with the stored streams (Sign in again)', async () => {
    tokenStore.set('alice:app', 'write-token');
    useAccountsStore.setState({
      accounts: [
        rwAccount({
          notificationStatus: 'read-token-invalid',
          pushComments: true,
          pushNotifications: false,
        }),
      ],
      activeAccountId: 'alice',
    });
    runOAuthRound.mockResolvedValue({
      accessToken: 'read-token',
      grantedScope: 'read',
      username: 'alice',
    });
    await changeAccountMode('alice', { scope: 'read,write', notifications: true });
    expect(registerAccountForPush).toHaveBeenCalledWith('alice', 'read-token', {
      comments: true,
      notifications: false,
    });
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

describe('owner check on every round for an existing account (b-oss#240)', () => {
  type Scope = 'read' | 'read,write';
  function stored(
    id: string,
    scope: Scope | null = 'read,write',
    extra: Record<string, unknown> = {},
  ) {
    return {
      id,
      username: id,
      avatarUrl: null,
      appTokenScope: scope,
      hasServiceToken: false,
      notificationRegistrationId: null,
      notificationStatus: null,
      ...extra,
    };
  }

  it('sign-in: a service round for someone else is revoked, nothing stored, and rethrown', async () => {
    runOAuthRound
      .mockResolvedValueOnce({
        accessToken: 'tok-rw',
        grantedScope: 'read,write',
        username: 'carol',
      })
      .mockResolvedValueOnce({
        accessToken: 'tok-mallory',
        grantedScope: 'read',
        username: 'mallory',
      });

    const err = await signInDeliberate({ scope: 'read,write', notifications: true }).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(AccountMismatchError);
    expect(err).toMatchObject({ expected: 'carol', actual: 'mallory', inApp: false });
    expect(revokedTokens).toEqual(['tok-mallory']);
    expect(registerAccountForPush).not.toHaveBeenCalled();
    expect(await getToken('carol', 'service')).toBeNull();
    // The first round stands: signed in read-write, just without notifications.
    expect(await getToken('carol', 'app')).toBe('tok-rw');
    expect(useAccountsStore.getState().activeAccountId).toBe('carol');
    expect(useAccountsStore.getState().accounts[0]?.hasServiceToken).toBe(false);
  });

  it('sign-in: the right owner (any case) registers as normal', async () => {
    runOAuthRound
      .mockResolvedValueOnce({
        accessToken: 'tok-rw',
        grantedScope: 'read,write',
        username: 'carol',
      })
      .mockResolvedValueOnce({ accessToken: 'tok-svc', grantedScope: 'read', username: 'Carol' });

    await signInDeliberate({ scope: 'read,write', notifications: true });

    expect(revokeToken).not.toHaveBeenCalled();
    expect(await getToken('carol', 'service')).toBe('tok-svc');
  });

  it('a mismatch in the in-app browser says so (inApp)', async () => {
    runOAuthRound
      .mockResolvedValueOnce({
        accessToken: 'tok-rw',
        grantedScope: 'read,write',
        username: 'carol',
      })
      .mockResolvedValueOnce({ accessToken: 'tok-m', grantedScope: 'read', username: 'mallory' });
    const err = await signInDeliberate({
      scope: 'read,write',
      notifications: true,
      useEmbedded: true,
    }).catch((e: unknown) => e);
    expect(err).toMatchObject({ inApp: true });
  });

  it('enable path: a service round for someone else stores nothing and registers nothing', async () => {
    tokenStore.set('alice:app', 'write-token');
    useAccountsStore.setState({ accounts: [stored('alice')], activeAccountId: 'alice' });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-bob',
      grantedScope: 'read',
      username: 'bob',
    });

    await expect(
      changeAccountMode('alice', { scope: 'read,write', notifications: true }),
    ).rejects.toBeInstanceOf(AccountMismatchError);

    expect(revokedTokens).toEqual(['tok-bob']);
    expect(registerAccountForPush).not.toHaveBeenCalled();
    expect(await getToken('alice', 'service')).toBeNull();
    expect(useAccountsStore.getState().accounts[0]?.hasServiceToken).toBe(false);
  });

  it('scope change: a round for someone else leaves the account and its old token untouched', async () => {
    tokenStore.set('alice:app', 'old-read-token');
    useAccountsStore.setState({ accounts: [stored('alice', 'read')], activeAccountId: 'alice' });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-bob',
      grantedScope: 'read,write',
      username: 'bob',
    });

    await expect(
      changeAccountMode('alice', { scope: 'read,write', notifications: false }),
    ).rejects.toBeInstanceOf(AccountMismatchError);

    expect(revokedTokens).toEqual(['tok-bob']); // the new one only — never the old one
    expect(await getToken('alice', 'app')).toBe('old-read-token');
    expect(useAccountsStore.getState().accounts[0]?.appTokenScope).toBe('read');
  });

  it('re-authorizing a needs-reauth account is owner-checked too', async () => {
    useAccountsStore.setState({ accounts: [stored('alice', null)], activeAccountId: null });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-bob',
      grantedScope: 'read,write',
      username: 'bob',
    });
    await expect(
      changeAccountMode('alice', { scope: 'read,write', notifications: false }),
    ).rejects.toBeInstanceOf(AccountMismatchError);
    expect(await getToken('alice', 'app')).toBeNull();
    expect(useAccountsStore.getState().accounts[0]?.appTokenScope).toBeNull();
  });

  it('never revokes a wrong-owner token that another account here already holds', async () => {
    tokenStore.set('alice:app', 'write-token');
    tokenStore.set('bob:service', 'bobs-read-token');
    useAccountsStore.setState({
      accounts: [stored('alice'), stored('bob', 'read,write', { hasServiceToken: true })],
      activeAccountId: 'alice',
    });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'bobs-read-token',
      grantedScope: 'read',
      username: 'bob',
    });
    await expect(
      changeAccountMode('alice', { scope: 'read,write', notifications: true }),
    ).rejects.toBeInstanceOf(AccountMismatchError);
    expect(revokeToken).not.toHaveBeenCalled();
    expect(await getToken('bob', 'service')).toBe('bobs-read-token');
  });

  it("the service's own 403 (pushFlow's AccountMismatchError) revokes the separate read token", async () => {
    tokenStore.set('alice:app', 'write-token');
    useAccountsStore.setState({ accounts: [stored('alice')], activeAccountId: 'alice' });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-svc',
      grantedScope: 'read',
      username: 'alice',
    });
    registerAccountForPush.mockRejectedValueOnce(new AccountMismatchError('alice', null));

    await expect(
      changeAccountMode('alice', { scope: 'read,write', notifications: true }),
    ).rejects.toMatchObject({ expected: 'alice', actual: null });
    expect(revokedTokens).toEqual(['tok-svc']);
    expect(await getToken('alice', 'service')).toBeNull();
  });

  it("the service's 403 on a read-only account never revokes its app token", async () => {
    tokenStore.set('alice:app', 'read-token');
    useAccountsStore.setState({ accounts: [stored('alice', 'read')], activeAccountId: 'alice' });
    registerAccountForPush.mockRejectedValueOnce(new AccountMismatchError('alice', null));
    await expect(
      changeAccountMode('alice', { scope: 'read', notifications: true }),
    ).rejects.toBeInstanceOf(AccountMismatchError);
    expect(revokeToken).not.toHaveBeenCalled();
    expect(await getToken('alice', 'app')).toBe('read-token');
  });
});

describe('token-change browser default (b-oss#240)', () => {
  function rw(id: string) {
    return {
      id,
      username: id,
      avatarUrl: null,
      appTokenScope: 'read,write' as const,
      hasServiceToken: false,
      notificationRegistrationId: null,
      notificationStatus: null,
    };
  }
  beforeEach(() => {
    tokenStore.set('alice:app', 'write-token');
    runOAuthRound.mockResolvedValue({ accessToken: 'r', grantedScope: 'read', username: 'alice' });
  });

  it('more than one account on native: the clean in-app browser', async () => {
    isNative = true;
    useAccountsStore.setState({ accounts: [rw('alice'), rw('bob')], activeAccountId: 'alice' });
    await changeAccountMode('alice', { scope: 'read,write', notifications: true });
    expect(runOAuthRound).toHaveBeenCalledWith('read', { useEmbedded: true });
  });

  it('exactly one account on native: the system browser', async () => {
    isNative = true;
    useAccountsStore.setState({ accounts: [rw('alice')], activeAccountId: 'alice' });
    await changeAccountMode('alice', { scope: 'read,write', notifications: true });
    expect(runOAuthRound).toHaveBeenCalledWith('read', { useEmbedded: false });
  });

  it("off native there's no in-app browser, whatever the count", async () => {
    useAccountsStore.setState({ accounts: [rw('alice'), rw('bob')], activeAccountId: 'alice' });
    await changeAccountMode('alice', { scope: 'read,write', notifications: true });
    expect(runOAuthRound).toHaveBeenCalledWith('read', { useEmbedded: false });
  });

  it("the caller's explicit choice wins (the mismatch retry)", async () => {
    isNative = true;
    useAccountsStore.setState({ accounts: [rw('alice')], activeAccountId: 'alice' });
    await changeAccountMode('alice', {
      scope: 'read,write',
      notifications: true,
      useEmbedded: true,
    });
    expect(runOAuthRound).toHaveBeenCalledWith('read', { useEmbedded: true });
  });

  it('beforeServiceRound: false skips the read-only round and registers nothing', async () => {
    useAccountsStore.setState({ accounts: [rw('alice')], activeAccountId: 'alice' });
    const beforeServiceRound = vi.fn().mockResolvedValue(false);
    await changeAccountMode(
      'alice',
      { scope: 'read,write', notifications: true },
      { beforeServiceRound },
    );
    expect(beforeServiceRound).toHaveBeenCalledTimes(1);
    expect(runOAuthRound).not.toHaveBeenCalled();
    expect(registerAccountForPush).not.toHaveBeenCalled();
  });

  it('beforeServiceRound: true proceeds', async () => {
    useAccountsStore.setState({ accounts: [rw('alice')], activeAccountId: 'alice' });
    await changeAccountMode(
      'alice',
      { scope: 'read,write', notifications: true },
      { beforeServiceRound: () => Promise.resolve(true) },
    );
    expect(registerAccountForPush).toHaveBeenCalledTimes(1);
  });
});

// Tokens go straight into the secure-storage fake; accounts are the StoredAccount shape.
function seedToken(accountId: string, purpose: 'app' | 'service', token: string): void {
  tokenStore.set(`${accountId}:${purpose}`, token);
}
function account(overrides: Partial<StoredAccount> = {}): StoredAccount {
  return {
    id: 'alice',
    username: 'alice',
    avatarUrl: null,
    appTokenScope: 'read,write',
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
    ...overrides,
  };
}

describe('dead app token (FLW-02, b-oss#261)', () => {
  it("registers handleForcedLogout as the client layer's app-token-rejected handler", () => {
    useAccountsStore.setState({
      accounts: [account({ id: 'alice', username: 'alice', appTokenScope: 'read,write' })],
      activeAccountId: 'alice',
    });
    seedToken('alice', 'app', 'tok-dead');
    expect(appTokenRejectedHandlers).toHaveLength(1);
    appTokenRejectedHandlers[0]('alice');
    expect(useAccountsStore.getState().accounts[0].appTokenScope).toBeNull();
  });
});

describe('recoverNotifications (FLW-02, b-oss#261)', () => {
  function deadServiceAccount(overrides: Partial<StoredAccount> = {}) {
    return account({
      id: 'alice',
      username: 'alice',
      appTokenScope: 'read,write',
      hasServiceToken: false,
      notificationStatus: 'read-token-invalid',
      ...overrides,
    });
  }

  it('app token still alive: renews only the service token (one sign-in)', async () => {
    useAccountsStore.setState({ accounts: [deadServiceAccount()], activeAccountId: 'alice' });
    seedToken('alice', 'app', 'tok-app');
    verifyAppToken.mockResolvedValue({ username: 'alice', scope: 'read,write' });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-svc',
      grantedScope: 'read',
      username: 'alice',
    });

    await recoverNotifications('alice');

    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    expect(runOAuthRound).toHaveBeenCalledWith('read', expect.anything());
    expect(useAccountsStore.getState().accounts[0].appTokenScope).toBe('read,write');
  });

  it('app token dead too (b-mobile revoked on blipfoto.com): re-authorizes the account, then the service', async () => {
    useAccountsStore.setState({ accounts: [deadServiceAccount()], activeAccountId: 'alice' });
    seedToken('alice', 'app', 'tok-dead');
    verifyAppToken.mockRejectedValue(new BlipfotoError(51, 'Invalid token'));
    runOAuthRound
      .mockResolvedValueOnce({
        accessToken: 'tok-app2',
        grantedScope: 'read,write',
        username: 'alice',
      })
      .mockResolvedValueOnce({ accessToken: 'tok-svc2', grantedScope: 'read', username: 'alice' });

    await recoverNotifications('alice');

    expect(runOAuthRound).toHaveBeenNthCalledWith(1, 'read,write', expect.anything());
    expect(runOAuthRound).toHaveBeenNthCalledWith(2, 'read', expect.anything());
    expect(await getToken('alice', 'app')).toBe('tok-app2');
    expect(await getToken('alice', 'service')).toBe('tok-svc2');
    expect(useAccountsStore.getState().accounts[0]).toMatchObject({
      appTokenScope: 'read,write',
      hasServiceToken: true,
    });
  });

  it('read-only account with a dead token: one sign-in, reused as the service token (b-oss#250)', async () => {
    useAccountsStore.setState({
      accounts: [deadServiceAccount({ appTokenScope: 'read' })],
      activeAccountId: 'alice',
    });
    seedToken('alice', 'app', 'tok-dead');
    verifyAppToken.mockRejectedValue(new BlipfotoError(51, 'Invalid token'));
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-ro2',
      grantedScope: 'read',
      username: 'alice',
    });

    await recoverNotifications('alice');

    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    expect(runOAuthRound).toHaveBeenCalledWith('read', expect.anything());
    expect(registerAccountForPush).toHaveBeenCalledWith('alice', 'tok-ro2', expect.anything());
  });

  it("a check that fails for another reason (offline) doesn't force a full re-auth", async () => {
    useAccountsStore.setState({ accounts: [deadServiceAccount()], activeAccountId: 'alice' });
    seedToken('alice', 'app', 'tok-app');
    verifyAppToken.mockRejectedValue(new Error('network down'));
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-svc',
      grantedScope: 'read',
      username: 'alice',
    });

    await recoverNotifications('alice');

    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    expect(useAccountsStore.getState().accounts[0].appTokenScope).toBe('read,write');
  });
});

const { getClientForAccount } = await import('../../data/client.js');

describe('reauthorizeAccount (FLW-02 re-sign-in, b-oss#263)', () => {
  const verifyServiceToken = vi.fn<(...args: unknown[]) => Promise<unknown>>();

  beforeEach(() => {
    vi.mocked(getClientForAccount).mockImplementation((_id: string, purpose = 'app') =>
      Promise.resolve({
        verifyToken: purpose === 'service' ? verifyServiceToken : verifyAppToken,
      } as never),
    );
  });

  /** An account whose app token was just rejected, the way data/client.ts reports it. */
  function forcedOut(overrides: Partial<StoredAccount> = {}): void {
    useAccountsStore.setState({
      accounts: [
        account({ id: 'carol', username: 'carol', appTokenScope: 'read,write' }),
        account(overrides),
      ],
      activeAccountId: 'alice',
    });
    seedToken('alice', 'app', 'tok-dead');
    handleForcedLogout('alice', 'app');
  }

  it('a forced logout remembers the scope, and a later one keeps it', () => {
    forcedOut({ appTokenScope: 'read' });
    expect(useAccountsStore.getState().accounts[1]).toMatchObject({
      appTokenScope: null,
      lastAppTokenScope: 'read',
    });
    handleForcedLogout('alice', 'app');
    expect(useAccountsStore.getState().accounts[1].lastAppTokenScope).toBe('read');
  });

  it('app-only account: one round at the remembered scope, no explainer, becomes active', async () => {
    forcedOut({ appTokenScope: 'read' });
    expect(useAccountsStore.getState().activeAccountId).toBe('carol');
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-ro2',
      grantedScope: 'read',
      username: 'alice',
    });
    const beforeServiceRound = vi.fn().mockResolvedValue(true);

    await expect(reauthorizeAccount('alice', { beforeServiceRound })).resolves.toEqual({
      signedIn: true,
    });

    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    expect(runOAuthRound).toHaveBeenCalledWith('read', expect.anything());
    expect(beforeServiceRound).not.toHaveBeenCalled();
    expect(registerAccountForPush).not.toHaveBeenCalled();
    expect(await getToken('alice', 'app')).toBe('tok-ro2');
    expect(useAccountsStore.getState().accounts[1].appTokenScope).toBe('read');
    expect(useAccountsStore.getState().activeAccountId).toBe('alice');
  });

  it('an account persisted before #263 (no remembered scope) signs in read-write', async () => {
    useAccountsStore.setState({
      accounts: [account({ appTokenScope: null })],
      activeAccountId: null,
    });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-rw2',
      grantedScope: 'read,write',
      username: 'alice',
    });
    await reauthorizeAccount('alice');
    expect(runOAuthRound).toHaveBeenCalledWith('read,write', expect.anything());
  });

  it('read-write with notifications: app round, then the explainer, then the service round (Continue)', async () => {
    forcedOut({
      hasServiceToken: true,
      notificationRegistrationId: 'r1',
      notificationStatus: 'active',
    });
    seedToken('alice', 'service', 'tok-svc-dead');
    verifyServiceToken.mockRejectedValue(new BlipfotoError(51, 'Invalid token'));
    const order: string[] = [];
    runOAuthRound.mockImplementation((scope: string) => {
      order.push(`round:${scope}`);
      return Promise.resolve(
        scope === 'read'
          ? { accessToken: 'tok-svc2', grantedScope: 'read', username: 'alice' }
          : { accessToken: 'tok-app2', grantedScope: 'read,write', username: 'alice' },
      );
    });
    const beforeServiceRound = vi.fn(() => {
      order.push('explainer');
      // The account is already signed in and active when the explainer shows.
      expect(useAccountsStore.getState().activeAccountId).toBe('alice');
      return Promise.resolve(true);
    });

    await expect(reauthorizeAccount('alice', { beforeServiceRound })).resolves.toEqual({
      signedIn: true,
    });

    expect(order).toEqual(['round:read,write', 'explainer', 'round:read']);
    expect(registerAccountForPush).toHaveBeenCalledWith('alice', 'tok-svc2', expect.anything());
    expect(await getToken('alice', 'app')).toBe('tok-app2');
    expect(await getToken('alice', 'service')).toBe('tok-svc2');
    expect(useAccountsStore.getState().accounts[1]).toMatchObject({
      appTokenScope: 'read,write',
      hasServiceToken: true,
    });
  });

  it('Not now: signed in and active, notifications still need a sign-in', async () => {
    forcedOut({
      hasServiceToken: true,
      notificationRegistrationId: 'r1',
      notificationStatus: 'active',
    });
    seedToken('alice', 'service', 'tok-svc-dead');
    verifyServiceToken.mockRejectedValue(new BlipfotoError(51, 'Invalid token'));
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-app2',
      grantedScope: 'read,write',
      username: 'alice',
    });

    await reauthorizeAccount('alice', { beforeServiceRound: () => Promise.resolve(false) });

    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    const alice = useAccountsStore.getState().accounts[1];
    expect(alice.appTokenScope).toBe('read,write');
    expect(alice.hasServiceToken).toBe(false);
    expect(alice.notificationStatus).toBe('read-token-invalid');
    expect(useAccountsStore.getState().activeAccountId).toBe('alice');
  });

  it('cancelling the notifications round is the same as Not now', async () => {
    forcedOut({ notificationRegistrationId: 'r1', notificationStatus: 'read-token-invalid' });
    runOAuthRound
      .mockResolvedValueOnce({
        accessToken: 'tok-app2',
        grantedScope: 'read,write',
        username: 'alice',
      })
      .mockRejectedValueOnce(new OAuthCancelledError('declined'));

    await expect(reauthorizeAccount('alice')).resolves.toEqual({ signedIn: true });
    expect(useAccountsStore.getState().accounts[1].appTokenScope).toBe('read,write');
  });

  it('cancelling the app round changes nothing', async () => {
    forcedOut();
    runOAuthRound.mockRejectedValueOnce(new OAuthCancelledError('declined'));
    await expect(reauthorizeAccount('alice')).rejects.toBeInstanceOf(OAuthCancelledError);
    expect(useAccountsStore.getState().accounts[1].appTokenScope).toBeNull();
    expect(useAccountsStore.getState().activeAccountId).toBe('carol');
  });

  it("a read-write account's service token that still works isn't replaced", async () => {
    forcedOut({
      hasServiceToken: true,
      notificationRegistrationId: 'r1',
      notificationStatus: 'active',
    });
    seedToken('alice', 'service', 'tok-svc');
    verifyServiceToken.mockResolvedValue({ username: 'alice', scope: 'read' });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-app2',
      grantedScope: 'read,write',
      username: 'alice',
    });
    const beforeServiceRound = vi.fn().mockResolvedValue(true);

    await reauthorizeAccount('alice', { beforeServiceRound });

    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    expect(beforeServiceRound).not.toHaveBeenCalled();
    expect(await getToken('alice', 'service')).toBe('tok-svc');
  });

  it('read-only with notifications: its service token was the dead app token — one round, re-registered with the new one', async () => {
    forcedOut({ appTokenScope: 'read', hasServiceToken: true, notificationRegistrationId: 'r1' });
    seedToken('alice', 'service', 'tok-dead');
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-ro2',
      grantedScope: 'read',
      username: 'alice',
    });
    const beforeServiceRound = vi.fn().mockResolvedValue(true);

    await reauthorizeAccount('alice', { beforeServiceRound });

    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    expect(beforeServiceRound).not.toHaveBeenCalled();
    expect(verifyServiceToken).not.toHaveBeenCalled();
    expect(registerAccountForPush).toHaveBeenCalledWith('alice', 'tok-ro2', expect.anything());
    expect(await getToken('alice', 'service')).toBe('tok-ro2');
  });

  it('notifications-only (app token fine): one service round after the explainer, and active', async () => {
    useAccountsStore.setState({
      accounts: [
        account({ id: 'carol', username: 'carol' }),
        account({ notificationRegistrationId: 'r1', notificationStatus: 'read-token-invalid' }),
      ],
      activeAccountId: 'carol',
    });
    seedToken('alice', 'app', 'tok-app');
    verifyAppToken.mockResolvedValue({ username: 'alice', scope: 'read,write' });
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-svc2',
      grantedScope: 'read',
      username: 'alice',
    });
    const beforeServiceRound = vi.fn().mockResolvedValue(true);

    await expect(reauthorizeAccount('alice', { beforeServiceRound })).resolves.toEqual({
      signedIn: true,
    });

    expect(beforeServiceRound).toHaveBeenCalledTimes(1);
    expect(runOAuthRound).toHaveBeenCalledTimes(1);
    expect(runOAuthRound).toHaveBeenCalledWith('read', expect.anything());
    expect(await getToken('alice', 'app')).toBe('tok-app');
    expect(useAccountsStore.getState().activeAccountId).toBe('alice');
  });

  it('notifications-only, Not now: nothing was signed in', async () => {
    useAccountsStore.setState({
      accounts: [
        account({ notificationRegistrationId: 'r1', notificationStatus: 'read-token-invalid' }),
      ],
      activeAccountId: 'alice',
    });
    seedToken('alice', 'app', 'tok-app');
    verifyAppToken.mockResolvedValue({ username: 'alice', scope: 'read,write' });

    await expect(
      reauthorizeAccount('alice', { beforeServiceRound: () => Promise.resolve(false) }),
    ).resolves.toEqual({ signedIn: false });
    expect(runOAuthRound).not.toHaveBeenCalled();
  });

  it('the app round is owner-checked: the wrong account changes nothing', async () => {
    forcedOut();
    runOAuthRound.mockResolvedValueOnce({
      accessToken: 'tok-bob',
      grantedScope: 'read,write',
      username: 'bob',
    });
    await expect(reauthorizeAccount('alice')).rejects.toBeInstanceOf(AccountMismatchError);
    expect(useAccountsStore.getState().accounts[1].appTokenScope).toBeNull();
    expect(await getToken('alice', 'app')).toBeNull();
  });
});
