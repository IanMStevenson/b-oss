// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ProfileScreen } from '../ProfileScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import type { UserProfile } from '../../../data/users.js';

vi.mock('../../../data/users.js', () => ({
  fetchUserProfile: vi.fn(),
  fetchJournalEntriesFor: vi.fn().mockResolvedValue({ items: [], more: false }),
  fetchFavoriteEntriesFor: vi.fn().mockResolvedValue({ items: [], more: false }),
}));

const { followUser, unfollowUser } = vi.hoisted(() => ({
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
}));
vi.mock('../../../flows/reactionsFlow.js', () => ({ followUser, unfollowUser }));

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

const aliceProfile: UserProfile = {
  user: { username: 'alice', avatar_url: 'https://example.com/alice.jpg', icons: [] },
  details: {
    journal_title: "Alice's journal",
    biography: 'Hello!',
    biography_html: '',
    country_code: 'GB',
    entry_total: 42,
    member: 0,
    privacy: 0,
  },
  visible: true,
  friendship: { source: 'me', target: 'alice', state: 0, actions: { follow: 1, unfollow: 0 } },
  latestEntry: null,
};

beforeEach(() => {
  useAccountsStore.setState({ accounts: [meAccount], activeAccountId: 'a1', hydrated: true });
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen(username?: string) {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <OverlayHost />
        <ProfileScreen username={username} />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('ProfileScreen', () => {
  it('loading: shows a spinner while the profile fetch is in flight', async () => {
    const { fetchUserProfile } = await import('../../../data/users.js');
    vi.mocked(fetchUserProfile).mockReturnValue(new Promise(() => {}));
    renderScreen('alice');
    expect(document.querySelector('ion-spinner')).not.toBeNull();
    expect(screen.queryByText('Follow')).toBeNull();
  });

  it('error: shows the failure message with a Retry that reloads', async () => {
    const { fetchUserProfile } = await import('../../../data/users.js');
    vi.mocked(fetchUserProfile).mockRejectedValueOnce(new Error('Network down'));
    renderScreen('alice');
    expect(await screen.findByText('Network down')).toBeDefined();

    vi.mocked(fetchUserProfile).mockResolvedValue(aliceProfile);
    await userEvent.click(screen.getByText('Retry'));
    expect(await screen.findByText("alice's journal")).toBeDefined();
  });

  it("renders another member's profile with a Follow button", async () => {
    const { fetchUserProfile } = await import('../../../data/users.js');
    vi.mocked(fetchUserProfile).mockResolvedValue(aliceProfile);
    renderScreen('alice');
    expect(await screen.findByText("alice's journal")).toBeDefined();
    await waitFor(() => expect(screen.getByText("Alice's journal · 42 entries")).toBeDefined());
    expect(screen.getByText('Follow')).toBeDefined();
  });

  it('follows optimistically, then reflects the resulting friendship state', async () => {
    const { fetchUserProfile } = await import('../../../data/users.js');
    vi.mocked(fetchUserProfile).mockResolvedValue(aliceProfile);
    followUser.mockResolvedValue({
      source: 'me',
      target: 'alice',
      state: 1,
      actions: { follow: 0, unfollow: 1 },
    });
    renderScreen('alice');
    const followButton = await screen.findByText('Follow');
    await userEvent.click(followButton);
    // IonAlert renders its (hidden) confirm button into the DOM unconditionally, so scope to the
    // real ion-button to avoid matching that one too.
    await waitFor(() =>
      expect(screen.getByText('Unfollow', { selector: 'ion-button' })).toBeDefined(),
    );
    expect(followUser).toHaveBeenCalledWith('alice');
  });

  it('shows a protected message instead of entries when the journal is not visible to the viewer', async () => {
    const { fetchUserProfile } = await import('../../../data/users.js');
    vi.mocked(fetchUserProfile).mockResolvedValue({ ...aliceProfile, visible: false });
    renderScreen('alice');
    expect(await screen.findByText('This journal is protected.')).toBeDefined();
  });

  it("shows the hidden-member state instead of a hidden member's profile", async () => {
    useHiddenMembersStore.setState({ hiddenByAccount: { a1: ['alice'] }, hydrated: true });
    const { fetchUserProfile } = await import('../../../data/users.js');
    vi.mocked(fetchUserProfile).mockResolvedValue(aliceProfile);
    renderScreen('alice');
    expect(await screen.findByText('You’ve hidden this member.')).toBeDefined();
    expect(screen.queryByText('Follow')).toBeNull();
  });

  it('does not show a Follow button on your own profile', async () => {
    const { fetchUserProfile } = await import('../../../data/users.js');
    vi.mocked(fetchUserProfile).mockResolvedValue({
      ...aliceProfile,
      user: { ...aliceProfile.user, username: 'me' },
      friendship: null,
    });
    renderScreen();
    expect(await screen.findByText('My profile')).toBeDefined();
    expect(screen.queryByText('Follow')).toBeNull();
  });
});
