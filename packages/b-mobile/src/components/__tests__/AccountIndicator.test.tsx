// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// rules.md, "Multi-account clarity" — shown only with 2+ stored accounts; "with fewer than two
// accounts it is absent, and the space it occupied is simply not reserved", hence testing for a
// real `null` render (no hidden/disabled element), not just an invisible one.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountIndicator } from '../AccountIndicator.js';
import { OverlayProvider, useOverlay } from '../../app/OverlayProvider.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import type { StoredAccount } from '../../state/accountsStore.js';

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

afterEach(() => {
  cleanup();
  useAccountsStore.setState({ accounts: [], activeAccountId: null });
});

function renderIndicator() {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <AccountIndicator />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('AccountIndicator', () => {
  it('renders nothing with zero accounts', () => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null });
    const { container } = renderIndicator();
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing with exactly one account', () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    const { container } = renderIndicator();
    expect(container.innerHTML).toBe('');
  });

  it('renders with two or more accounts, labelled with the active username', () => {
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob' })],
      activeAccountId: 'a1',
    });
    renderIndicator();
    expect(screen.getByLabelText('Switch account (currently alice)')).toBeDefined();
  });

  it('falls back to an initial when the active account has no avatar', () => {
    useAccountsStore.setState({
      accounts: [account({ avatarUrl: null }), account({ id: 'a2', username: 'bob' })],
      activeAccountId: 'a1',
    });
    renderIndicator();
    expect(screen.getByText('A')).toBeDefined();
  });

  it('tapping it opens the account switcher overlay', async () => {
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob' })],
      activeAccountId: 'a1',
    });

    function Probe() {
      const { overlay } = useOverlay();
      return <span>overlay-kind:{overlay.kind ?? 'none'}</span>;
    }

    render(
      <MemoryRouter>
        <OverlayProvider>
          <AccountIndicator />
          <Probe />
        </OverlayProvider>
      </MemoryRouter>,
    );

    await userEvent.click(screen.getByLabelText('Switch account (currently alice)'));
    expect(await screen.findByText('overlay-kind:account-switcher')).toBeDefined();
  });
});
