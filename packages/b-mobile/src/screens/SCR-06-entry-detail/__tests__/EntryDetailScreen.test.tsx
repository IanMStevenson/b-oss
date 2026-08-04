// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EntryDetailScreen } from '../EntryDetailScreen.js';
import { BlipfotoError } from '@b-oss/b-api';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import type { LoadedEntry } from '../../../data/entries.js';
import type { StoredAccount } from '../../../state/accountsStore.js';

vi.mock('../../../data/entries.js', () => ({
  fetchEntry: vi.fn(),
}));

// Isolates the accounts/hidden-members/device-prefs stores from real (jsdom) localStorage —
// beforeEach below seeds their in-memory state directly via setState, and this test has no
// interest in persistence itself, only in how the screen reacts to a given store state.
vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const { signInGated } = vi.hoisted(() => ({ signInGated: vi.fn() }));
vi.mock('../../../flows/accountsFlow.js', () => ({ signInGated }));

const { starEntry, favoriteEntry, followUser, unfollowUser } = vi.hoisted(() => ({
  starEntry: vi.fn(),
  favoriteEntry: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
}));
vi.mock('../../../flows/reactionsFlow.js', async () => {
  const actual = await vi.importActual<typeof import('../../../flows/reactionsFlow.js')>(
    '../../../flows/reactionsFlow.js',
  );
  return { ...actual, starEntry, favoriteEntry, followUser, unfollowUser };
});

vi.mock('../../../flows/commentsFlow.js', () => ({
  deleteComment: vi.fn(),
}));

const readWriteAccount: StoredAccount = {
  id: 'a1',
  username: 'me',
  avatarUrl: null,
  appTokenScope: 'read,write',
  hasServiceToken: false,
  notificationRegistrationId: null,
  notificationStatus: null,
};

const baseLoadedEntry: LoadedEntry = {
  entry: {
    entry_id: '1',
    date: '2026-01-01',
    title: 'A day out',
    username: 'alice',
    journal_title: "Alice's journal",
    description: 'Went to the [b]beach[/b].',
    description_html: '',
    tags: ['beach', 'sun'],
    location: null,
    views_total: 12,
    stars_total: 3,
    favorites_total: 1,
    comments: [],
    exif: null,
    images: { image: 'https://example.com/photo.jpg' },
  },
  prevEntryId: null,
  nextEntryId: null,
  actions: { star: 1, favorite: 1, comment: 1, edit: 0, delete: 0 },
  starred: false,
  favorited: false,
  friendship: null,
  comments: [],
};

beforeEach(() => {
  useAccountsStore.setState({
    accounts: [readWriteAccount],
    activeAccountId: 'a1',
    hydrated: true,
  });
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
  useDevicePrefsStore.setState({ confirmAccountBeforeReaction: false, hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <EntryDetailScreen entryId="1" />
    </MemoryRouter>,
  );
}

describe('EntryDetailScreen', () => {
  it('shows a spinner while loading', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
  });

  it('shows an error with retry on failure', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockRejectedValue(new Error('Network down'));
    renderScreen();
    expect(await screen.findByText('Network down')).toBeDefined();
    expect(screen.getByText('Retry')).toBeDefined();
  });

  it('renders the entry once loaded', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
    renderScreen();
    expect(await screen.findByText('A day out')).toBeDefined();
    await waitFor(() => expect(screen.getByText('#beach')).toBeDefined());
    expect(screen.getByText('#sun')).toBeDefined();
    expect(screen.getByText(/12 views/)).toBeDefined();
  });

  it('starring optimistically updates the count and label, then persists on success', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
    starEntry.mockResolvedValue(undefined);
    renderScreen();
    const starButton = await screen.findByText('Star');
    // userEvent (not a raw .click()) properly wraps the interaction in act() and awaits its own
    // internal microtask flushes — this handler chains two awaits (gateReaction) before its
    // first setState, and a bare .click() doesn't synchronize with that the way userEvent does.
    await userEvent.click(starButton);
    await waitFor(() => {
      expect(screen.getByText('Starred')).toBeDefined();
      expect(screen.getByText(/4 stars/)).toBeDefined();
    });
    expect(starEntry).toHaveBeenCalledWith('1');
  }, 15000);

  it('rolls back the optimistic star on a genuine failure and shows a message', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
    starEntry.mockRejectedValue(new BlipfotoError(500, 'Server refused'));
    renderScreen();
    const starButton = await screen.findByText('Star');
    starButton.click();
    expect(await screen.findByText('Server refused')).toBeDefined();
    expect(await screen.findByText('Star')).toBeDefined();
    expect(screen.queryByText('Starred')).toBeNull();
  });

  it('routes an anonymous tap through sign-in rather than calling the API directly', async () => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
    signInGated.mockReturnValue(new Promise(() => {}));
    renderScreen();
    const starButton = await screen.findByText('Star');
    starButton.click();
    await waitFor(() => expect(signInGated).toHaveBeenCalledOnce());
    expect(starEntry).not.toHaveBeenCalled();
  });

  it("shows a hidden-member state instead of a hidden author's entry", async () => {
    useHiddenMembersStore.setState({ hiddenByAccount: { a1: ['alice'] }, hydrated: true });
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
    renderScreen();
    expect(await screen.findByText('You’ve hidden this member.')).toBeDefined();
    expect(screen.queryByText('A day out')).toBeNull();
  });
});
