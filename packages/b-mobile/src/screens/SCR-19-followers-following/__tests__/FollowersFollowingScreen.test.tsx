// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FollowersFollowingScreen } from '../FollowersFollowingScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';

vi.mock('../../../data/users.js', () => ({
  fetchFollowers: vi.fn(),
  fetchFollowing: vi.fn(),
}));

const { removeFollower } = vi.hoisted(() => ({ removeFollower: vi.fn() }));
vi.mock('../../../flows/connectionsFlow.js', () => ({ removeFollower }));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const meAccount = {
  id: 'a1',
  username: 'me',
  avatarUrl: null,
  appTokenScope: 'read,write' as const,
  hasServiceToken: false,
  notificationRegistrationId: null,
  notificationStatus: null,
};

beforeEach(() => {
  useAccountsStore.setState({ accounts: [meAccount], activeAccountId: 'a1', hydrated: true });
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen(username: string, mode: 'followers' | 'following') {
  return render(
    <MemoryRouter>
      <FollowersFollowingScreen username={username} mode={mode} />
    </MemoryRouter>,
  );
}

describe('FollowersFollowingScreen', () => {
  it('shows an empty state naming which list is empty', async () => {
    const { fetchFollowers } = await import('../../../data/users.js');
    vi.mocked(fetchFollowers).mockResolvedValue({ items: [], more: false });
    renderScreen('me', 'followers');
    expect(await screen.findByText('No followers yet.')).toBeDefined();
  });

  it('lists followers, and offers Remove only for your own followers', async () => {
    const { fetchFollowers } = await import('../../../data/users.js');
    vi.mocked(fetchFollowers).mockResolvedValue({
      items: [{ username: 'alice', avatar_url: '', icons: [] }],
      more: false,
    });
    renderScreen('me', 'followers');
    expect(await screen.findByText('alice')).toBeDefined();
    // IonAlert's own (hidden) confirm button repeats the same label, so scope to the real
    // trigger button rather than a bare text match.
    expect(screen.getByText('Remove', { selector: 'ion-button' })).toBeDefined();
  });

  it("does not offer Remove on someone else's followers list", async () => {
    const { fetchFollowers } = await import('../../../data/users.js');
    vi.mocked(fetchFollowers).mockResolvedValue({
      items: [{ username: 'bob', avatar_url: '', icons: [] }],
      more: false,
    });
    renderScreen('alice', 'followers');
    expect(await screen.findByText('bob')).toBeDefined();
    expect(screen.queryByText('Remove', { selector: 'ion-button' })).toBeNull();
  });

  it('removes a follower optimistically after confirming', async () => {
    const { fetchFollowers } = await import('../../../data/users.js');
    vi.mocked(fetchFollowers).mockResolvedValue({
      items: [{ username: 'alice', avatar_url: '', icons: [] }],
      more: false,
    });
    removeFollower.mockResolvedValue(undefined);
    renderScreen('me', 'followers');
    await userEvent.click(await screen.findByText('Remove', { selector: 'ion-button' }));
    // The confirm alert's own destructive button repeats the same "Remove" text, but the text
    // itself sits on a nested <span> — RTL's `selector` option filters by which element *owns*
    // the matched text, so it can't target the ancestor <button>. A direct DOM query is simpler
    // and just as robust here, since there's exactly one destructive alert button on screen.
    await waitFor(() =>
      expect(document.querySelector('button.alert-button-role-destructive')).not.toBeNull(),
    );
    const confirmButton = document.querySelector<HTMLButtonElement>(
      'button.alert-button-role-destructive',
    )!;
    await userEvent.click(confirmButton);
    await waitFor(() => expect(removeFollower).toHaveBeenCalledWith('alice'));
  });

  it('marks a hidden member as Hidden rather than suppressing the row', async () => {
    useHiddenMembersStore.setState({ hiddenByAccount: { a1: ['alice'] }, hydrated: true });
    const { fetchFollowing } = await import('../../../data/users.js');
    vi.mocked(fetchFollowing).mockResolvedValue({
      items: [{ username: 'alice', avatar_url: '', icons: [] }],
      more: false,
    });
    renderScreen('me', 'following');
    expect(await screen.findByText('alice')).toBeDefined();
    expect(screen.getByText('(Hidden)')).toBeDefined();
  });
});
