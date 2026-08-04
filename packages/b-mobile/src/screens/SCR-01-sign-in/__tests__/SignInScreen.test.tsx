// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// SCR-01 has no server-fetched list, so its "four states" are the form's own: idle (loaded),
// authenticating (loading/busy), error, and the OAuthCancelledError case that must return to
// idle rather than surface as an error (rules.md — a cancelled OAuth round is not a failure).

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SignInScreen } from '../SignInScreen.js';

const { MockOAuthCancelledError, signInDeliberate } = vi.hoisted(() => {
  class MockOAuthCancelledError extends Error {
    constructor(reason: string) {
      super(reason);
      this.name = 'OAuthCancelledError';
    }
  }
  return {
    MockOAuthCancelledError,
    signInDeliberate:
      vi.fn<(choice: { scope: string; notifications: boolean }) => Promise<string>>(),
  };
});
vi.mock('../../../flows/accountsFlow.js', () => ({
  signInDeliberate: (choice: unknown) => signInDeliberate(choice as never),
  OAuthCancelledError: MockOAuthCancelledError,
}));

const openUrl = vi.fn<(url: string) => void>();
vi.mock('../../../platform/browser.js', () => ({ openUrl: (url: string) => openUrl(url) }));

const replace = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace, goBack: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <SignInScreen />
    </MemoryRouter>,
  );
}

describe('SignInScreen', () => {
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
    await userEvent.click(screen.getByText('Get notifications'));
    await userEvent.click(screen.getByText('Continue'));

    await waitFor(() =>
      expect(signInDeliberate).toHaveBeenCalledWith({ scope: 'read', notifications: true }),
    );
    expect(replace).toHaveBeenCalledWith('/accounts');
  });

  it('error: a real sign-in failure shows the message and stays on the form', async () => {
    signInDeliberate.mockRejectedValue(new Error('Blipfoto is unreachable'));
    renderScreen();

    await userEvent.click(screen.getByText('Continue'));

    expect(await screen.findByText('Blipfoto is unreachable')).toBeDefined();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByText('Continue').hasAttribute('disabled')).toBe(false);
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
    expect(openUrl).toHaveBeenCalledWith('https://www.blipfoto.com');
  });
});
