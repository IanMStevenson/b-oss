// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Desktop notifications by polling (b-oss#610): the account setting, what the shell is told to
// watch, how the sync follows the store, and the pieces of the push flow that change on desktop.
// Android keeps its behaviour: the same flows are exercised with the push mechanism too.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { StoredAccount } from '../../state/accountsStore.js';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

let mechanism: 'push' | 'polling' | 'none' = 'polling';
vi.mock('../../platform/capabilities.js', () => ({
  capabilities: () => ({ notifications: { mechanism } }),
}));

const configure = vi.fn<(settings: unknown) => Promise<void>>();
vi.mock('../../platform/desktopNotify.js', () => ({
  configureDesktopNotifications: (s: unknown) => configure(s),
}));

const checkPushPermission = vi.fn<() => Promise<string>>();
vi.mock('../../platform/push.js', () => ({
  isPushAvailable: vi.fn().mockResolvedValue(true),
  checkPushPermission: () => checkPushPermission(),
  requestPushPermission: vi.fn(),
  registerPush: vi.fn(),
  pushPlatform: vi.fn(),
}));
vi.mock('../../platform/secureStorage.js', () => ({
  getRegistrationSecret: vi.fn().mockResolvedValue(null),
  setRegistrationSecret: vi.fn(),
  deleteRegistrationSecret: vi.fn(),
}));
vi.mock('../../data/pushService.js', async () => ({
  PushServiceError: (
    await vi.importActual<typeof import('../../data/pushService.js')>('../../data/pushService.js')
  ).PushServiceError,
  createRegistration: vi.fn(),
  patchRegistration: vi.fn(),
  getRegistrationStatus: vi.fn(),
  deleteRegistration: vi.fn(),
}));

const handleForcedLogout = vi.fn<(...args: unknown[]) => void>();
vi.mock('../accountsFlow.js', () => ({
  clearServiceToken: vi.fn(),
  handleForcedLogout: (...args: unknown[]) => handleForcedLogout(...args),
}));
vi.mock('../../state/authReady.js', () => ({ authReady: Promise.resolve() }));

const { useAccountsStore } = await import('../../state/accountsStore.js');
const {
  disablePollingNotifications,
  enablePollingNotifications,
  pollingSettings,
  startPollingSync,
} = await import('../pollingNotifications.js');
const { routeForPushTap, runLaunchBackstopCheck, updatePushStreams } =
  await import('../pushFlow.js');

function account(id: string, patch: Partial<StoredAccount> = {}): StoredAccount {
  return {
    id,
    username: id,
    avatarUrl: null,
    appTokenScope: 'read,write',
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
    ...patch,
  };
}

beforeEach(() => {
  mechanism = 'polling';
  configure.mockReset().mockResolvedValue(undefined);
  handleForcedLogout.mockReset();
  checkPushPermission.mockReset();
  useAccountsStore.setState({ accounts: [account('ann'), account('bob')], activeAccountId: 'ann' });
});

describe('the setting', () => {
  it('on is the account flag plus its streams; both streams off is off', () => {
    enablePollingNotifications('ann', { comments: true, notifications: false });
    expect(useAccountsStore.getState().accounts[0]).toMatchObject({
      hasServiceToken: true,
      pushComments: true,
      pushNotifications: false,
    });
    enablePollingNotifications('ann', { comments: false, notifications: false });
    expect(useAccountsStore.getState().accounts[0].hasServiceToken).toBe(false);
    disablePollingNotifications('ann');
    expect(useAccountsStore.getState().accounts[0].pushComments).toBeUndefined();
  });

  it('updatePushStreams changes the streams locally with no service involved', async () => {
    enablePollingNotifications('ann', { comments: true, notifications: true });
    await updatePushStreams('ann', { comments: false, notifications: true });
    expect(useAccountsStore.getState().accounts[0]).toMatchObject({
      pushComments: false,
      pushNotifications: true,
    });
  });
});

describe('what the shell watches', () => {
  it('only accounts with notifications on and a usable app token', () => {
    useAccountsStore.setState({
      accounts: [
        account('on', { hasServiceToken: true, pushComments: true, pushNotifications: false }),
        account('off'),
        account('dead', { hasServiceToken: true, appTokenScope: null }),
      ],
      activeAccountId: 'on',
    });
    expect(pollingSettings()).toEqual({
      accounts: [{ accountId: 'on', streams: { comments: true, notifications: false } }],
    });
  });
});

describe('startPollingSync', () => {
  it('sends nothing before the accounts have loaded, then the current set, then only changes', async () => {
    let loaded!: () => void;
    const hydrated = new Promise<void>((resolve) => (loaded = resolve));
    const stop = startPollingSync(hydrated);
    enablePollingNotifications('ann', { comments: true, notifications: true });
    expect(configure).not.toHaveBeenCalled();
    loaded();
    await hydrated;
    await Promise.resolve();
    expect(configure).toHaveBeenCalledTimes(1);
    // An unrelated change (the active account) does not re-send.
    useAccountsStore.getState().setActiveAccountId('bob');
    expect(configure).toHaveBeenCalledTimes(1);
    // Removing the account's token (forced logout) drops it from the watched set.
    useAccountsStore.getState().updateAccount('ann', { appTokenScope: null });
    expect(configure).toHaveBeenCalledTimes(2);
    expect(configure).toHaveBeenLastCalledWith({ accounts: [] });
    stop();
    enablePollingNotifications('bob', { comments: true, notifications: true });
    expect(configure).toHaveBeenCalledTimes(2);
  });
});

describe('on desktop the push flow changes only where it must', () => {
  it('a reauth-required tap signs the account out of its app token, not a service token', async () => {
    const route = await routeForPushTap({ kind: 'reauth-required', accountId: 'ann' });
    expect(handleForcedLogout).toHaveBeenCalledWith('ann', 'app');
    expect(route).toBe('/accounts?reauth=ann');
  });

  it('the launch backstop does nothing (no OS push permission, no registration)', async () => {
    useAccountsStore.setState({
      accounts: [account('ann', { hasServiceToken: true })],
      activeAccountId: 'ann',
    });
    await runLaunchBackstopCheck();
    expect(checkPushPermission).not.toHaveBeenCalled();
  });

  it('an activity tap still switches account and opens the right inbox', async () => {
    const route = await routeForPushTap({ kind: 'activity', stream: 'comments', accountId: 'bob' });
    expect(route).toBe('/comments');
    expect(useAccountsStore.getState().activeAccountId).toBe('bob');
  });

  it('with the push mechanism (Android) the same calls keep their old meaning', async () => {
    mechanism = 'push';
    await routeForPushTap({ kind: 'reauth-required', accountId: 'ann' });
    expect(handleForcedLogout).toHaveBeenCalledWith('ann', 'service');
    useAccountsStore.setState({
      accounts: [account('ann', { hasServiceToken: true })],
      activeAccountId: 'ann',
    });
    checkPushPermission.mockResolvedValue('granted');
    await runLaunchBackstopCheck();
    expect(checkPushPermission).toHaveBeenCalled();
  });
});
