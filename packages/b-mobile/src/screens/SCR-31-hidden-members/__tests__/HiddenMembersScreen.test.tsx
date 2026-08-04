// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
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
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <HiddenMembersScreen />
    </MemoryRouter>,
  );
}

describe('HiddenMembersScreen', () => {
  it('makes no network request and shows the empty state when nobody is hidden', () => {
    renderScreen();
    expect(screen.getByText('You haven’t hidden anyone.')).toBeDefined();
  });

  it('lists hidden members and unhides one immediately, with no confirmation', async () => {
    useHiddenMembersStore.setState({ hiddenByAccount: { a1: ['bob', 'carol'] }, hydrated: true });
    renderScreen();
    expect(screen.getByText('bob')).toBeDefined();
    expect(screen.getByText('carol')).toBeDefined();

    const unhideButtons = screen.getAllByText('Unhide');
    await userEvent.click(unhideButtons[0]);

    expect(useHiddenMembersStore.getState().hiddenByAccount.a1).toEqual(['carol']);
  });

  it('switches the list shown when the active account switches', () => {
    useHiddenMembersStore.setState({
      hiddenByAccount: { a1: ['bob'], a2: ['dave'] },
      hydrated: true,
    });
    const { rerender } = renderScreen();
    expect(screen.getByText('bob')).toBeDefined();
    expect(screen.queryByText('dave')).toBeNull();

    useAccountsStore.setState({ activeAccountId: 'a2' });
    rerender(
      <MemoryRouter>
        <HiddenMembersScreen />
      </MemoryRouter>,
    );
    expect(screen.getByText('dave')).toBeDefined();
    expect(screen.queryByText('bob')).toBeNull();
  });
});
