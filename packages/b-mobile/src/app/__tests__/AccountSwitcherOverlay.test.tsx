// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// rules.md, "Multi-account clarity" — "Tapping an inactive account switches to it instantly, per
// FLW-21 — the same underlying mechanism SCR-30 uses" and "A Manage accounts row at the bottom
// opens SCR-30".

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountSwitcherOverlay } from '../AccountSwitcherOverlay.js';
import { useAccountsStore } from '../../state/accountsStore.js';
import type { StoredAccount } from '../../state/accountsStore.js';

const { MockNeedsReauthError, switchAccount } = vi.hoisted(() => {
  class MockNeedsReauthError extends Error {
    constructor(public readonly accountId: string) {
      super(`Account ${accountId} needs re-authorization`);
      this.name = 'NeedsReauthError';
    }
  }
  return { MockNeedsReauthError, switchAccount: vi.fn<(accountId: string) => void>() };
});
vi.mock('../../flows/accountsFlow.js', () => ({
  switchAccount: (id: string) => switchAccount(id),
  NeedsReauthError: MockNeedsReauthError,
}));

const push = vi.fn();
vi.mock('../routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
}));

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
  vi.resetAllMocks();
  useAccountsStore.setState({ accounts: [], activeAccountId: null });
});

function renderOverlay(onDismiss = vi.fn()) {
  return { onDismiss, ...render(<AccountSwitcherOverlay onDismiss={onDismiss} />) };
}

describe('AccountSwitcherOverlay', () => {
  it('lists every stored account with its mode, badging the active one', () => {
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob', appTokenScope: 'read' })],
      activeAccountId: 'a1',
    });
    renderOverlay();
    expect(screen.getByText('alice')).toBeDefined();
    expect(screen.getByText('bob')).toBeDefined();
    expect(screen.getByText('active')).toBeDefined();
    expect(screen.getByText('Read-only')).toBeDefined();
  });

  it('tapping the already-active account just dismisses, without switching', async () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    const { onDismiss } = renderOverlay();
    await userEvent.click(screen.getByText('alice'));
    expect(switchAccount).not.toHaveBeenCalled();
    expect(onDismiss).toHaveBeenCalled();
  });

  it('tapping an inactive account switches to it and dismisses', async () => {
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob' })],
      activeAccountId: 'a1',
    });
    const { onDismiss } = renderOverlay();
    await userEvent.click(screen.getByText('bob'));
    expect(switchAccount).toHaveBeenCalledWith('a2');
    expect(onDismiss).toHaveBeenCalled();
  });

  it('a NeedsReauthError dismisses and routes to SCR-30 instead of throwing', async () => {
    switchAccount.mockImplementation(() => {
      throw new MockNeedsReauthError('a2');
    });
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob', appTokenScope: null })],
      activeAccountId: 'a1',
    });
    const { onDismiss } = renderOverlay();
    await userEvent.click(screen.getByText('bob'));
    expect(onDismiss).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/accounts');
  });

  it('"Manage accounts" dismisses and opens SCR-30', async () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    const { onDismiss } = renderOverlay();
    await userEvent.click(screen.getByText('Manage accounts'));
    expect(onDismiss).toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/accounts');
  });

  it('tapping the backdrop dismisses without switching or navigating', async () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    const onDismiss = vi.fn();
    const { container } = render(<AccountSwitcherOverlay onDismiss={onDismiss} />);
    // The backdrop is the component's first rendered element, ahead of the menu panel — see
    // AccountSwitcherOverlay.tsx's own fragment order.
    await userEvent.click(container.firstElementChild as Element);
    expect(onDismiss).toHaveBeenCalled();
    expect(switchAccount).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });
});
