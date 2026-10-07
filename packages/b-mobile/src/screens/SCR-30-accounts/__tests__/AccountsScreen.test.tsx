// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// SCR-30 has no server fetch — accounts come synchronously from accountsStore — so its "states"
// are: empty (no accounts), loaded (the list, with the active one badged), and the inline detail
// sub-view (mode change / remove), plus the NeedsReauthError path switchAccount() can throw.

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { AccountsScreen } from '../AccountsScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import type { StoredAccount } from '../../../state/accountsStore.js';
import { AccountMismatchError } from '../../../flows/accountMismatch.js';

// IonAlert stubbed at the @ionic/react boundary (b-oss#193 — Ionic's animated overlays drop clicks
// in jsdom under load). The header is rendered as text so it can be found either way.
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  interface StubButton {
    text: string;
    role?: string;
    handler?: () => void;
  }
  function IonAlert({
    isOpen,
    header,
    message,
    buttons = [],
    onDidDismiss,
  }: {
    isOpen: boolean;
    header?: string;
    message?: string;
    buttons?: StubButton[];
    onDidDismiss?: () => void;
  }) {
    if (!isOpen) return null;
    return (
      <div role="dialog" aria-label={header}>
        <h2>{header}</h2>
        {message && <p>{message}</p>}
        {buttons.map((b) => (
          <button
            key={b.text}
            onClick={() => {
              b.handler?.();
              onDidDismiss?.();
            }}
          >
            {b.text}
          </button>
        ))}
      </div>
    );
  }
  return { ...actual, IonAlert };
});

let isNative = false;
vi.mock('../../../platform/appState.js', () => ({ isNativePlatform: () => isNative }));

const {
  MockNeedsReauthError,
  MockOAuthCancelledError,
  switchAccount,
  removeAccount,
  changeAccountMode,
  recoverNotifications,
} = vi.hoisted(() => {
  class MockOAuthCancelledError extends Error {}
  class MockNeedsReauthError extends Error {
    constructor(public readonly accountId: string) {
      super(`Account ${accountId} needs re-authorization`);
      this.name = 'NeedsReauthError';
    }
  }
  return {
    MockNeedsReauthError,
    MockOAuthCancelledError,
    switchAccount: vi.fn<(accountId: string) => void>(),
    removeAccount: vi.fn<(accountId: string) => Promise<void>>(),
    changeAccountMode:
      vi.fn<
        (accountId: string, target: { scope: string; notifications: boolean }) => Promise<void>
      >(),
    recoverNotifications:
      vi.fn<(accountId: string, options: { useEmbedded?: boolean }) => Promise<void>>(),
  };
});
vi.mock('../../../flows/accountsFlow.js', () => ({
  switchAccount: (id: string) => switchAccount(id),
  removeAccount: (id: string) => removeAccount(id),
  changeAccountMode: (id: string, target: unknown) => changeAccountMode(id, target as never),
  recoverNotifications: (id: string, options: unknown) =>
    recoverNotifications(id, options as never),
  NeedsReauthError: MockNeedsReauthError,
  OAuthCancelledError: MockOAuthCancelledError,
}));

const push = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  useAccountsStore.setState({ accounts: [], activeAccountId: null });
  isNative = false;
});

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

function renderScreen() {
  return render(
    <MemoryRouter>
      <AccountsScreen />
    </MemoryRouter>,
  );
}

describe('AccountsScreen', () => {
  it('has a back button (reached from Settings), not the nav menu button (b-oss#165)', () => {
    renderScreen();
    expect(document.querySelector('ion-back-button')).not.toBeNull();
    expect(document.querySelector('ion-menu-button')).toBeNull();
  });

  it('empty: shows only "+ Add account" with no accounts configured', () => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null });
    renderScreen();
    expect(screen.getByText('Add account')).toBeDefined();
    expect(screen.queryByText('alice')).toBeNull();
  });

  it('loaded: lists every account, badging the active one', () => {
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob', appTokenScope: 'read' })],
      activeAccountId: 'a1',
    });
    renderScreen();
    expect(screen.getByText('alice')).toBeDefined();
    expect(screen.getByText('bob')).toBeDefined();
    expect(screen.getByText(/Active/)).toBeDefined();
    expect(screen.getByText('Read-only')).toBeDefined();
  });

  it('"+ Add account" navigates to sign-in', async () => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null });
    renderScreen();
    await userEvent.click(screen.getByText('Add account'));
    expect(push).toHaveBeenCalledWith('/sign-in');
  });

  it('tapping an inactive account switches to it', async () => {
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob' })],
      activeAccountId: 'a1',
    });
    renderScreen();
    await userEvent.click(screen.getByText('bob'));
    expect(switchAccount).toHaveBeenCalledWith('a2');
  });

  it('a NeedsReauthError on switch shows the re-authorize prompt instead of throwing', async () => {
    switchAccount.mockImplementation(() => {
      throw new MockNeedsReauthError('a2');
    });
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob', appTokenScope: null })],
      activeAccountId: 'a1',
    });
    renderScreen();
    await userEvent.click(screen.getByText('bob'));
    expect(await screen.findByText('Needs re-authorization')).toBeDefined();
  });

  it('tapping the active account opens its detail view', async () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    renderScreen();
    await userEvent.click(screen.getByText('alice'));
    expect(await screen.findByText('Remove account')).toBeDefined();
    expect(screen.getByText('Mode')).toBeDefined();
  });

  it('detail view: removing an account calls removeAccount and returns to the list', async () => {
    removeAccount.mockResolvedValue(undefined);
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    renderScreen();
    await userEvent.click(screen.getByText('alice'));
    await userEvent.click(screen.getByText('Remove account'));
    await screen.findByRole('dialog', { name: 'Remove account?' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(removeAccount).toHaveBeenCalledWith('a1'));
    expect(await screen.findByText('Add account')).toBeDefined();
  });

  it('detail view: changing mode calls changeAccountMode with the chosen scope', async () => {
    changeAccountMode.mockResolvedValue(undefined);
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    renderScreen();
    await userEvent.click(screen.getByText('alice'));
    await userEvent.click(screen.getByText('Read-only'));
    await waitFor(() =>
      expect(changeAccountMode).toHaveBeenCalledWith('a1', { scope: 'read', notifications: false }),
    );
  });

  it('shows a notification status per account, and no notifications on/off button (b-oss#244)', () => {
    useAccountsStore.setState({
      accounts: [
        account({ hasServiceToken: true, notificationRegistrationId: 'r1' }),
        account({ id: 'a2', username: 'bob' }),
        account({
          id: 'a3',
          username: 'carol',
          notificationRegistrationId: 'r3',
          notificationStatus: 'read-token-invalid',
        }),
      ],
      activeAccountId: 'a1',
    });
    renderScreen();
    expect(screen.getByText('Notifications: on')).toBeDefined();
    expect(screen.getByText('Notifications: off')).toBeDefined();
    expect(screen.getByText('Notifications: needs sign-in')).toBeDefined();
    expect(screen.queryByText(/Turn notifications/)).toBeNull();
  });

  it('the detail view has no notifications on/off button either', async () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    renderScreen();
    await userEvent.click(screen.getByText('alice'));
    await screen.findByText('Remove account');
    expect(screen.queryByText(/Turn notifications/)).toBeNull();
    expect(screen.getByText('Notifications: off')).toBeDefined();
  });

  it('tapping a status switches to that account and opens its notification settings', async () => {
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob' })],
      activeAccountId: 'a1',
    });
    renderScreen();
    const bobStatus = screen.getAllByText('Notifications: off')[1];
    await userEvent.click(bobStatus);
    expect(switchAccount).toHaveBeenCalledWith('a2');
    expect(switchAccount).toHaveBeenCalledTimes(1); // not also the row's own tap
    expect(push).toHaveBeenCalledWith('/settings/notifications');
  });

  it('tapping the active account’s status opens settings without switching', async () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    renderScreen();
    await userEvent.click(screen.getByText('Notifications: off'));
    expect(switchAccount).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith('/settings/notifications');
    expect(screen.queryByText('Remove account')).toBeNull(); // didn't open the detail view
  });

  it('an account with a dead notification token offers Sign in again, running the recovery flow', async () => {
    recoverNotifications.mockResolvedValue(undefined);
    useAccountsStore.setState({
      accounts: [
        account({
          notificationRegistrationId: 'r1',
          notificationStatus: 'read-token-invalid',
        }),
      ],
      activeAccountId: 'a1',
    });
    renderScreen();
    await userEvent.click(screen.getByText('Sign in again'));
    await waitFor(() => expect(recoverNotifications).toHaveBeenCalledWith('a1', {}));
    expect(changeAccountMode).not.toHaveBeenCalled();
    expect(screen.queryByText('Remove account')).toBeNull();
  });

  it('Sign in again as the wrong account explains, and retry uses the in-app browser (b-oss#240)', async () => {
    isNative = true;
    recoverNotifications.mockRejectedValueOnce(new AccountMismatchError('alice', 'bob'));
    useAccountsStore.setState({
      accounts: [
        account({ notificationRegistrationId: 'r1', notificationStatus: 'read-token-invalid' }),
      ],
      activeAccountId: 'a1',
    });
    renderScreen();
    await userEvent.click(screen.getByText('Sign in again'));

    const dialog = await screen.findByRole('dialog', { name: 'Wrong Blipfoto account' });
    expect(dialog.textContent).toContain('That sign-in was for bob, not alice.');
    recoverNotifications.mockResolvedValue(undefined);
    await userEvent.click(screen.getByRole('button', { name: 'Try again in the app' }));

    await waitFor(() =>
      expect(recoverNotifications).toHaveBeenLastCalledWith('a1', { useEmbedded: true }),
    );
    expect(screen.queryByText(/Sign-in failed/)).toBeNull();
  });

  it('a mode change that comes back as another account explains it (b-oss#240)', async () => {
    changeAccountMode.mockRejectedValueOnce(new AccountMismatchError('alice', 'bob'));
    useAccountsStore.setState({
      accounts: [account({ appTokenScope: 'read' })],
      activeAccountId: 'a1',
    });
    renderScreen();
    await userEvent.click(screen.getByText('alice'));
    await userEvent.click(screen.getByText('Read-write'));
    const dialog = await screen.findByRole('dialog', { name: 'Wrong Blipfoto account' });
    expect(dialog.textContent).toContain('Your browser is signed in to Blipfoto as bob.');
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(changeAccountMode).toHaveBeenCalledTimes(1);
  });

  it('no Sign in again for accounts whose notifications are simply off', () => {
    useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
    renderScreen();
    expect(screen.queryByText('Sign in again')).toBeNull();
  });
});
