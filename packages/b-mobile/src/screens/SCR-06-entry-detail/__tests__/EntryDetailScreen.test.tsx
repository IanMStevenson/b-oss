// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EntryDetailScreen } from '../EntryDetailScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { BlipfotoError } from '@b-oss/b-api';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import type { LoadedEntry } from '../../../data/entries.js';
import type { StoredAccount } from '../../../state/accountsStore.js';

vi.mock('../../../data/entries.js', () => ({
  fetchEntry: vi.fn(),
  deleteEntry: vi.fn(),
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

const navPush = vi.fn();
const navReplace = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: navPush, replace: navReplace, goBack: vi.fn() }),
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
      <OverlayProvider>
        <OverlayHost />
        <EntryDetailScreen entryId="1" />
      </OverlayProvider>
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
    // b-view's EntryDetail renders tags as plain text (no leading '#') and the view count/label
    // as two separate elements ("12" then "views"), not one combined text node. "beach" also
    // appears inside the [b]beach[/b] description, so tag text needs a selector scoped away from
    // that rather than a bare getByText.
    await waitFor(() =>
      expect(screen.getByText('beach', { selector: 'span,button' })).toBeDefined(),
    );
    expect(screen.getByText('sun', { selector: 'span,button' })).toBeDefined();
    expect(screen.getByText('12')).toBeDefined();
    expect(screen.getByText('views')).toBeDefined();
  });

  it('starring optimistically updates the count and label, then persists on success', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
    starEntry.mockResolvedValue(undefined);
    renderScreen();
    // b-view's EntryDetail renders the star as an icon + count, identified by aria-label rather
    // than visible text ("Star"/"Starred").
    const starButton = await screen.findByLabelText('Star this entry');
    // userEvent (not a raw .click()) properly wraps the interaction in act() and awaits its own
    // internal microtask flushes — this handler chains two awaits (gateReaction) before its
    // first setState, and a bare .click() doesn't synchronize with that the way userEvent does.
    await userEvent.click(starButton);
    await waitFor(() => {
      const starred = screen.getByLabelText('Remove star');
      expect(starred).toBeDefined();
      expect(starred.textContent).toContain('4');
    });
    expect(starEntry).toHaveBeenCalledWith('1');
  }, 15000);

  it('rolls back the optimistic star on a genuine failure and shows a message', async () => {
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
    starEntry.mockRejectedValue(new BlipfotoError(500, 'Server refused'));
    renderScreen();
    const starButton = await screen.findByLabelText('Star this entry');
    starButton.click();
    expect(await screen.findByText('Server refused')).toBeDefined();
    expect(await screen.findByLabelText('Star this entry')).toBeDefined();
    expect(screen.queryByLabelText('Remove star')).toBeNull();
  });

  it('routes an anonymous tap through sign-in rather than calling the API directly', async () => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
    const { fetchEntry } = await import('../../../data/entries.js');
    vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
    signInGated.mockReturnValue(new Promise(() => {}));
    renderScreen();
    const starButton = await screen.findByLabelText('Star this entry');
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

  describe('FLW-13 — owner-only Edit', () => {
    const ownEntry: LoadedEntry = {
      ...baseLoadedEntry,
      entry: { ...baseLoadedEntry.entry, username: 'me' },
    };

    it('offers Edit only for the viewer’s own, read-write entry', async () => {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(ownEntry);
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.getByLabelText('Edit entry')).toBeDefined();
    });

    it('does not offer Edit on another member’s entry', async () => {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry); // username: 'alice'
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.queryByLabelText('Edit entry')).toBeNull();
    });

    it('does not offer Edit for a read-only owner (ownership isn’t write access)', async () => {
      useAccountsStore.setState({
        accounts: [{ ...readWriteAccount, appTokenScope: 'read' }],
        activeAccountId: 'a1',
        hydrated: true,
      });
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(ownEntry);
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.queryByLabelText('Edit entry')).toBeNull();
    });

    it('Edit navigates to SCR-13', async () => {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(ownEntry);
      renderScreen();
      await screen.findByText('A day out');
      await userEvent.click(screen.getByLabelText('Edit entry'));
      expect(navPush).toHaveBeenCalledWith('/entry/1/edit');
    });
  });

  describe('Report and Hide', () => {
    it('Report is always offered, and navigates scoped to the entry’s author', async () => {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
      renderScreen();
      await screen.findByText('A day out');
      await userEvent.click(screen.getByLabelText('Report'));
      expect(navPush).toHaveBeenCalledWith('/entry/1/report', { targetUsername: 'alice' });
    });

    it('offers Hide for another member’s entry, not the viewer’s own', async () => {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry); // username: 'alice'
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.getByLabelText('Hide alice')).toBeDefined();

      const ownEntry: LoadedEntry = {
        ...baseLoadedEntry,
        entry: { ...baseLoadedEntry.entry, username: 'me' },
      };
      cleanup();
      vi.mocked(fetchEntry).mockResolvedValue(ownEntry);
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.queryByLabelText('Hide me')).toBeNull();
    });

    it('Hide confirms, then hides the author locally', async () => {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
      renderScreen();
      await screen.findByText('A day out');
      await userEvent.click(screen.getByLabelText('Hide alice'));
      expect(await screen.findByText('Hide alice?')).toBeDefined();
      const confirmButton = document.querySelector(
        'ion-alert[header="Hide alice?"] button.alert-button-role-destructive',
      ) as HTMLElement;
      await userEvent.click(confirmButton);
      expect(useHiddenMembersStore.getState().hiddenByAccount.a1).toContain('alice');
    });
  });

  describe('Map', () => {
    it('the location pin navigates to SCR-04 instead of opening an external link', async () => {
      const withLocation: LoadedEntry = {
        ...baseLoadedEntry,
        entry: { ...baseLoadedEntry.entry, location: { lat: 51.5, lon: -0.1 } },
      };
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(withLocation);
      renderScreen();
      await screen.findByText('A day out');
      await userEvent.click(screen.getByLabelText('View on map'));
      expect(navPush).toHaveBeenCalledWith('/map?entry=1');
    });
  });
});
