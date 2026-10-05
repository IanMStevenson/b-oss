// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EntryDetailScreen } from '../EntryDetailScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { BlipfotoError, NetworkError } from '@b-oss/b-api';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';
import type { LoadedEntry } from '../../../data/entries.js';
import type { StoredAccount } from '../../../state/accountsStore.js';
import { clearAllDrafts } from '../../../data/commentDrafts.js';

const { fetchAuthorAvatar } = vi.hoisted(() => ({ fetchAuthorAvatar: vi.fn() }));
vi.mock('../../../data/users.js', () => ({ fetchAuthorAvatar }));

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
  postComment: vi.fn(),
  editComment: vi.fn(),
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

beforeEach(() => {
  fetchAuthorAvatar.mockResolvedValue(null);
  clearAllDrafts();
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen(props: { initialReplyToCommentId?: string } = {}) {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <OverlayHost />
        <EntryDetailScreen entryId="1" {...props} />
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

  describe('Delete (owner pill)', () => {
    const ownEntry: LoadedEntry = {
      ...baseLoadedEntry,
      entry: { ...baseLoadedEntry.entry, username: 'me' },
    };

    // Every IonAlert on this screen renders its buttons in jsdom, so "Cancel"/"Delete" are
    // ambiguous screen-wide — scope to the delete-entry alert by its header.
    async function deleteAlert(): Promise<HTMLElement> {
      const header = await screen.findByText('Delete this entry?');
      return header.closest('ion-alert') as HTMLElement;
    }

    async function openOwnEntry() {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(ownEntry);
      renderScreen();
      await screen.findByText('A day out');
    }

    it('is offered only on the viewer’s own entry', async () => {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(baseLoadedEntry);
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.queryByLabelText('Delete entry')).toBeNull();
    });

    it('asks before deleting, and Cancel leaves the entry alone', async () => {
      const { deleteEntry } = await import('../../../data/entries.js');
      await openOwnEntry();
      await userEvent.click(screen.getByLabelText('Delete entry'));
      await userEvent.click(within(await deleteAlert()).getByText('Cancel'));
      expect(deleteEntry).not.toHaveBeenCalled();
      expect(navReplace).not.toHaveBeenCalledWith('/browse');
    });

    it('deletes after confirmation and returns to Browse', async () => {
      const { deleteEntry } = await import('../../../data/entries.js');
      vi.mocked(deleteEntry).mockResolvedValue(undefined);
      await openOwnEntry();
      await userEvent.click(screen.getByLabelText('Delete entry'));
      await userEvent.click(within(await deleteAlert()).getByText('Delete'));
      await waitFor(() => expect(deleteEntry).toHaveBeenCalledWith('1'));
      await waitFor(() => expect(navReplace).toHaveBeenCalledWith('/browse'));
    });

    it('stays on the entry and says so when the delete fails', async () => {
      const { deleteEntry } = await import('../../../data/entries.js');
      vi.mocked(deleteEntry).mockRejectedValue(new Error('network'));
      await openOwnEntry();
      await userEvent.click(screen.getByLabelText('Delete entry'));
      await userEvent.click(within(await deleteAlert()).getByText('Delete'));
      await waitFor(() => expect(screen.getByText('Something went wrong')).toBeDefined());
      expect(navReplace).not.toHaveBeenCalledWith('/browse');
    });
  });

  describe('Author block (b-oss#174)', () => {
    async function openOthersEntry(friendship: LoadedEntry['friendship'] = null) {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue({ ...baseLoadedEntry, friendship });
      renderScreen();
      await screen.findByText('A day out');
    }
    const friendship = (state: 0 | 1 | 2 | 3): LoadedEntry['friendship'] =>
      ({
        source: 'me',
        target: 'alice',
        state,
        actions: {},
      }) as unknown as LoadedEntry['friendship'];

    it('shows the journal title and "By <user>", and looks up the author’s avatar', async () => {
      await openOthersEntry();
      expect(screen.getByText("Alice's journal")).toBeDefined();
      expect(screen.getByText('By alice')).toBeDefined();
      expect(fetchAuthorAvatar).toHaveBeenCalledWith('alice');
    });

    it('opens the author’s profile from the avatar or the name', async () => {
      await openOthersEntry();
      await userEvent.click(screen.getByLabelText('alice’s profile'));
      expect(navPush).toHaveBeenLastCalledWith('/user/alice');
      await userEvent.click(screen.getByText("Alice's journal"));
      expect(navPush).toHaveBeenCalledTimes(2);
    });

    it('offers a follow icon when you do not follow them, and following updates it in place', async () => {
      const { followUser } = await import('../../../flows/reactionsFlow.js');
      vi.mocked(followUser).mockResolvedValue({ state: 1 } as never);
      await openOthersEntry(friendship(0));
      await userEvent.click(screen.getByLabelText('Follow alice'));
      await waitFor(() => expect(followUser).toHaveBeenCalledWith('alice'));
      await waitFor(() =>
        expect(screen.getByLabelText('Following alice — unfollow')).toBeDefined(),
      );
    });

    it('shows following as an icon that asks before unfollowing', async () => {
      const { unfollowUser } = await import('../../../flows/reactionsFlow.js');
      await openOthersEntry(friendship(1));
      expect(screen.queryByLabelText('Follow alice')).toBeNull();
      await userEvent.click(screen.getByLabelText('Following alice — unfollow'));
      const header = await screen.findByText('Unfollow?');
      expect(unfollowUser).not.toHaveBeenCalled(); // confirmation first
      await userEvent.click(
        within(header.closest('ion-alert') as HTMLElement).getByText('Unfollow'),
      );
      await waitFor(() => expect(unfollowUser).toHaveBeenCalledWith('alice'));
    });

    it('shows a pending request as a non-interactive icon', async () => {
      await openOthersEntry(friendship(2));
      const pending = screen.getByLabelText('Follow request sent');
      expect(pending.tagName).not.toBe('BUTTON');
      expect(screen.queryByLabelText('Follow alice')).toBeNull();
    });

    it('offers no follow control to a read-only account', async () => {
      useAccountsStore.setState({
        accounts: [{ ...readWriteAccount, appTokenScope: 'read' }],
        activeAccountId: 'a1',
        hydrated: true,
      });
      await openOthersEntry();
      expect(screen.getByText('By alice')).toBeDefined();
      expect(screen.queryByLabelText('Follow alice')).toBeNull();
    });

    describe('on your own entry', () => {
      const ownEntry: LoadedEntry = {
        ...baseLoadedEntry,
        entry: { ...baseLoadedEntry.entry, username: 'me', journal_title: 'My journal' },
      };

      it('has nothing to follow, report or hide, and goes to your own profile', async () => {
        const { fetchEntry } = await import('../../../data/entries.js');
        vi.mocked(fetchEntry).mockResolvedValue(ownEntry);
        renderScreen();
        await screen.findByText('A day out');
        expect(screen.getByText('By me')).toBeDefined();
        expect(screen.queryByLabelText('Follow me')).toBeNull();
        expect(screen.queryByLabelText('Report')).toBeNull();
        expect(screen.queryByLabelText('Hide me')).toBeNull();
        await userEvent.click(screen.getByLabelText('me’s profile'));
        expect(navPush).toHaveBeenLastCalledWith('/me');
      });

      it('uses your account’s avatar instead of fetching one', async () => {
        useAccountsStore.setState({
          accounts: [{ ...readWriteAccount, avatarUrl: 'https://cdn.example/me.jpg' }],
          activeAccountId: 'a1',
          hydrated: true,
        });
        const { fetchEntry } = await import('../../../data/entries.js');
        vi.mocked(fetchEntry).mockResolvedValue(ownEntry);
        renderScreen();
        await screen.findByText('A day out');
        expect(fetchAuthorAvatar).not.toHaveBeenCalled();
      });
    });
  });

  describe('Inline comments (b-oss#172)', () => {
    type Actions = { reply: 0 | 1; edit: 0 | 1; delete: 0 | 1 };
    // A loaded entry carrying one comment by bob, in both shapes the screen reads: the b-view
    // comment EntryDetail renders, and the raw API comment that holds the per-viewer actions.
    function withComment(actions: Actions, extra: Partial<LoadedEntry> = {}): LoadedEntry {
      return {
        ...baseLoadedEntry,
        entry: {
          ...baseLoadedEntry.entry,
          comments: [
            {
              comment_id: 'c1',
              parent_id: null,
              commenter_username: 'bob',
              content: 'First!',
              content_html: '<p>First!</p>',
              replies: [],
            },
          ],
        },
        comments: [
          {
            comment_id_str: 'c1',
            parent_id_str: null,
            commenter: { username: 'bob', avatar_url: '', icons: [] },
            content: 'First!',
            content_html: '<p>First!</p>',
            replies: [],
            actions: { ...actions, report: 1 },
          } as never,
        ],
        ...extra,
      };
    }
    const noActions: Actions = { reply: 0, edit: 0, delete: 0 };

    async function load(entry: LoadedEntry = baseLoadedEntry) {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue(entry);
      return fetchEntry;
    }
    async function flows() {
      return await import('../../../flows/commentsFlow.js');
    }
    const box = (name = 'Your comment') => screen.getByLabelText<HTMLTextAreaElement>(name);

    it('has the composer inline at the bottom — no separate screen, no navigation', async () => {
      await load();
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.getByText('Comments (0)')).toBeDefined();
      expect(box()).toBeDefined();
      expect(screen.getByText('Add comment').hasAttribute('disabled')).toBe(true);
      expect(navPush).not.toHaveBeenCalled();
    });

    it('posts a new comment, clears the box, and refreshes in place without a spinner', async () => {
      const { postComment } = await flows();
      vi.mocked(postComment).mockResolvedValue({} as never);
      const fetchEntry = await load();
      renderScreen();
      await screen.findByText('A day out');

      // Make the post-success refresh slow, to prove the page stays up while it runs.
      let finishRefresh: (e: LoadedEntry) => void = () => {};
      vi.mocked(fetchEntry).mockReturnValueOnce(new Promise((r) => (finishRefresh = r)));

      await userEvent.type(box(), 'Lovely');
      await userEvent.click(screen.getByText('Add comment'));
      await waitFor(() =>
        expect(postComment).toHaveBeenCalledWith({ entryId: '1', content: 'Lovely' }),
      );
      await waitFor(() => expect(box().value).toBe(''));

      // Refresh in flight: the entry is still on screen and no spinner replaced the page.
      expect(screen.getByText('A day out')).toBeDefined();
      expect(document.querySelector('ion-spinner')).toBeNull();

      finishRefresh(
        withComment(noActions, {
          entry: {
            ...baseLoadedEntry.entry,
            comments: [
              {
                comment_id: 'new',
                parent_id: null,
                commenter_username: 'me',
                content: 'Lovely',
                content_html: '<p>Lovely</p>',
                replies: [],
              },
            ],
          },
        }),
      );
      expect(await screen.findByText('Lovely', { selector: 'p, div, span' })).toBeDefined();
    });

    it('keeps the text and says so inline when posting fails, and a retry can succeed', async () => {
      const { postComment } = await flows();
      vi.mocked(postComment)
        .mockRejectedValueOnce(new NetworkError('offline'))
        .mockResolvedValue({} as never);
      await load();
      renderScreen();
      await screen.findByText('A day out');

      await userEvent.type(box(), 'Lovely');
      await userEvent.click(screen.getByText('Add comment'));
      expect((await screen.findByRole('alert')).textContent).toMatch(/Your text is still here/);
      expect(box().value).toBe('Lovely');

      await userEvent.click(screen.getByText('Add comment'));
      await waitFor(() => expect(postComment).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(box().value).toBe(''));
    });

    it('remembers unsent text across leaving and returning (no discard prompt needed)', async () => {
      await load();
      const first = renderScreen();
      await screen.findByText('A day out');
      await userEvent.type(box(), 'half a thought');
      first.unmount();

      renderScreen();
      await screen.findByText('A day out');
      expect(box().value).toBe('half a thought');
    });

    it('does not offer a composer to a read-only account, or where comments are switched off', async () => {
      useAccountsStore.setState({
        accounts: [{ ...readWriteAccount, appTokenScope: 'read' }],
        activeAccountId: 'a1',
        hydrated: true,
      });
      await load();
      const first = renderScreen();
      await screen.findByText('A day out');
      expect(screen.queryByLabelText('Your comment')).toBeNull();
      first.unmount();

      useAccountsStore.setState({
        accounts: [readWriteAccount],
        activeAccountId: 'a1',
        hydrated: true,
      });
      await load({
        ...baseLoadedEntry,
        actions: { star: 1, favorite: 1, comment: 0, edit: 0, delete: 0 },
      });
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.queryByLabelText('Your comment')).toBeNull();
    });

    it('asks a signed-out user to sign in when they try to post, and posts nothing if they decline', async () => {
      const { postComment } = await flows();
      useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
      signInGated.mockRejectedValue(new Error('cancelled'));
      await load();
      renderScreen();
      await screen.findByText('A day out');
      await userEvent.type(box(), 'Lovely');
      await userEvent.click(screen.getByText('Add comment'));
      await waitFor(() => expect(signInGated).toHaveBeenCalled());
      expect(postComment).not.toHaveBeenCalled();
      expect(box().value).toBe('Lovely'); // nothing lost
    });

    it('says so when comments are switched off, instead of silently hiding the box', async () => {
      await load({
        ...baseLoadedEntry,
        actions: { star: 1, favorite: 1, comment: 0, edit: 0, delete: 0 },
      });
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.getByText('Comments are turned off for this journal.')).toBeDefined();
      expect(screen.queryByLabelText('Your comment')).toBeNull();
    });

    it('opens a commenter’s profile from their name (yours goes to /me)', async () => {
      await load(withComment(noActions));
      renderScreen();
      await screen.findByText('First!');
      await userEvent.click(screen.getByText('bob'));
      expect(navPush).toHaveBeenLastCalledWith('/user/bob');
    });

    it('Reply opens a composer beneath that comment, posts with its parent, then closes', async () => {
      const { postComment } = await flows();
      vi.mocked(postComment).mockResolvedValue({} as never);
      await load(withComment({ reply: 1, edit: 0, delete: 0 }));
      renderScreen();
      await screen.findByText('First!');

      await userEvent.click(screen.getByText('Reply'));
      const reply = box('Reply to bob');
      expect(document.activeElement).toBe(reply); // focused, ready to type
      await userEvent.type(reply, 'Thanks!');
      await userEvent.click(screen.getByText('Reply', { selector: 'button[type="submit"]' }));

      await waitFor(() =>
        expect(postComment).toHaveBeenCalledWith({
          entryId: '1',
          content: 'Thanks!',
          parentId: 'c1',
        }),
      );
      await waitFor(() => expect(screen.queryByLabelText('Reply to bob')).toBeNull());
    });

    it('Edit swaps the comment for an editor holding its text, and Save updates it', async () => {
      const { editComment } = await flows();
      vi.mocked(editComment).mockResolvedValue({} as never);
      await load(withComment({ reply: 0, edit: 1, delete: 0 }));
      renderScreen();
      await screen.findByText('First!');

      await userEvent.click(screen.getByText('Edit'));
      const editor = box('Edit your comment');
      expect(editor.value).toBe('First!');
      expect(screen.queryByText('First!', { selector: 'p, div' })).toBeNull(); // replaced by the editor

      await userEvent.clear(editor);
      await userEvent.type(editor, 'First, edited');
      await userEvent.click(screen.getByText('Save'));
      await waitFor(() =>
        expect(editComment).toHaveBeenCalledWith({ commentId: 'c1', content: 'First, edited' }),
      );
    });

    it('Cancel closes a reply but keeps what was typed for next time', async () => {
      await load(withComment({ reply: 1, edit: 0, delete: 0 }));
      renderScreen();
      await screen.findByText('First!');

      await userEvent.click(screen.getByText('Reply'));
      await userEvent.type(box('Reply to bob'), 'draft reply');
      // Every IonAlert on this screen renders its own Cancel in jsdom, so scope to the composer.
      await userEvent.click(
        within(box('Reply to bob').closest('form') as HTMLElement).getByText('Cancel'),
      );
      expect(screen.queryByLabelText('Reply to bob')).toBeNull();

      await userEvent.click(screen.getByText('Reply'));
      expect(box('Reply to bob').value).toBe('draft reply');
    });

    it('opens the reply composer on arrival when sent here from the comments inbox', async () => {
      await load(withComment({ reply: 1, edit: 0, delete: 0 }));
      renderScreen({ initialReplyToCommentId: 'c1' });
      await screen.findByText('First!');
      expect(await screen.findByLabelText('Reply to bob')).toBeDefined();
    });

    it('ignores an inbox hand-off for a comment you cannot reply to', async () => {
      await load(withComment(noActions));
      renderScreen({ initialReplyToCommentId: 'c1' });
      await screen.findByText('First!');
      expect(screen.queryByLabelText('Reply to bob')).toBeNull();
    });
  });

  describe('Report and Hide', () => {
    it('does not offer Report on the viewer’s own entry (you cannot report yourself)', async () => {
      const { fetchEntry } = await import('../../../data/entries.js');
      vi.mocked(fetchEntry).mockResolvedValue({
        ...baseLoadedEntry,
        entry: { ...baseLoadedEntry.entry, username: 'me' },
      });
      renderScreen();
      await screen.findByText('A day out');
      expect(screen.queryByLabelText('Report')).toBeNull();
    });

    it('Report is offered on another member’s entry, and navigates scoped to its author', async () => {
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
