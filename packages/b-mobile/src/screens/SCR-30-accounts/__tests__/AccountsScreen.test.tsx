// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// SCR-30 has no server fetch — accounts come synchronously from accountsStore — so its "states"
// are: empty (no accounts), loaded (the list, with the active one badged), and the inline detail
// sub-view (mode change / remove), plus the re-sign-in flow's entry points and dialogs (b-oss#263).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AccountsScreen } from '../AccountsScreen.js';
import { AccountsRoute } from '../../../app/routes/AccountsRoute.js';
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
  function IonToast({ isOpen, message }: { isOpen: boolean; message?: string }) {
    return isOpen ? <div role="status">{message}</div> : null;
  }
  return { ...actual, IonAlert, IonToast };
});

let isNative = false;
vi.mock('../../../platform/appState.js', () => ({ isNativePlatform: () => isNative }));

const {
  MockNeedsReauthError,
  MockOAuthCancelledError,
  switchAccount,
  removeAccount,
  changeAccountMode,
  reauthorizeAccount,
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
    reauthorizeAccount:
      vi.fn<
        (
          accountId: string,
          options: { useEmbedded?: boolean; beforeServiceRound?: () => Promise<boolean> },
        ) => Promise<{ signedIn: boolean }>
      >(),
  };
});
vi.mock('../../../flows/accountsFlow.js', () => ({
  switchAccount: (id: string) => switchAccount(id),
  removeAccount: (id: string) => removeAccount(id),
  changeAccountMode: (id: string, target: unknown) => changeAccountMode(id, target as never),
  reauthorizeAccount: (id: string, options: unknown) => reauthorizeAccount(id, options as never),
  NeedsReauthError: MockNeedsReauthError,
  OAuthCancelledError: MockOAuthCancelledError,
}));

const push = vi.fn();
let mockDrilledIn = false;
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
  useIsDrilledIn: () => mockDrilledIn,
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

/** `reauthFor` stands in for AppRoutes' `/accounts?reauth=<id>` (header switcher, push tap). */
function renderScreen(reauthFor?: string, drilledIn = false) {
  mockDrilledIn = drilledIn;
  return render(
    <MemoryRouter>
      <AccountsScreen
        reauthRequest={reauthFor ? { accountId: reauthFor, key: 'nav-1' } : undefined}
      />
    </MemoryRouter>,
  );
}

describe('AccountsScreen', () => {
  it('opened from the nav menu it has the menu button, not a back arrow (b-oss#273)', () => {
    renderScreen();
    expect(document.querySelector('ion-menu-button')).not.toBeNull();
    expect(document.querySelector('ion-back-button')).toBeNull();
  });

  it('opened from a Settings row (drilledIn) it has a back button (b-oss#165)', () => {
    renderScreen(undefined, true);
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

  it('tapping a needs-reauth account shows the sign-in dialog instead of switching (b-oss#263)', async () => {
    useAccountsStore.setState({
      accounts: [account(), account({ id: 'a2', username: 'bob', appTokenScope: null })],
      activeAccountId: 'a1',
    });
    renderScreen();
    await userEvent.click(screen.getByText('bob'));
    const dialog = await screen.findByRole('dialog', { name: 'bob needs to sign in again' });
    expect(dialog.textContent).toContain("Blipfoto no longer accepts this account's sign-in.");
    expect(switchAccount).not.toHaveBeenCalled();
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
    await userEvent.click(screen.getByText('Switch to read-only'));
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
    reauthorizeAccount.mockResolvedValue({ signedIn: true });
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
    await waitFor(() =>
      expect(reauthorizeAccount).toHaveBeenCalledWith('a1', {
        beforeServiceRound: expect.any(Function) as unknown,
      }),
    );
    expect(changeAccountMode).not.toHaveBeenCalled();
    expect(screen.queryByText('Remove account')).toBeNull();
  });

  it('Sign in again as the wrong account explains, and retry uses the in-app browser (b-oss#240)', async () => {
    isNative = true;
    reauthorizeAccount.mockRejectedValueOnce(new AccountMismatchError('alice', 'bob'));
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
    reauthorizeAccount.mockResolvedValue({ signedIn: true });
    await userEvent.click(screen.getByRole('button', { name: 'Try again in the app' }));

    await waitFor(() =>
      expect(reauthorizeAccount).toHaveBeenLastCalledWith(
        'a1',
        expect.objectContaining({ useEmbedded: true }),
      ),
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
    await userEvent.click(screen.getByText('Switch to read-write'));
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

  describe('signing in again (b-oss#263)', () => {
    const dead = () => account({ id: 'a2', username: 'bob', appTokenScope: null });
    const deadNotifications = () =>
      account({
        id: 'a3',
        username: 'carol',
        notificationRegistrationId: 'r3',
        notificationStatus: 'read-token-invalid',
      });

    /** reauthorizeAccount's stand-in: does what the real one does to the store on success. */
    function succeedFor(id: string) {
      reauthorizeAccount.mockImplementation((accountId) => {
        useAccountsStore.getState().updateAccount(accountId, { appTokenScope: 'read,write' });
        useAccountsStore.getState().setActiveAccountId(id);
        return Promise.resolve({ signedIn: true });
      });
    }

    it('shows needs-sign-in statuses red and bold, each with Sign in again on the row', () => {
      useAccountsStore.setState({
        accounts: [account(), dead(), deadNotifications()],
        activeAccountId: 'a1',
      });
      renderScreen();
      for (const text of ['Needs sign-in', 'Notifications: needs sign-in']) {
        const status = screen.getByText(text);
        expect(status.style.color).toBe('var(--ion-color-danger)');
        expect(status.style.fontWeight).toBe('700');
      }
      expect(screen.getByText('Notifications: off').style.color).not.toBe(
        'var(--ion-color-danger)',
      );
      expect(screen.getAllByText('Sign in again')).toHaveLength(2);
    });

    it('dialog → Sign in runs the re-sign-in, then confirms with a toast, staying on Accounts', async () => {
      succeedFor('a2');
      useAccountsStore.setState({ accounts: [account(), dead()], activeAccountId: 'a1' });
      renderScreen();
      await userEvent.click(screen.getByText('bob'));
      await screen.findByRole('dialog', { name: 'bob needs to sign in again' });
      await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

      await waitFor(() => expect(reauthorizeAccount).toHaveBeenCalledWith('a2', expect.anything()));
      expect((await screen.findByRole('status')).textContent).toBe('bob is signed in again');
      expect(useAccountsStore.getState().activeAccountId).toBe('a2');
      expect(screen.getByText('Add account')).toBeDefined(); // the list, not the detail view
      expect(screen.queryByText('Remove account')).toBeNull();
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('dialog → Cancel changes nothing', async () => {
      useAccountsStore.setState({ accounts: [account(), dead()], activeAccountId: 'a1' });
      renderScreen();
      await userEvent.click(screen.getByText('bob'));
      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(reauthorizeAccount).not.toHaveBeenCalled();
    });

    it("the row's own Sign in again skips the dialog", async () => {
      succeedFor('a2');
      useAccountsStore.setState({ accounts: [account(), dead()], activeAccountId: 'a1' });
      renderScreen();
      await userEvent.click(screen.getByText('Sign in again'));
      await waitFor(() => expect(reauthorizeAccount).toHaveBeenCalledWith('a2', expect.anything()));
      expect(screen.queryByRole('dialog', { name: 'bob needs to sign in again' })).toBeNull();
    });

    it('tapping a red notifications status shows the same dialog', async () => {
      useAccountsStore.setState({
        accounts: [account(), deadNotifications()],
        activeAccountId: 'a1',
      });
      renderScreen();
      await userEvent.click(screen.getByText('Notifications: needs sign-in'));
      expect(
        await screen.findByRole('dialog', { name: 'carol needs to sign in again' }),
      ).toBeDefined();
      expect(push).not.toHaveBeenCalled();
      expect(switchAccount).not.toHaveBeenCalled();
    });

    it('opened as /accounts?reauth=<id> (header switcher, reauth-required push) shows that account’s dialog', async () => {
      useAccountsStore.setState({ accounts: [account(), dead()], activeAccountId: 'a1' });
      renderScreen('a2');
      expect(
        await screen.findByRole('dialog', { name: 'bob needs to sign in again' }),
      ).toBeDefined();
    });

    it('the /accounts route turns ?reauth=<id> into that request', async () => {
      useAccountsStore.setState({ accounts: [account(), dead()], activeAccountId: 'a1' });
      render(
        <MemoryRouter initialEntries={['/accounts?reauth=a2']}>
          <Routes>
            <Route path="/accounts" element={<AccountsRoute />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(
        await screen.findByRole('dialog', { name: 'bob needs to sign in again' }),
      ).toBeDefined();
    });

    it('?reauth= for an account that no longer needs it shows nothing', () => {
      useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1' });
      renderScreen('a1');
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('"One more sign-in" names the account; Continue goes ahead', async () => {
      let answer: boolean | undefined;
      reauthorizeAccount.mockImplementation(async (_id, options) => {
        answer = await options.beforeServiceRound?.();
        return { signedIn: true };
      });
      useAccountsStore.setState({ accounts: [account(), dead()], activeAccountId: 'a1' });
      renderScreen();
      await userEvent.click(screen.getByText('Sign in again'));
      const explainer = await screen.findByRole('dialog', { name: 'One more sign-in' });
      expect(explainer.textContent).toContain(
        'To turn notifications back on for bob, Blipfoto needs you to approve one more sign-in.',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Continue' }));
      await waitFor(() => expect(answer).toBe(true));
      expect((await screen.findByRole('status')).textContent).toBe('bob is signed in again');
    });

    it('"One more sign-in" → Not now still confirms the app sign-in', async () => {
      let answer: boolean | undefined;
      reauthorizeAccount.mockImplementation(async (_id, options) => {
        answer = await options.beforeServiceRound?.();
        return { signedIn: true };
      });
      useAccountsStore.setState({ accounts: [account(), dead()], activeAccountId: 'a1' });
      renderScreen();
      await userEvent.click(screen.getByText('Sign in again'));
      await screen.findByRole('dialog', { name: 'One more sign-in' });
      await userEvent.click(screen.getByRole('button', { name: 'Not now' }));
      await waitFor(() => expect(answer).toBe(false));
      expect((await screen.findByRole('status')).textContent).toBe('bob is signed in again');
    });

    it('no toast when nothing was signed in (notifications-only, Not now)', async () => {
      reauthorizeAccount.mockResolvedValue({ signedIn: false });
      useAccountsStore.setState({ accounts: [deadNotifications()], activeAccountId: 'a3' });
      renderScreen();
      await userEvent.click(screen.getByText('Sign in again'));
      await waitFor(() => expect(reauthorizeAccount).toHaveBeenCalled());
      expect(screen.queryByRole('status')).toBeNull();
    });

    it('a needs-reauth account can still be removed from its row', async () => {
      removeAccount.mockResolvedValue(undefined);
      useAccountsStore.setState({ accounts: [account(), dead()], activeAccountId: 'a1' });
      renderScreen();
      await userEvent.click(screen.getByText('Remove'));
      const dialog = await screen.findByRole('dialog', { name: 'Remove account?' });
      expect(dialog.textContent).toContain("bob's access");
      await userEvent.click(within(dialog).getByRole('button', { name: 'Remove' }));
      await waitFor(() => expect(removeAccount).toHaveBeenCalledWith('a2'));
    });
  });

  describe('account detail (b-oss#263)', () => {
    it('has the app header with a back arrow, shows the username once, and no Make active', async () => {
      useAccountsStore.setState({
        accounts: [account(), account({ id: 'a2', username: 'bob' })],
        activeAccountId: 'a1',
      });
      renderScreen();
      await userEvent.click(screen.getByText('alice'));
      await screen.findByText('Remove account');
      expect(document.querySelector('ion-back-button')).not.toBeNull();
      expect(screen.getAllByText('alice')).toHaveLength(1);
      expect(screen.queryByText('Make active')).toBeNull();
      expect(screen.queryByText('Switch to read-write')).toBeNull(); // only the other mode
    });

    it('Back returns to the list without re-opening any dialog', async () => {
      useAccountsStore.setState({
        accounts: [account(), account({ id: 'a2', username: 'bob', appTokenScope: null })],
        activeAccountId: 'a1',
      });
      renderScreen('a2');
      await userEvent.click(
        within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }),
      );
      await userEvent.click(screen.getByText('alice'));
      await screen.findByText('Remove account');
      await userEvent.click(document.querySelector('ion-back-button') as HTMLElement);
      expect(await screen.findByText('Add account')).toBeDefined();
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
