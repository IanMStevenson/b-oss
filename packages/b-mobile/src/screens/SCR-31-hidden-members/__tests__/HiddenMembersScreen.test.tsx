// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { OverlayProvider } from '../../../app/OverlayProvider.js';
import { HiddenMembersScreen } from '../HiddenMembersScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useAccountsStore.setState({
    accounts: [
      {
        id: 'a1',
        username: 'me',
        avatarUrl: null,
        appTokenScope: 'read,write',
        hasServiceToken: false,
        notificationRegistrationId: null,
        notificationStatus: null,
      },
    ],
    activeAccountId: 'a1',
    hydrated: true,
  });
  useHiddenMembersStore.setState({ hidden: [], hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen(drilledIn = false) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: '/hidden', state: drilledIn ? { drilledIn } : null }]}
    >
      <OverlayProvider>
        <HiddenMembersScreen />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('HiddenMembersScreen', () => {
  it('has the menu button when opened from the nav menu, a back arrow when drilled in from Settings', () => {
    renderScreen();
    expect(document.querySelector('ion-menu-button')).not.toBeNull();
    expect(document.querySelector('ion-back-button')).toBeNull();
    cleanup();
    renderScreen(true);
    expect(document.querySelector('ion-back-button')).not.toBeNull();
    expect(document.querySelector('ion-menu-button')).toBeNull();
  });

  it('makes no network request and shows the empty state when nobody is hidden', () => {
    renderScreen();
    expect(screen.getByText('You haven’t hidden anyone.')).toBeDefined();
    expect(screen.getByText(/can still see your journal/)).toBeDefined();
    expect(screen.queryByText('Unhide')).toBeNull();
  });

  it('lists hidden members and unhides one immediately, with no confirmation', async () => {
    useHiddenMembersStore.setState({ hidden: ['bob', 'carol'], hydrated: true });
    renderScreen();
    expect(screen.getByText('bob')).toBeDefined();
    expect(screen.getByText('carol')).toBeDefined();

    const unhideButtons = screen.getAllByText('Unhide');
    await userEvent.click(unhideButtons[0]);

    expect(useHiddenMembersStore.getState().hidden).toEqual(['carol']);
  });

  it('shows the same installation-wide list whichever account is active, or none', () => {
    useHiddenMembersStore.setState({ hidden: ['bob'], hydrated: true });
    const { rerender } = renderScreen();
    expect(screen.getByText('bob')).toBeDefined();

    useAccountsStore.setState({ activeAccountId: null });
    rerender(
      <MemoryRouter>
        <OverlayProvider>
          <HiddenMembersScreen />
        </OverlayProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('bob')).toBeDefined();
  });
});
