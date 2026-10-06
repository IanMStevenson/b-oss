// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createTrackedRouter } from '../../../app/routes/test-router.js';
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

// Ionic's IonActionSheet / IonAlert run animated present/dismiss lifecycles. In jsdom, under CPU
// load, that lifecycle intermittently drops a click so the button's handler is never called (b-oss#193:
// reproduced 3 in 8 parallel runs; repeating the click, waiting longer, or swapping userEvent for
// fireEvent did not help — there is nothing to wait for). That is Ionic's own behaviour, not ours,
// so these tests use plain synchronous stand-ins and exercise what this screen is responsible for:
// which buttons it offers and what each one does. Same "mock at the boundary" approach as every
// platform/** consumer test.
vi.mock('@ionic/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ionic/react')>();
  type StubButton = string | { text: string; role?: string; handler?: () => void };
  interface StubOverlayProps {
    isOpen: boolean;
    header?: string;
    message?: string;
    buttons?: StubButton[];
    onDidDismiss?: () => void;
  }
  function stubOverlay(kind: string) {
    return function StubOverlay({
      isOpen,
      header,
      message,
      buttons = [],
      onDidDismiss,
    }: StubOverlayProps) {
      if (!isOpen) return null;
      return (
        <div role="dialog" aria-label={header ?? kind}>
          {message && <p>{message}</p>}
          {buttons.map((b) => {
            const button = typeof b === 'string' ? { text: b } : b;
            return (
              <button
                key={button.text}
                data-role={button.role}
                onClick={() => {
                  button.handler?.();
                  onDidDismiss?.();
                }}
              >
                {button.text}
              </button>
            );
          })}
        </div>
      );
    };
  }
  return { ...actual, IonActionSheet: stubOverlay('Actions'), IonAlert: stubOverlay('Alert') };
});

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
  const { tracked: history, wrap } = createTrackedRouter();
  render(
    wrap(
      <>
        <OverlayProvider>
          <OverlayHost />
          <CommentsInboxScreen />
        </OverlayProvider>
      </>,
    ),
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
    expect(await screen.findByText('Delete')).toBeDefined();
    expect(screen.getByText('Report')).toBeDefined();
    expect(screen.getByText('Hide this member')).toBeDefined();
  });

  it('does not offer Delete when the delete action flag is off', async () => {
    fetchRecentComments.mockResolvedValue([comment({ actions: { reply: 1, edit: 0, delete: 0 } })]);
    renderScreen();
    await screen.findByText('lovely light!');
    await userEvent.click(screen.getByLabelText('More actions'));
    await screen.findByText('Report');
    expect(screen.queryByText('Delete')).toBeNull();
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
    await userEvent.click(await screen.findByText('Hide this member'));
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

  it('Reply lands on the entry with the reply composer targeted at that comment', async () => {
    fetchRecentComments.mockResolvedValue([comment()]);
    const history = renderScreen();
    await userEvent.click(await screen.findByLabelText('Reply'));
    expect(history.location.pathname).toBe('/entry/100'); // the composer is inline now (b-oss#172)
    expect(history.location.state).toMatchObject({ replyToCommentId: '1' });
  });

  it('Report opens the report screen scoped to that comment', async () => {
    fetchRecentComments.mockResolvedValue([comment()]);
    const history = renderScreen();
    await userEvent.click(await screen.findByLabelText('More actions'));
    await userEvent.click(await screen.findByText('Report'));
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
    await userEvent.click(await screen.findByText('Delete')); // the action sheet's Delete…
    const confirm = await screen.findByRole('dialog', { name: /Delete .*comment/ });
    await userEvent.click(within(confirm).getByText('Delete')); // …then the confirmation's
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
