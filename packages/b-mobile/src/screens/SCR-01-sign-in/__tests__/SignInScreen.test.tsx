// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// SCR-01 has no server-fetched list, so its "four states" are the form's own: idle (loaded),
// authenticating (loading/busy), error, and the OAuthCancelledError case that must return to
// idle rather than surface as an error (a cancelled OAuth round is not a failure).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SignInScreen } from '../SignInScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import * as accountsStore from '../../../state/accountsStore.js';
import type { StoredAccount } from '../../../state/accountsStore.js';
import { AccountMismatchError } from '../../../flows/accountMismatch.js';

// IonAlert stubbed at the @ionic/react boundary (b-oss#193 — Ionic's animated overlays drop clicks
// in jsdom under load). The header is rendered as text too, so the existing explainer assertions
// still find it.
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

const { MockOAuthCancelledError, signInDeliberate, changeAccountMode } = vi.hoisted(() => {
  class MockOAuthCancelledError extends Error {
    constructor(reason: string) {
      super(reason);
      this.name = 'OAuthCancelledError';
    }
  }
  return {
    MockOAuthCancelledError,
    signInDeliberate:
      vi.fn<
        (
          choice: { scope: string; notifications: boolean },
          hooks?: { beforeServiceRound?: () => Promise<boolean> },
        ) => Promise<string>
      >(),
    changeAccountMode: vi.fn<(accountId: string, target: unknown) => Promise<void>>(),
  };
});
vi.mock('../../../flows/accountsFlow.js', () => ({
  signInDeliberate: (choice: unknown, hooks: unknown) =>
    signInDeliberate(choice as never, hooks as never),
  changeAccountMode: (id: string, target: unknown) => changeAccountMode(id, target),
  OAuthCancelledError: MockOAuthCancelledError,
}));

const openUrl = vi.fn<(url: string) => void>();
vi.mock('../../../platform/browser.js', () => ({ openUrl: (url: string) => openUrl(url) }));

// Defaults to false (matching a desktop-browser dev session) so every pre-existing test in this
// file exercises the same "toggle hidden" shape it always has — only the tests that explicitly
// flip this to true are testing the native-only toggle.
let isNative = false;
vi.mock('../../../platform/appState.js', () => ({ isNativePlatform: () => isNative }));

// Defaults true: a Firebase-configured build, so the notifications toggle is usable.
let pushAvailable = true;
vi.mock('../../../platform/push.js', () => ({
  isPushAvailable: () => Promise.resolve(pushAvailable),
}));

const replace = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace, goBack: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  useDevicePrefsStore.setState({ hydrated: false, seenFirstRunExplainer: false });
  isNative = false;
  pushAvailable = true;
  accountsStore.useAccountsStore.setState({ accounts: [], activeAccountId: null });
});

function storedAccount(id: string): StoredAccount {
  return {
    id,
    username: id,
    avatarUrl: null,
    appTokenScope: 'read,write',
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
  };
}

function renderScreen() {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <OverlayHost />
        <SignInScreen />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('SignInScreen', () => {
  it('shows the menu button when signed out, and Back when an account exists (drilled in)', () => {
    const spy = vi.spyOn(accountsStore, 'useActiveAccount').mockReturnValue(null);
    renderScreen();
    expect(screen.queryByLabelText('Back')).toBeNull();
    cleanup();
    spy.mockReturnValue({ username: 'ian' } as never);
    renderScreen();
    expect(document.querySelector('ion-back-button')).not.toBeNull();
    spy.mockRestore();
  });

  it('idle: renders the mode choice defaulted to read-write, notifications off', () => {
    renderScreen();
    expect(screen.getByText('Continue').hasAttribute('disabled')).toBe(false);
    const readWrite = screen.getByLabelText('Read-write');
    expect(readWrite.getAttribute('aria-checked')).not.toBe('false');
  });

  it('authenticating: disables Continue and shows a spinner while the OAuth round is in flight', async () => {
    let resolveSignIn: (value: string) => void = () => {};
    signInDeliberate.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    renderScreen();

    const continueButton = screen.getByText('Continue');
    await userEvent.click(continueButton);
    await waitFor(() => expect(continueButton.hasAttribute('disabled')).toBe(true));
    expect(document.querySelector('ion-spinner')).not.toBeNull();

    resolveSignIn('acct1');
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/accounts'));
  });

  it('loaded: a successful sign-in navigates to /accounts with the chosen scope/notifications', async () => {
    signInDeliberate.mockResolvedValue('acct1');
    renderScreen();

    await userEvent.click(screen.getByLabelText('Read-only'));
    screen
      .getByLabelText('Get notifications')
      .dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }));
    await userEvent.click(screen.getByText('Continue'));

    await waitFor(() =>
      expect(signInDeliberate).toHaveBeenCalledWith(
        {
          scope: 'read',
          notifications: true,
          useEmbedded: false, // off-native there is no embedded browser to use
        },
        expect.anything(), // the beforeServiceRound hook
      ),
    );
    expect(replace).toHaveBeenCalledWith('/accounts');
  });

  it('hides "Use browser to sign in" off-native (web)', () => {
    renderScreen();
    expect(screen.queryByText('Use browser to sign in')).toBeNull();
  });

  it('on native with no accounts yet, defaults to the browser (reuses an existing login)', async () => {
    isNative = true;
    signInDeliberate.mockResolvedValue('acct1');
    renderScreen();

    const toggle = screen.getByLabelText('Use browser to sign in');
    expect((toggle as HTMLIonToggleElement).checked).toBe(true);
    await userEvent.click(screen.getByText('Continue'));

    await waitFor(() =>
      expect(signInDeliberate).toHaveBeenCalledWith(
        expect.objectContaining({ useEmbedded: false }),
        expect.anything(),
      ),
    );
  });

  it('on native with an account already here, defaults to signing in inside the app', async () => {
    isNative = true;
    accountsStore.useAccountsStore.setState({ accounts: [storedAccount('ian')] });
    signInDeliberate.mockResolvedValue('acct1');
    renderScreen();

    const toggle = screen.getByLabelText('Use browser to sign in');
    expect((toggle as HTMLIonToggleElement).checked).toBe(false);
    await userEvent.click(screen.getByText('Continue'));

    await waitFor(() =>
      expect(signInDeliberate).toHaveBeenCalledWith(
        expect.objectContaining({ useEmbedded: true }),
        expect.anything(),
      ),
    );
  });

  it('turning "Use browser to sign in" on uses the system browser (useEmbedded false)', async () => {
    isNative = true;
    accountsStore.useAccountsStore.setState({ accounts: [storedAccount('ian')] });
    signInDeliberate.mockResolvedValue('acct1');
    renderScreen();

    screen
      .getByLabelText('Use browser to sign in')
      .dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }));
    await userEvent.click(screen.getByText('Continue'));

    await waitFor(() =>
      expect(signInDeliberate).toHaveBeenCalledWith(
        expect.objectContaining({ useEmbedded: false }),
        expect.anything(),
      ),
    );
  });

  it('keeps the explanation inside the same item as the toggle it describes', () => {
    isNative = true;
    renderScreen();
    const item = screen.getByLabelText('Use browser to sign in').closest('ion-item')!;
    expect(item.textContent).toContain('already signed in to Blipfoto');
  });

  it('on native without Firebase credentials, disables notifications and never requests them', async () => {
    isNative = true;
    pushAvailable = false;
    signInDeliberate.mockResolvedValue('acct1');
    renderScreen();

    await waitFor(() =>
      expect(screen.getByText('Notifications aren’t available in this build.')).toBeDefined(),
    );
    expect(
      (screen.getByLabelText('Get notifications') as unknown as { disabled: boolean }).disabled,
    ).toBe(true);
    await userEvent.click(screen.getByText('Continue'));

    await waitFor(() =>
      expect(signInDeliberate).toHaveBeenCalledWith(
        expect.objectContaining({ notifications: false }),
        expect.anything(),
      ),
    );
  });

  it('explains the second sign-in before it happens, and Continue proceeds', async () => {
    signInDeliberate.mockImplementation(async (_choice, hooks) => {
      const proceed = await hooks!.beforeServiceRound!();
      return proceed ? 'acct-with-notifications' : 'acct-without';
    });
    renderScreen();
    await userEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('One more sign-in')).toBeDefined());
    // Still waiting on the user — the sign-in hasn't finished, nothing navigated.
    expect(replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Sign in again'));

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/accounts'));
  });

  it('the first account can still choose the in-app browser', async () => {
    isNative = true;
    signInDeliberate.mockResolvedValue('acct1');
    renderScreen();

    screen
      .getByLabelText('Use browser to sign in')
      .dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { checked: false } }));
    await userEvent.click(screen.getByText('Continue'));

    await waitFor(() =>
      expect(signInDeliberate).toHaveBeenCalledWith(
        expect.objectContaining({ useEmbedded: true }),
        expect.anything(),
      ),
    );
  });

  it('a notifications round for another account explains, and Not now goes to Accounts', async () => {
    signInDeliberate.mockRejectedValue(new AccountMismatchError('carol', 'mallory'));
    renderScreen();
    await userEvent.click(screen.getByText('Continue'));

    const dialog = await screen.findByRole('dialog', { name: 'Wrong Blipfoto account' });
    expect(dialog.textContent).toContain(
      'That sign-in was for mallory, not carol. Your browser is signed in to Blipfoto as mallory.',
    );
    expect(replace).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/accounts'));
    expect(changeAccountMode).not.toHaveBeenCalled();
  });

  it('on native, retry redoes just the notifications round in the clean in-app browser', async () => {
    isNative = true;
    accountsStore.useAccountsStore.setState({ accounts: [storedAccount('carol')] });
    signInDeliberate.mockRejectedValue(new AccountMismatchError('carol', 'mallory', true));
    changeAccountMode.mockResolvedValue(undefined);
    renderScreen();
    await userEvent.click(screen.getByText('Continue'));

    const dialog = await screen.findByRole('dialog', { name: 'Wrong Blipfoto account' });
    expect(dialog.textContent).toContain('Sign in as carol to continue.');
    await userEvent.click(screen.getByRole('button', { name: 'Try again in the app' }));

    await waitFor(() =>
      expect(changeAccountMode).toHaveBeenCalledWith('carol', {
        scope: 'read,write',
        notifications: true,
        useEmbedded: true,
      }),
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/accounts'));
  });

  it("the service's own 403 (owner unknown) gets the same explanation", async () => {
    signInDeliberate.mockRejectedValue(new AccountMismatchError('carol', null));
    renderScreen();
    await userEvent.click(screen.getByText('Continue'));
    const dialog = await screen.findByRole('dialog', { name: 'Wrong Blipfoto account' });
    expect(dialog.textContent).toContain(
      'That sign-in was for a different Blipfoto account, not carol.',
    );
  });

  it('error: a real sign-in failure shows the message and stays on the form', async () => {
    signInDeliberate.mockRejectedValue(new Error('Blipfoto is unreachable'));
    renderScreen();

    await userEvent.click(screen.getByText('Continue'));

    expect(await screen.findByText('Blipfoto is unreachable')).toBeDefined();
    expect(replace).not.toHaveBeenCalled();
    // The web component reflects `disabled` to the DOM a tick after React's state changes.
    await waitFor(() => expect(screen.getByText('Continue').hasAttribute('disabled')).toBe(false));
  });

  it('a cancelled OAuth round returns to idle rather than showing an error', async () => {
    signInDeliberate.mockRejectedValue(new MockOAuthCancelledError('browser closed'));
    renderScreen();

    await userEvent.click(screen.getByText('Continue'));

    await waitFor(() => expect(screen.getByText('Continue').hasAttribute('disabled')).toBe(false));
    expect(screen.queryByText(/unreachable|failed/i)).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('opens the Blipfoto site for "Create account"', async () => {
    renderScreen();
    await userEvent.click(screen.getByText('New to Blipfoto? Create account'));
    expect(openUrl).toHaveBeenCalledWith('https://www.blipfoto.com/account/signup');
  });

  it('shows the first-run explainer once, on the first hydrated visit, and marks it seen', async () => {
    useDevicePrefsStore.setState({ hydrated: true, seenFirstRunExplainer: false });
    renderScreen();
    expect(await screen.findByText('Two ways to sign in')).toBeDefined();
    await waitFor(() => expect(useDevicePrefsStore.getState().seenFirstRunExplainer).toBe(true));
  });

  it('does not show the first-run explainer once already seen', () => {
    useDevicePrefsStore.setState({ hydrated: true, seenFirstRunExplainer: true });
    renderScreen();
    expect(screen.queryByText('Two ways to sign in')).toBeNull();
  });

  it('does not show the first-run explainer before devicePrefsStore has hydrated', () => {
    useDevicePrefsStore.setState({ hydrated: false, seenFirstRunExplainer: false });
    renderScreen();
    expect(screen.queryByText('Two ways to sign in')).toBeNull();
  });
});
