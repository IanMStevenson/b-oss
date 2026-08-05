// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { NotificationsInboxScreen } from '../NotificationsInboxScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import { useNotificationCountsStore } from '../../../state/notificationCountsStore.js';

const { fetchRecentNotifications } = vi.hoisted(() => ({ fetchRecentNotifications: vi.fn() }));
vi.mock('../../../data/notifications.js', async () => {
  const actual = await vi.importActual<typeof import('../../../data/notifications.js')>(
    '../../../data/notifications.js',
  );
  return { ...actual, fetchRecentNotifications };
});

const { openUrl } = vi.hoisted(() => ({ openUrl: vi.fn() }));
vi.mock('../../../platform/browser.js', () => ({ openUrl }));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

function notification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    notification_id_str: '1',
    content: 'alice started following you',
    content_html: '<a href="https://www.blipfoto.com/alice">alice</a> started following you',
    image_url: 'https://example.com/avatar.jpg',
    link_url: 'https://www.blipfoto.com/alice',
    ...overrides,
  };
}

beforeEach(() => {
  useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
  useNotificationCountsStore.setState({ comments: 0, notifications: 3 });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  const history = createMemoryHistory();
  render(
    <Router history={history}>
      <OverlayProvider>
        <OverlayHost />
        <NotificationsInboxScreen />
      </OverlayProvider>
    </Router>,
  );
  return history;
}

describe('NotificationsInboxScreen', () => {
  it('shows a loading state, then clears the local badge count as soon as it opens', () => {
    fetchRecentNotifications.mockReturnValue(new Promise(() => {})); // never resolves
    renderScreen();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
    // Cleared *before* the fetch resolves — FLW-15 step 2's "at the same time" as opening.
    expect(useNotificationCountsStore.getState().notifications).toBe(0);
  });

  it('shows an empty state when there are none', async () => {
    fetchRecentNotifications.mockResolvedValue([]);
    renderScreen();
    expect(await screen.findByText('No notifications yet.')).toBeDefined();
  });

  it('shows an error state with a working Retry', async () => {
    fetchRecentNotifications.mockRejectedValueOnce(new Error('boom'));
    renderScreen();
    expect(await screen.findByText('Something went wrong. Please try again.')).toBeDefined();

    fetchRecentNotifications.mockResolvedValueOnce([notification()]);
    await userEvent.click(screen.getByText('Retry', { selector: 'ion-button' }));
    expect(await screen.findByText('alice started following you')).toBeDefined();
  });

  it('lists notifications, rendering the server-supplied text as-is', async () => {
    fetchRecentNotifications.mockResolvedValue([notification()]);
    renderScreen();
    expect(await screen.findByText('alice started following you')).toBeDefined();
  });

  it('suppresses a notification best-effort-recognised as from a hidden member', async () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'me',
          username: 'me',
          avatarUrl: null,
          appTokenScope: 'read,write',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'me',
      hydrated: true,
    });
    useHiddenMembersStore.setState({ hiddenByAccount: { me: ['alice'] }, hydrated: true });

    fetchRecentNotifications.mockResolvedValue([
      notification({ notification_id_str: '1' }),
      notification({
        notification_id_str: '2',
        content: 'you earned an award',
        content_html: '<p>you earned an award</p>',
        link_url: 'https://www.blipfoto.com/me/awards',
      }),
    ]);
    renderScreen();
    expect(await screen.findByText('you earned an award')).toBeDefined();
    expect(screen.queryByText('alice started following you')).toBeNull();
  });

  it('tapping an entry notification opens the entry', async () => {
    fetchRecentNotifications.mockResolvedValue([
      notification({
        content: 'your entry hit 50 stars',
        content_html: '<p>your entry hit 50 stars</p>',
        link_url: 'https://www.blipfoto.com/entry/998877',
      }),
    ]);
    const history = renderScreen();
    await userEvent.click(await screen.findByText('your entry hit 50 stars'));
    expect(history.location.pathname).toBe('/entry/998877');
  });

  it('tapping a profile notification opens the profile', async () => {
    fetchRecentNotifications.mockResolvedValue([notification()]); // links to /alice
    const history = renderScreen();
    await userEvent.click(await screen.findByText('alice started following you'));
    expect(history.location.pathname).toBe('/user/alice');
  });

  it('tapping a follow-request notification opens Pending Requests, not the requester profile', async () => {
    fetchRecentNotifications.mockResolvedValue([
      notification({
        content: 'alice wants to follow you',
        content_html:
          '<a href="https://www.blipfoto.com/alice">alice</a> wants to follow you — <a href="https://www.blipfoto.com/me/followers/requests">respond</a>',
        link_url: 'https://www.blipfoto.com/alice',
      }),
    ]);
    const history = renderScreen();
    await userEvent.click(await screen.findByText('alice wants to follow you'));
    expect(history.location.pathname).toBe('/me/requests');
  });

  it('tapping an unrecognised-target notification opens it in the system browser', async () => {
    fetchRecentNotifications.mockResolvedValue([
      notification({
        content: 'you earned an award',
        content_html: '<p>you earned an award</p>',
        link_url: 'https://www.blipfoto.com/awards/some-award',
      }),
    ]);
    const history = renderScreen();
    await userEvent.click(await screen.findByText('you earned an award'));
    await waitFor(() =>
      expect(openUrl).toHaveBeenCalledWith('https://www.blipfoto.com/awards/some-award'),
    );
    expect(history.location.pathname).toBe('/'); // stayed put — not a dead-end, just no in-app route
  });

  it('pull-to-refresh fetches only newer items via the since_id cursor and prepends them', async () => {
    fetchRecentNotifications.mockResolvedValueOnce([notification({ notification_id_str: '5' })]);
    renderScreen();
    await screen.findByText('alice started following you');

    fetchRecentNotifications.mockResolvedValueOnce([
      notification({ notification_id_str: '6', content: 'a brand new one' }),
    ]);
    const refresher = document.querySelector('ion-refresher')!;
    refresher.dispatchEvent(new CustomEvent('ionRefresh', { detail: { complete: () => {} } }));
    await waitFor(() => expect(fetchRecentNotifications).toHaveBeenCalledWith('5'));
    expect(await screen.findByText('a brand new one')).toBeDefined();
  });
});
