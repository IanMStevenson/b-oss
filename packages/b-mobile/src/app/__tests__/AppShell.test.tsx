// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { AppShell } from '../AppShell.js';
import { useAccountsStore } from '../../state/accountsStore.js';

afterEach(() => {
  cleanup();
  useAccountsStore.setState({ accounts: [], activeAccountId: null });
  window.history.pushState({}, '', '/');
});

describe('AppShell', () => {
  it('boots to the Browse route by default', async () => {
    render(<AppShell />);
    expect(await screen.findAllByText(/Browse/)).not.toHaveLength(0);
  });

  it('does not open the nav menu on an edge swipe — only from the header button (b-oss#166)', async () => {
    render(<AppShell />);
    await screen.findAllByText(/Browse/);
    const menu = document.querySelector('ion-menu') as unknown as { swipeGesture: boolean };
    expect(menu.swipeGesture).toBe(false);
  });

  // IonRouterOutlet (Ionic 9) reads its routes from its own children, so a route table the
  // outlet can't see into renders a blank page — these exercise real URLs through it.
  it('renders a plain route, a param route and nothing for an unknown path', async () => {
    window.history.pushState({}, '', '/accounts');
    render(<AppShell />);
    expect(await screen.findByText('Add account')).toBeDefined();
    cleanup();

    window.history.pushState({}, '', '/help/licences');
    render(<AppShell />);
    expect(await screen.findByText('Open-source licences')).toBeDefined();
    cleanup();

    window.history.pushState({}, '', '/nope');
    render(<AppShell />);
    await waitFor(() => expect(document.querySelector('ion-router-outlet')!.innerHTML).toBe(''));
  });

  it('keeps no view stack: the page you navigate away from is unmounted, not hidden behind (b-oss#183)', async () => {
    window.history.pushState({}, '', '/accounts');
    render(<AppShell />);
    await screen.findByText('Add account');

    window.history.pushState({}, '', '/help/licences');
    window.dispatchEvent(new PopStateEvent('popstate'));
    await screen.findByText('Open-source licences');
    await waitFor(() =>
      expect(document.querySelectorAll('ion-router-outlet .ion-page')).toHaveLength(1),
    );
    expect(screen.queryByText('Add account')).toBeNull();
  });

  describe('drawer (b-oss#273)', () => {
    function signIn() {
      useAccountsStore.setState({
        accounts: [
          {
            id: 'a1',
            username: 'alice',
            avatarUrl: null,
            appTokenScope: 'read,write',
            hasServiceToken: false,
            notificationRegistrationId: null,
            notificationStatus: null,
          },
        ],
        activeAccountId: 'a1',
      });
    }

    it('shows the active account at the top and links it to Accounts', async () => {
      signIn();
      window.history.pushState({}, '', '/help');
      render(<AppShell />);
      const block = await screen.findByLabelText(/^Account: alice/);
      expect(block.getAttribute('href') ?? block.getAttribute('router-link')).toBe('/accounts');
      expect(block.textContent).toContain('alice');
      expect(block.textContent).toContain('Read-write');
    });

    it('marks only the current destination and groups the rest with separators', async () => {
      signIn();
      window.history.pushState({}, '', '/settings/general');
      render(<AppShell />);
      await screen.findByLabelText(/^Account: alice/);
      const current = document.querySelectorAll('ion-menu [aria-current="page"]');
      expect(current).toHaveLength(1);
      expect(current[0].textContent).toContain('Settings');
      expect(
        document.querySelectorAll('ion-menu [role="separator"]').length,
      ).toBeGreaterThanOrEqual(3);
    });

    it('signed out: no account block, a Sign in item instead', async () => {
      window.history.pushState({}, '', '/help');
      render(<AppShell />);
      await screen.findAllByText('Help & Info');
      expect(screen.queryByLabelText(/^Account:/)).toBeNull();
      expect(screen.getByText('Sign in')).toBeDefined();
    });
  });
});
