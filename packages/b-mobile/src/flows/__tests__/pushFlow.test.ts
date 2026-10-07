// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Unit tests for the b-push registration lifecycle (notification-service.md's contract, FLW-16/
//20/22/02). Every platform/data boundary is mocked so this runs as pure logic — same shape as
// accountsFlow.test.ts.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StoredAccount } from '../../state/accountsStore.js';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const isPushAvailable = vi.fn<(...args: unknown[]) => Promise<boolean>>();
const checkPushPermission = vi.fn<(...args: unknown[]) => Promise<string>>();
const requestPushPermission = vi.fn<(...args: unknown[]) => Promise<string>>();
const registerPush = vi.fn<(...args: unknown[]) => Promise<string | null>>();
const pushPlatform = vi.fn<(...args: unknown[]) => string | null>();
vi.mock('../../platform/push.js', () => ({
  isPushAvailable: (...args: unknown[]) => isPushAvailable(...args),
  checkPushPermission: (...args: unknown[]) => checkPushPermission(...args),
  requestPushPermission: (...args: unknown[]) => requestPushPermission(...args),
  registerPush: (...args: unknown[]) => registerPush(...args),
  pushPlatform: (...args: unknown[]) => pushPlatform(...args),
}));

const secretStore = new Map<string, string>();
vi.mock('../../platform/secureStorage.js', () => ({
  getRegistrationSecret: vi.fn((accountId: string) =>
    Promise.resolve(secretStore.get(accountId) ?? null),
  ),
  setRegistrationSecret: vi.fn((accountId: string, secret: string) => {
    secretStore.set(accountId, secret);
    return Promise.resolve();
  }),
  deleteRegistrationSecret: vi.fn((accountId: string) => {
    secretStore.delete(accountId);
    return Promise.resolve();
  }),
}));

const createRegistration =
  vi.fn<(...args: unknown[]) => Promise<{ registrationId: string; registrationSecret: string }>>();
const patchRegistration = vi.fn<(...args: unknown[]) => Promise<void>>();
const getRegistrationStatus =
  vi.fn<(...args: unknown[]) => Promise<{ status: string; lastPolledAt: number | null }>>();
const deleteRegistration = vi.fn<(...args: unknown[]) => Promise<void>>();
vi.mock('../../data/pushService.js', () => ({
  createRegistration: (...args: unknown[]) => createRegistration(...args),
  patchRegistration: (...args: unknown[]) => patchRegistration(...args),
  getRegistrationStatus: (...args: unknown[]) => getRegistrationStatus(...args),
  deleteRegistration: (...args: unknown[]) => deleteRegistration(...args),
}));

const handleForcedLogout = vi.fn<(...args: unknown[]) => void>();
vi.mock('../accountsFlow.js', () => ({
  handleForcedLogout: (...args: unknown[]) => handleForcedLogout(...args),
}));

const { useAccountsStore } = await import('../../state/accountsStore.js');
const {
  ensurePushPermission,
  registerAccountForPush,
  deregisterAccountFromPush,
  updatePushStreams,
  updatePollingInterval,
  handleDeviceTokenRotated,
  runLaunchBackstopCheck,
} = await import('../pushFlow.js');

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

function setAccounts(accounts: StoredAccount[], activeAccountId: string | null = null) {
  useAccountsStore.setState({ accounts, activeAccountId, hydrated: true });
}

beforeEach(() => {
  secretStore.clear();
  vi.clearAllMocks();
  isPushAvailable.mockResolvedValue(true);
  setAccounts([]);
});

describe('ensurePushPermission', () => {
  it('returns true without requesting when already granted', async () => {
    checkPushPermission.mockResolvedValue('granted');
    expect(await ensurePushPermission()).toBe(true);
    expect(requestPushPermission).not.toHaveBeenCalled();
  });

  it('returns false without requesting when already denied', async () => {
    checkPushPermission.mockResolvedValue('denied');
    expect(await ensurePushPermission()).toBe(false);
    expect(requestPushPermission).not.toHaveBeenCalled();
  });

  it('requests when prompt, and returns the request outcome', async () => {
    checkPushPermission.mockResolvedValue('prompt');
    requestPushPermission.mockResolvedValue('granted');
    expect(await ensurePushPermission()).toBe(true);
    expect(requestPushPermission).toHaveBeenCalledTimes(1);
  });

  it('a refused request resolves false', async () => {
    checkPushPermission.mockResolvedValue('prompt-with-rationale');
    requestPushPermission.mockResolvedValue('denied');
    expect(await ensurePushPermission()).toBe(false);
  });
});

describe('registerAccountForPush', () => {
  it('does nothing — no prompt, no registration — on a build without Firebase credentials', async () => {
    // Regression: PushNotifications.register() throws natively (uncatchable from JS) and kills
    // the app when Firebase was never initialised — it crashed on first sign-in.
    isPushAvailable.mockResolvedValue(false);
    checkPushPermission.mockResolvedValue('granted');
    expect(await registerAccountForPush('alice', 'read-token')).toBe(false);
    expect(checkPushPermission).not.toHaveBeenCalled();
    expect(requestPushPermission).not.toHaveBeenCalled();
    expect(registerPush).not.toHaveBeenCalled();
    expect(createRegistration).not.toHaveBeenCalled();
  });

  it('returns false without calling the service when permission is refused', async () => {
    checkPushPermission.mockResolvedValue('denied');
    expect(await registerAccountForPush('alice', 'read-token')).toBe(false);
    expect(registerPush).not.toHaveBeenCalled();
    expect(createRegistration).not.toHaveBeenCalled();
  });

  it('returns false when OS registration yields no device token', async () => {
    checkPushPermission.mockResolvedValue('granted');
    registerPush.mockResolvedValue(null);
    pushPlatform.mockReturnValue('android');
    expect(await registerAccountForPush('alice', 'read-token')).toBe(false);
    expect(createRegistration).not.toHaveBeenCalled();
  });

  it('returns false off native (no platform)', async () => {
    checkPushPermission.mockResolvedValue('granted');
    registerPush.mockResolvedValue('device-token');
    pushPlatform.mockReturnValue(null);
    expect(await registerAccountForPush('alice', 'read-token')).toBe(false);
  });

  it('on success: stores the secret, updates the account, returns true', async () => {
    setAccounts([account({ id: 'alice' })]);
    checkPushPermission.mockResolvedValue('granted');
    registerPush.mockResolvedValue('device-token');
    pushPlatform.mockReturnValue('android');
    createRegistration.mockResolvedValue({ registrationId: 'reg-1', registrationSecret: 'sec-1' });

    const result = await registerAccountForPush('alice', 'read-token');

    expect(result).toBe(true);
    expect(createRegistration).toHaveBeenCalledWith({
      blipfotoUserId: 'alice',
      readToken: 'read-token',
      deviceToken: 'device-token',
      platform: 'android',
      pushComments: true,
      pushNotifications: true,
    });
    expect(secretStore.get('alice')).toBe('sec-1');
    const stored = useAccountsStore.getState().accounts.find((a) => a.id === 'alice');
    expect(stored?.notificationRegistrationId).toBe('reg-1');
    expect(stored?.notificationStatus).toBe('active');
  });

  it('sends the chosen streams and stores them locally (b-oss#244)', async () => {
    setAccounts([account({ id: 'alice' })]);
    checkPushPermission.mockResolvedValue('granted');
    registerPush.mockResolvedValue('device-token');
    pushPlatform.mockReturnValue('android');
    createRegistration.mockResolvedValue({ registrationId: 'reg-1', registrationSecret: 'sec-1' });

    await registerAccountForPush('alice', 'read-token', { comments: false, notifications: true });

    expect(createRegistration).toHaveBeenCalledWith(
      expect.objectContaining({ pushComments: false, pushNotifications: true }),
    );
    const stored = useAccountsStore.getState().accounts.find((a) => a.id === 'alice');
    expect(stored?.pushComments).toBe(false);
    expect(stored?.pushNotifications).toBe(true);
  });

  it('deletes a stale registration left by a dead read token once the new one exists', async () => {
    secretStore.set('alice', 'old-sec');
    setAccounts([
      account({
        id: 'alice',
        notificationRegistrationId: 'old-reg',
        notificationStatus: 'read-token-invalid',
      }),
    ]);
    checkPushPermission.mockResolvedValue('granted');
    registerPush.mockResolvedValue('device-token');
    pushPlatform.mockReturnValue('android');
    createRegistration.mockResolvedValue({ registrationId: 'reg-2', registrationSecret: 'sec-2' });
    deleteRegistration.mockResolvedValue(undefined);

    expect(await registerAccountForPush('alice', 'read-token')).toBe(true);
    expect(deleteRegistration).toHaveBeenCalledWith('old-reg', 'old-sec');
    expect(secretStore.get('alice')).toBe('sec-2');
  });

  it('returns false when the service call itself fails', async () => {
    setAccounts([account({ id: 'alice' })]);
    checkPushPermission.mockResolvedValue('granted');
    registerPush.mockResolvedValue('device-token');
    pushPlatform.mockReturnValue('android');
    createRegistration.mockRejectedValue(new Error('network down'));

    expect(await registerAccountForPush('alice', 'read-token')).toBe(false);
    expect(secretStore.has('alice')).toBe(false);
  });
});

describe('deregisterAccountFromPush', () => {
  it('deletes the service-side registration and local secret, clears account fields', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([
      account({ id: 'alice', notificationRegistrationId: 'reg-1', notificationStatus: 'active' }),
    ]);
    deleteRegistration.mockResolvedValue(undefined);

    await deregisterAccountFromPush('alice');

    expect(deleteRegistration).toHaveBeenCalledWith('reg-1', 'sec-1');
    expect(secretStore.has('alice')).toBe(false);
    const stored = useAccountsStore.getState().accounts.find((a) => a.id === 'alice');
    expect(stored?.notificationRegistrationId).toBeNull();
    expect(stored?.notificationStatus).toBeNull();
  });

  it('still clears local state even when the service DELETE call fails', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([account({ id: 'alice', notificationRegistrationId: 'reg-1' })]);
    deleteRegistration.mockRejectedValue(new Error('network down'));

    await deregisterAccountFromPush('alice');

    expect(secretStore.has('alice')).toBe(false);
    expect(
      useAccountsStore.getState().accounts.find((a) => a.id === 'alice')
        ?.notificationRegistrationId,
    ).toBeNull();
  });

  it('is a no-op against the service when there was never a registration', async () => {
    setAccounts([account({ id: 'alice' })]);
    await deregisterAccountFromPush('alice');
    expect(deleteRegistration).not.toHaveBeenCalled();
  });
});

describe('updatePushStreams', () => {
  it('throws when there is no registration', async () => {
    setAccounts([account({ id: 'alice' })]);
    await expect(
      updatePushStreams('alice', { comments: true, notifications: false }),
    ).rejects.toThrow();
    expect(patchRegistration).not.toHaveBeenCalled();
  });

  it('PATCHes both flags, then updates the local copy', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([account({ id: 'alice', notificationRegistrationId: 'reg-1' })]);
    patchRegistration.mockResolvedValue(undefined);

    await updatePushStreams('alice', { comments: true, notifications: false });

    expect(patchRegistration).toHaveBeenCalledWith('reg-1', 'sec-1', {
      pushComments: true,
      pushNotifications: false,
    });
    const stored = useAccountsStore.getState().accounts[0];
    expect(stored?.pushComments).toBe(true);
    expect(stored?.pushNotifications).toBe(false);
  });

  it('leaves the local copy alone when the PATCH fails', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([account({ id: 'alice', notificationRegistrationId: 'reg-1' })]);
    patchRegistration.mockRejectedValue(new Error('down'));

    await expect(
      updatePushStreams('alice', { comments: true, notifications: false }),
    ).rejects.toThrow('down');
    expect(useAccountsStore.getState().accounts[0]?.pushNotifications).toBeUndefined();
  });
});

describe('updatePollingInterval', () => {
  it('throws when there is no registration', async () => {
    setAccounts([account({ id: 'alice' })]);
    await expect(updatePollingInterval('alice', 10)).rejects.toThrow();
    expect(patchRegistration).not.toHaveBeenCalled();
  });

  it('PATCHes the interval when a registration exists', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([account({ id: 'alice', notificationRegistrationId: 'reg-1' })]);
    patchRegistration.mockResolvedValue(undefined);
    await updatePollingInterval('alice', 15);
    expect(patchRegistration).toHaveBeenCalledWith('reg-1', 'sec-1', { pollIntervalMinutes: 15 });
  });

  it('propagates a PATCH failure — this one has a visible control to show it against', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([account({ id: 'alice', notificationRegistrationId: 'reg-1' })]);
    patchRegistration.mockRejectedValue(new Error('server floor rejected'));
    await expect(updatePollingInterval('alice', 1)).rejects.toThrow('server floor rejected');
  });
});

describe('handleDeviceTokenRotated', () => {
  it('PATCHes the new device token for every registered account', async () => {
    secretStore.set('alice', 'sec-a');
    secretStore.set('bob', 'sec-b');
    setAccounts([
      account({ id: 'alice', notificationRegistrationId: 'reg-a' }),
      account({ id: 'bob', notificationRegistrationId: 'reg-b' }),
    ]);
    patchRegistration.mockResolvedValue(undefined);

    await handleDeviceTokenRotated('new-device-token');

    expect(patchRegistration).toHaveBeenCalledWith('reg-a', 'sec-a', {
      deviceToken: 'new-device-token',
    });
    expect(patchRegistration).toHaveBeenCalledWith('reg-b', 'sec-b', {
      deviceToken: 'new-device-token',
    });
  });

  it('skips an account with no registration, and one failure does not stop the rest', async () => {
    secretStore.set('alice', 'sec-a');
    secretStore.set('bob', 'sec-b');
    setAccounts([
      account({ id: 'alice', notificationRegistrationId: 'reg-a' }),
      account({ id: 'carol' }), // no registration
      account({ id: 'bob', notificationRegistrationId: 'reg-b' }),
    ]);
    patchRegistration.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce(undefined);

    await expect(handleDeviceTokenRotated('t')).resolves.toBeUndefined();
    expect(patchRegistration).toHaveBeenCalledTimes(2);
  });
});

describe('runLaunchBackstopCheck', () => {
  it('skips an account that never had notifications on', async () => {
    setAccounts([account({ id: 'alice', hasServiceToken: false })]);
    await runLaunchBackstopCheck();
    expect(checkPushPermission).not.toHaveBeenCalled();
  });

  it('deregisters when OS permission is no longer granted — same as the user turning it off', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([
      account({ id: 'alice', hasServiceToken: true, notificationRegistrationId: 'reg-1' }),
    ]);
    checkPushPermission.mockResolvedValue('denied');
    deleteRegistration.mockResolvedValue(undefined);

    await runLaunchBackstopCheck();

    expect(deleteRegistration).toHaveBeenCalledWith('reg-1', 'sec-1');
    expect(getRegistrationStatus).not.toHaveBeenCalled();
  });

  it('does nothing further when the registration is healthy', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([
      account({ id: 'alice', hasServiceToken: true, notificationRegistrationId: 'reg-1' }),
    ]);
    checkPushPermission.mockResolvedValue('granted');
    getRegistrationStatus.mockResolvedValue({ status: 'active', lastPolledAt: 1 });

    await runLaunchBackstopCheck();

    expect(handleForcedLogout).not.toHaveBeenCalled();
  });

  it('feeds FLW-02 forced logout when the service reports the read token is dead', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([
      account({ id: 'alice', hasServiceToken: true, notificationRegistrationId: 'reg-1' }),
    ]);
    checkPushPermission.mockResolvedValue('granted');
    getRegistrationStatus.mockResolvedValue({ status: 'read-token-invalid', lastPolledAt: 1 });

    await runLaunchBackstopCheck();

    expect(handleForcedLogout).toHaveBeenCalledWith('alice', 'service');
  });

  it('a transient failure reaching b-push is not itself treated as a signal', async () => {
    secretStore.set('alice', 'sec-1');
    setAccounts([
      account({ id: 'alice', hasServiceToken: true, notificationRegistrationId: 'reg-1' }),
    ]);
    checkPushPermission.mockResolvedValue('granted');
    getRegistrationStatus.mockRejectedValue(new Error('network down'));

    await expect(runLaunchBackstopCheck()).resolves.toBeUndefined();
    expect(handleForcedLogout).not.toHaveBeenCalled();
  });
});
