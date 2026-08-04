// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { RefusedFollowersScreen } from '../RefusedFollowersScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';

vi.mock('../../../data/users.js', () => ({
  fetchBlockedUsers: vi.fn(),
}));

const { restoreAccess } = vi.hoisted(() => ({ restoreAccess: vi.fn() }));
vi.mock('../../../flows/connectionsFlow.js', () => ({ restoreAccess }));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const readWrite = {
  id: 'a1',
  username: 'me',
  avatarUrl: null,
  appTokenScope: 'read,write' as const,
  hasServiceToken: false,
  notificationRegistrationId: null,
  notificationStatus: null,
};

beforeEach(() => {
  useAccountsStore.setState({ accounts: [readWrite], activeAccountId: 'a1', hydrated: true });
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <OverlayHost />
        <RefusedFollowersScreen />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('RefusedFollowersScreen', () => {
  it('loading: shows a spinner while the list fetch is in flight', async () => {
    const { fetchBlockedUsers } = await import('../../../data/users.js');
    vi.mocked(fetchBlockedUsers).mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
  });

  it('error: shows the failure message with a Retry that reloads the list', async () => {
    const { fetchBlockedUsers } = await import('../../../data/users.js');
    vi.mocked(fetchBlockedUsers).mockRejectedValueOnce(new Error('Network down'));
    renderScreen();
    expect(await screen.findByText('Network down')).toBeDefined();

    vi.mocked(fetchBlockedUsers).mockResolvedValue({ items: [], more: false });
    await userEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('You haven’t refused anyone.')).toBeDefined();
  });

  it('makes no fetch beyond the list itself and shows the paired explainer', async () => {
    const { fetchBlockedUsers } = await import('../../../data/users.js');
    vi.mocked(fetchBlockedUsers).mockResolvedValue({ items: [], more: false });
    renderScreen();
    expect(
      await screen.findByText(
        'They can’t see your journal. This doesn’t hide their entries from you.',
      ),
    ).toBeDefined();
    expect(await screen.findByText('You haven’t refused anyone.')).toBeDefined();
  });

  it('allow restores access immediately, with no confirmation', async () => {
    const { fetchBlockedUsers } = await import('../../../data/users.js');
    vi.mocked(fetchBlockedUsers).mockResolvedValue({
      items: [{ username: 'spammer1', avatar_url: '', icons: [] }],
      more: false,
    });
    restoreAccess.mockResolvedValue(undefined);
    renderScreen();
    await userEvent.click(await screen.findByText('Allow'));
    await waitFor(() => expect(restoreAccess).toHaveBeenCalledWith('spammer1'));
  });

  it('marks a member who is also hidden, without merging the two states', async () => {
    useHiddenMembersStore.setState({ hiddenByAccount: { a1: ['spammer1'] }, hydrated: true });
    const { fetchBlockedUsers } = await import('../../../data/users.js');
    vi.mocked(fetchBlockedUsers).mockResolvedValue({
      items: [{ username: 'spammer1', avatar_url: '', icons: [] }],
      more: false,
    });
    renderScreen();
    expect(await screen.findByText('spammer1')).toBeDefined();
    expect(screen.getByText('also hidden')).toBeDefined();
  });

  it('shows the upgrade prompt instead of acting for a read-only account', async () => {
    useAccountsStore.setState({
      accounts: [{ ...readWrite, appTokenScope: 'read' }],
      activeAccountId: 'a1',
      hydrated: true,
    });
    const { fetchBlockedUsers } = await import('../../../data/users.js');
    vi.mocked(fetchBlockedUsers).mockResolvedValue({
      items: [{ username: 'spammer1', avatar_url: '', icons: [] }],
      more: false,
    });
    renderScreen();
    await userEvent.click(await screen.findByText('Allow'));
    expect(await screen.findByText('Read-only account')).toBeDefined();
    expect(restoreAccess).not.toHaveBeenCalled();
  });
});
