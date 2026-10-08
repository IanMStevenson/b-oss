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

afterEach(() => {
  cleanup();
  mounts.mockClear();
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
});
