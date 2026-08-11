// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { CommentsInboxScreen } from '../CommentsInboxScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import { useNotificationCountsStore } from '../../../state/notificationCountsStore.js';

const { fetchRecentComments } = vi.hoisted(() => ({ fetchRecentComments: vi.fn() }));
vi.mock('../../../data/notifications.js', async () => {
  const actual = await vi.importActual<typeof import('../../../data/notifications.js')>(
    '../../../data/notifications.js',
  );
  return { ...actual, fetchRecentComments };
});

const { deleteComment } = vi.hoisted(() => ({ deleteComment: vi.fn() }));
vi.mock('../../../flows/commentsFlow.js', () => ({ deleteComment }));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

function comment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    comment_id_str: '1',
    parent_id_str: null,
    entry_id_str: '100',
    thumbnail_url: 'https://example.com/thumb.jpg',
    content: 'lovely light!',
    content_html: '<p>lovely light!</p>',
    commenter: { username: 'alice', avatar_url: 'https://example.com/avatar.jpg', icons: [] },
    actions: { reply: 1, edit: 0, delete: 1 },
    replies: null,
    unread: 1,
    ...overrides,
  };
}

const meAccount = {
  id: 'me',
  username: 'me',
  avatarUrl: null,
  appTokenScope: 'read,write' as const,
  hasServiceToken: false,
  notificationRegistrationId: null,
  notificationStatus: null,
};

beforeEach(() => {
  useAccountsStore.setState({ accounts: [meAccount], activeAccountId: 'me', hydrated: true });
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
  useNotificationCountsStore.setState({ comments: 4, notifications: 0 });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
  // IonActionSheet/IonAlert present by appending themselves directly to document.body, outside
  // React's tree — cleanup() only unmounts the React root, so a sheet/alert opened during one
  // test is still attached (and still matched by later findByText/queryByText calls) unless
  // removed explicitly here. Only this file opens an action sheet per test, so nothing else in
  // the suite currently depends on that stale-but-attached state.
  document.querySelectorAll('ion-action-sheet, ion-alert').forEach((el) => el.remove());
});

function renderScreen() {
  const history = createMemoryHistory();
  render(
    <Router history={history}>
      <OverlayProvider>
        <OverlayHost />
        <CommentsInboxScreen />
      </OverlayProvider>
    </Router>,
  );
  return history;
}

describe('CommentsInboxScreen', () => {
  it('shows a loading state, then clears the local badge count as soon as it opens', () => {
    fetchRecentComments.mockReturnValue(new Promise(() => {}));
    renderScreen();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
    expect(useNotificationCountsStore.getState().comments).toBe(0);
  });

  it('shows an empty state when there are none', async () => {
    fetchRecentComments.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('No comments yet.')).toBeDefined();
  });

  it('shows an error state with a working Retry', async () => {
    fetchRecentComments.mockRejectedValueOnce(new Error('boom'));
    renderScreen();
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeDefined();

    fetchRecentComments.mockResolvedValueOnce([comment()]);
    await userEvent.click(screen.getByText('Retry', { selector: 'ion-button' }));
    expect(await screen.findByText('lovely light!')).toBeDefined();
  });

  it('lists comments with commenter, content, and the reply/overflow actions', async () => {
    fetchRecentComments.mockResolvedValue([comment()]);
    renderScreen();
    expect(await screen.findByText('lovely light!')).toBeDefined();
    expect(screen.getByText('alice')).toBeDefined();
    expect(screen.getByLabelText('Reply')).toBeDefined();
    expect(screen.getByLabelText('More actions')).toBeDefined();

    await userEvent.click(screen.getByLabelText('More actions'));
    expect(
      await screen.findByText('Delete', { selector: '.action-sheet-button-inner' }),
    ).toBeDefined();
    expect(screen.getByText('Report', { selector: '.action-sheet-button-inner' })).toBeDefined();
    expect(screen.getByText('Hide this member')).toBeDefined();
  });

  it('does not offer Delete when the delete action flag is off', async () => {
    fetchRecentComments.mockResolvedValue([comment({ actions: { reply: 1, edit: 0, delete: 0 } })]);
    renderScreen();
    await screen.findByText('lovely light!');
    await userEvent.click(screen.getByLabelText('More actions'));
    await screen.findByText('Report', { selector: '.action-sheet-button-inner' });
    expect(screen.queryByText('Delete', { selector: '.action-sheet-button-inner' })).toBeNull();
  });

  it('comments from a hidden member are excluded entirely, not just marked', async () => {
    useHiddenMembersStore.setState({ hiddenByAccount: { me: ['alice'] }, hydrated: true });
    fetchRecentComments.mockResolvedValue([
      comment({
        comment_id_str: '1',
        commenter: { username: 'alice', avatar_url: '', icons: [] },
      }),
      comment({
        comment_id_str: '2',
        commenter: { username: 'bob', avatar_url: '', icons: [] },
        content: 'nice!',
      }),
    ]);
    renderScreen();
    expect(await screen.findByText('nice!')).toBeDefined();
    expect(screen.queryByText('lovely light!')).toBeNull();
  });

  it('hiding a member from a row removes their comments from the list immediately', async () => {
    fetchRecentComments.mockResolvedValue([comment()]);
    renderScreen();
    await screen.findByText('lovely light!');
    await userEvent.click(screen.getByLabelText('More actions'));
    await userEvent.click(
      await screen.findByText('Hide this member', { selector: '.action-sheet-button-inner' }),
    );
    expect(screen.queryByText('lovely light!')).toBeNull();
  });

  it('tapping the thumbnail opens the entry', async () => {
    fetchRecentComments.mockResolvedValue([comment()]);
    const history = renderScreen();
    await screen.findByText('lovely light!');
    await userEvent.click(screen.getByLabelText('Open entry'));
    expect(history.location.pathname).toBe('/entry/100');
  });

  it('tapping the commenter opens their profile', async () => {
    fetchRecentComments.mockResolvedValue([comment()]);
    const history = renderScreen();
    await userEvent.click(await screen.findByText('alice'));
    expect(history.location.pathname).toBe('/user/alice');
  });

  it('Reply opens the composer pre-targeted to that comment', async () => {
    fetchRecentComments.mockResolvedValue([comment()]);
    const history = renderScreen();
    await userEvent.click(await screen.findByLabelText('Reply'));
    expect(history.location.pathname).toBe('/entry/100/comment');
    expect(history.location.state).toMatchObject({ replyToCommentId: '1' });
  });

  // Retried, not just given a longer waitFor: in this jsdom setup, IonActionSheet's own
  // animated-dismiss-then-fire-handler lifecycle occasionally never delivers the click to a
  // button's `handler` at all when many other overlay-driving tests have run earlier in the same
  // file — confirmed environment timing, not an app bug: the same buttons-array/closure pattern
  // is what "deletes a comment" below relies on and that one is stable, and a real-browser replay
  // of this exact flow (More actions -> Report) navigates every time. Neither a longer waitFor
  // timeout nor swapping userEvent for fireEvent changed the failure rate — the handler dispatch
  // itself doesn't happen in the failing runs, so no amount of waiting after the click helps.
  it('Report opens the report screen scoped to that comment', { retry: 3 }, async () => {
    fetchRecentComments.mockResolvedValue([comment()]);
    const history = renderScreen();
    await userEvent.click(await screen.findByLabelText('More actions'));
    await userEvent.click(
      await screen.findByText('Report', { selector: '.action-sheet-button-inner' }),
    );
    expect(history.location.pathname).toBe('/entry/100/report');
    expect(history.location.state).toMatchObject({
      targetUsername: 'alice',
      reportedComment: { username: 'alice', excerpt: 'lovely light!' },
    });
  });

  it('deletes a comment after confirming, whoever wrote it, from this inbox', async () => {
    fetchRecentComments.mockResolvedValue([comment()]);
    deleteComment.mockResolvedValue(undefined);
    renderScreen();
    await userEvent.click(await screen.findByLabelText('More actions'));
    await userEvent.click(
      await screen.findByText('Delete', { selector: '.action-sheet-button-inner' }),
    );
    await waitFor(() =>
      expect(document.querySelector('button.alert-button-role-destructive')).not.toBeNull(),
    );
    const confirmButton = document.querySelector<HTMLButtonElement>(
      'button.alert-button-role-destructive',
    )!;
    await userEvent.click(confirmButton);
    await waitFor(() => expect(deleteComment).toHaveBeenCalledWith('1'));
    expect(screen.queryByText('lovely light!')).toBeNull();
  });

  it('pull-to-refresh fetches only newer items via the since_id cursor and prepends them', async () => {
    fetchRecentComments.mockResolvedValueOnce([comment({ comment_id_str: '5' })]);
    renderScreen();
    await screen.findByText('lovely light!');

    fetchRecentComments.mockResolvedValueOnce([
      comment({ comment_id_str: '6', content: 'a brand new comment' }),
    ]);
    const refresher = document.querySelector('ion-refresher')!;
    refresher.dispatchEvent(new CustomEvent('ionRefresh', { detail: { complete: () => {} } }));
    await waitFor(() => expect(fetchRecentComments).toHaveBeenCalledWith('5'));
    expect(await screen.findByText('a brand new comment')).toBeDefined();
  });

  it('new-item marking reflects what was new on first open, and is not recomputed from a later refresh', async () => {
    fetchRecentComments.mockResolvedValueOnce([
      comment({ comment_id_str: '1', unread: 1 }),
      comment({ comment_id_str: '2', content: 'already read', unread: 0 }),
    ]);
    renderScreen();
    await screen.findByText('lovely light!');
    expect(screen.getAllByText('New')).toHaveLength(1);

    // Even though this later response's own `unread` flags could in principle be trusted for
    // genuinely-new arrivals, the snapshot is captured once and never recomputed — the safe,
    // always-correct reading of "captured from the first response only" (app-architecture.md
    // §11). A newly-arrived comment here should render, just without a "New" label.
    fetchRecentComments.mockResolvedValueOnce([
      comment({ comment_id_str: '3', content: 'a brand new comment', unread: 1 }),
    ]);
    const refresher = document.querySelector('ion-refresher')!;
    refresher.dispatchEvent(new CustomEvent('ionRefresh', { detail: { complete: () => {} } }));
    await waitFor(() => expect(fetchRecentComments).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('a brand new comment')).toBeDefined();
    expect(screen.getAllByText('New')).toHaveLength(1); // still only the original one
  });
});
