// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// The route table is keyed by the active account, so switching account rebuilds the current
// screen (and every fetch it makes) — e.g. a profile's Follow state is per account.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useAccountsStore } from '../../../state/accountsStore.js';

const mounts = vi.fn();
vi.mock('../../../screens/SCR-17-18-profile/ProfileScreen.js', async () => {
  const React = await import('react');
  return {
    ProfileScreen: () => {
      React.useEffect(() => {
        mounts();
      }, []);
      return null;
    },
  };
});

const signInReturnTo = vi.fn();
vi.mock('../../../screens/SCR-01-sign-in/SignInScreen.js', () => ({
  SignInScreen: ({ returnTo }: { returnTo?: string }) => {
    signInReturnTo(returnTo);
    return null;
  },
}));

afterEach(() => {
  cleanup();
  mounts.mockClear();
  signInReturnTo.mockClear();
});

function acct(id: string) {
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

describe('renderAppRoutes', () => {
  it('remounts the current screen when the active account changes', async () => {
    useAccountsStore.setState({
      accounts: [acct('a1'), acct('a2')],
      activeAccountId: 'a1',
      hydrated: true,
    });
    const { renderAppRoutes } = await import('../AppRoutes.js');
    render(<MemoryRouter initialEntries={['/user/someone']}>{renderAppRoutes()}</MemoryRouter>);
    expect(mounts).toHaveBeenCalledTimes(1);

    act(() => useAccountsStore.getState().setActiveAccountId('a2'));
    expect(mounts).toHaveBeenCalledTimes(2);

    // Same account again: no rebuild.
    act(() => useAccountsStore.getState().setActiveAccountId('a2'));
    expect(mounts).toHaveBeenCalledTimes(2);
  });

  it('passes a valid return target to the sign-in screen (b-oss#397)', async () => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
    const { renderAppRoutes } = await import('../AppRoutes.js');
    render(
      <MemoryRouter initialEntries={['/sign-in?return=%2Fentry%2F123']}>
        {renderAppRoutes()}
      </MemoryRouter>,
    );
    expect(signInReturnTo).toHaveBeenLastCalledWith('/entry/123');
  });

  it('ignores an invalid return target', async () => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
    const { renderAppRoutes } = await import('../AppRoutes.js');
    render(
      <MemoryRouter initialEntries={['/sign-in?return=https%3A%2F%2Fexample.com%2F']}>
        {renderAppRoutes()}
      </MemoryRouter>,
    );
    expect(signInReturnTo).toHaveBeenLastCalledWith(undefined);
  });
});
