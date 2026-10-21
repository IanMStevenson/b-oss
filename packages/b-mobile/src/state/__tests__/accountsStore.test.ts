// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// useCanWrite() is explicitly named in §19's "this is where the density should be" list, as
// "the write-gate selector" — every route guard and screen in the app trusts it blindly (see
// WriteGuardRoute.test.tsx, which mocks it away rather than exercising the real derivation), so
// its own logic deserves a direct test rather than only ever being tested as a mock.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

import { useAccountsStore, useActiveAccount, useCanWrite } from '../accountsStore.js';
import type { StoredAccount } from '../accountsStore.js';

function account(overrides: Partial<StoredAccount> = {}): StoredAccount {
  return {
    id: 'a1',
    username: 'alice',
    avatarUrl: null,
    appTokenScope: 'read,write',
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
    ...overrides,
  };
}

beforeEach(() => {
  useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
});

describe('useCanWrite', () => {
  it('is false with no active account', () => {
    const { result } = renderHook(() => useCanWrite());
    expect(result.current).toBe(false);
  });

  it('is true only for a granted read,write scope', () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    const { result } = renderHook(() => useCanWrite());
    expect(result.current).toBe(true);
  });

  it('is false for a read-only granted scope', () => {
    useAccountsStore.setState({
      accounts: [account({ appTokenScope: 'read' })],
      activeAccountId: 'a1',
    });
    const { result } = renderHook(() => useCanWrite());
    expect(result.current).toBe(false);
  });

  it('is false when the token is null (needs reauth) — the granted scope, never a remembered mode', () => {
    useAccountsStore.setState({
      accounts: [account({ appTokenScope: null })],
      activeAccountId: 'a1',
    });
    const { result } = renderHook(() => useCanWrite());
    expect(result.current).toBe(false);
  });

  it('is false when activeAccountId points at an account no longer in the list', () => {
    useAccountsStore.setState({ accounts: [], activeAccountId: 'a1' });
    const { result } = renderHook(() => useCanWrite());
    expect(result.current).toBe(false);
  });

  it('follows a live account switch without a remount', () => {
    useAccountsStore.setState({
      accounts: [account({ id: 'a1', appTokenScope: 'read' }), account({ id: 'a2' })],
      activeAccountId: 'a1',
    });
    const { result, rerender } = renderHook(() => useCanWrite());
    expect(result.current).toBe(false);

    useAccountsStore.getState().setActiveAccountId('a2');
    rerender();
    expect(result.current).toBe(true);
  });
});

describe('useActiveAccount', () => {
  it('returns null with no active account id', () => {
    const { result } = renderHook(() => useActiveAccount());
    expect(result.current).toBeNull();
  });

  it('returns the matching account for the active id', () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    const { result } = renderHook(() => useActiveAccount());
    expect(result.current?.username).toBe('alice');
  });
});
