// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { FollowersFollowingScreen } from '../FollowersFollowingScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
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
      <OverlayProvider>
        <OverlayHost />
        <FollowersFollowingScreen username={username} mode={mode} />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('FollowersFollowingScreen', () => {
  it('loading: shows a spinner while the list fetch is in flight', async () => {
    const { fetchFollowers } = await import('../../../data/users.js');
    vi.mocked(fetchFollowers).mockReturnValue(new Promise(() => {}));
    renderScreen('me', 'followers');
    expect(document.querySelector('ion-spinner')).not.toBeNull();
  });

  it('error: shows the failure message with a Retry that reloads the list', async () => {
    const { fetchFollowers } = await import('../../../data/users.js');
    vi.mocked(fetchFollowers).mockRejectedValueOnce(new Error('Network down'));
    renderScreen('me', 'followers');
    expect(await screen.findByText('Network down')).toBeDefined();

    vi.mocked(fetchFollowers).mockResolvedValue({ items: [], more: false });
    await userEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText('No followers yet.')).toBeDefined();
  });

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
    expect(screen.getByLabelText('Remove alice')).toBeDefined();
  });

  it("does not offer Remove on someone else's followers list", async () => {
    const { fetchFollowers } = await import('../../../data/users.js');
    vi.mocked(fetchFollowers).mockResolvedValue({
      items: [{ username: 'bob', avatar_url: '', icons: [] }],
      more: false,
    });
    renderScreen('alice', 'followers');
    expect(await screen.findByText('bob')).toBeDefined();
    expect(screen.queryByLabelText('Remove bob')).toBeNull();
  });

  it('removes a follower optimistically after confirming', async () => {
    const { fetchFollowers } = await import('../../../data/users.js');
    vi.mocked(fetchFollowers).mockResolvedValue({
      items: [{ username: 'alice', avatar_url: '', icons: [] }],
      more: false,
    });
    removeFollower.mockResolvedValue(undefined);
    renderScreen('me', 'followers');
    await userEvent.click(await screen.findByLabelText('Remove alice'));
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

  describe('keeps your place when you open someone and come Back (b-oss#190)', () => {
    const person = (name: string) => ({ username: name, avatar_url: '', icons: [] });

    it('shows the list you had, with no refetch', async () => {
      const { fetchFollowing } = await import('../../../data/users.js');
      vi.mocked(fetchFollowing).mockResolvedValue({
        items: [person('alice'), person('bob')],
        more: false,
      });
      const first = renderScreen('me', 'following');
      expect(await screen.findByText('alice')).toBeDefined();
      first.unmount();

      vi.mocked(fetchFollowing).mockClear();
      renderScreen('me', 'following'); // Back from alice's profile
      expect(screen.getByText('alice')).toBeDefined(); // already there — no spinner
      expect(screen.getByText('bob')).toBeDefined();
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchFollowing).not.toHaveBeenCalled();
    });

    it('keeps followers and following separate', async () => {
      const { fetchFollowers, fetchFollowing } = await import('../../../data/users.js');
      vi.mocked(fetchFollowers).mockResolvedValue({ items: [person('carol')], more: false });
      vi.mocked(fetchFollowing).mockResolvedValue({ items: [person('dave')], more: false });
      const first = renderScreen('me', 'followers');
      expect(await screen.findByText('carol')).toBeDefined();
      first.unmount();

      renderScreen('me', 'following');
      expect(await screen.findByText('dave')).toBeDefined();
      expect(screen.queryByText('carol')).toBeNull();
    });
  });
});
