// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { PendingRequestsScreen } from '../PendingRequestsScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { t } from '../../../strings/index.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';

vi.mock('../../../data/users.js', () => ({
  fetchPendingRequests: vi.fn(),
}));

const { approveRequest, refuseRequest } = vi.hoisted(() => ({
  approveRequest: vi.fn(),
  refuseRequest: vi.fn(),
}));
vi.mock('../../../flows/connectionsFlow.js', () => ({ approveRequest, refuseRequest }));

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
        <PendingRequestsScreen />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

function clickDestructiveConfirm(): Promise<void> {
  return userEvent.click(
    document.querySelector<HTMLButtonElement>('button.alert-button-role-destructive')!,
  );
}

describe('PendingRequestsScreen', () => {
  it('loading: shows a spinner while the list fetch is in flight', async () => {
    const { fetchPendingRequests } = await import('../../../data/users.js');
    vi.mocked(fetchPendingRequests).mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
  });

  it('error: shows the failure message with a Retry that reloads the list', async () => {
    const { fetchPendingRequests } = await import('../../../data/users.js');
    vi.mocked(fetchPendingRequests).mockRejectedValueOnce(new Error('Network down'));
    renderScreen();
    expect(await screen.findByText('Network down')).toBeDefined();

    vi.mocked(fetchPendingRequests).mockResolvedValue({ items: [], more: false });
    await userEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('No pending requests.')).toBeDefined();
  });

  it('shows an empty state', async () => {
    const { fetchPendingRequests } = await import('../../../data/users.js');
    vi.mocked(fetchPendingRequests).mockResolvedValue({ items: [], more: false });
    renderScreen();
    expect(await screen.findByText('No pending requests.')).toBeDefined();
  });

  it('approve removes the row and makes the requester a follower', async () => {
    const { fetchPendingRequests } = await import('../../../data/users.js');
    vi.mocked(fetchPendingRequests).mockResolvedValue({
      items: [{ username: 'alice', avatar_url: '', icons: [] }],
      more: false,
    });
    approveRequest.mockResolvedValue(undefined);
    renderScreen();
    await userEvent.click(await screen.findByText('Approve'));
    await waitFor(() => expect(approveRequest).toHaveBeenCalledWith('alice'));
  });

  it('refuse confirms stating both effect and non-effect, then offers Hide as a separate action', async () => {
    const { fetchPendingRequests } = await import('../../../data/users.js');
    vi.mocked(fetchPendingRequests).mockResolvedValue({
      items: [{ username: 'alice', avatar_url: '', icons: [] }],
      more: false,
    });
    refuseRequest.mockResolvedValue(undefined);
    renderScreen();
    await userEvent.click(await screen.findByText('Refuse', { selector: 'ion-button' }));
    expect(
      await screen.findByText(
        "They won't be able to see your journal. This doesn't hide their entries from you.",
      ),
    ).toBeDefined();
    await clickDestructiveConfirm();
    await waitFor(() => expect(refuseRequest).toHaveBeenCalledWith('alice'));

    expect(await screen.findByText('Also hide alice')).toBeDefined();
    await userEvent.click(screen.getByText('Also hide alice'));
    expect(useHiddenMembersStore.getState().hiddenByAccount.a1).toEqual(['alice']);
  });

  it('shows the upgrade prompt instead of acting for a read-only account', async () => {
    useAccountsStore.setState({
      accounts: [{ ...readWrite, appTokenScope: 'read' }],
      activeAccountId: 'a1',
      hydrated: true,
    });
    const { fetchPendingRequests } = await import('../../../data/users.js');
    vi.mocked(fetchPendingRequests).mockResolvedValue({
      items: [{ username: 'alice', avatar_url: '', icons: [] }],
      more: false,
    });
    renderScreen();
    await userEvent.click(await screen.findByText('Approve'));
    expect(await screen.findByText(t('UPGRADE.title'))).toBeDefined();
    expect(approveRequest).not.toHaveBeenCalled();
  });
});
