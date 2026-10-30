// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

// The desktop-only part of SCR-25 Notifications (b-oss#673, #677): the polling status line, Check
// now and Send a test notification. Off the desktop shell none of it renders (the Android and web
// sections are pinned by NotificationsSection.test.tsx).

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationsSection } from '../sections/NotificationsSection.js';
import { useAccountsStore } from '../../../state/accountsStore.js';

const { fetchNotificationSettings } = vi.hoisted(() => ({ fetchNotificationSettings: vi.fn() }));
vi.mock('../../../data/settings.js', () => ({
  fetchNotificationSettings,
  saveNotificationSettings: vi.fn(),
}));
vi.mock('../../../flows/accountsFlow.js', () => ({
  changeAccountMode: vi.fn(),
  OAuthCancelledError: class extends Error {},
}));
vi.mock('../../../flows/pushFlow.js', () => ({
  updatePollingInterval: vi.fn(),
  updatePushStreams: vi.fn(),
}));
vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

let desktop = true;
vi.mock('../../../platform/platformKind.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../platform/platformKind.js')>()),
  platformKind: () => (desktop ? 'desktop' : 'web'),
}));

const { getStatus, checkNow, sendTest } = vi.hoisted(() => ({
  getStatus: vi.fn(),
  checkNow: vi.fn(),
  sendTest: vi.fn(),
}));
vi.mock('../../../platform/desktopNotify.js', () => ({
  getDesktopNotifyStatus: getStatus,
  checkDesktopNotificationsNow: checkNow,
  sendDesktopTestNotification: sendTest,
}));

const status = (over: object = {}) => ({
  accounts: [
    {
      accountId: 'a1',
      lastCheckedAt: Date.now() - 120_000,
      nextCheckAt: Date.now() + 180_000,
      checking: false,
      result: { kind: 'ok', text: 'Nothing new', newItems: 0 },
      ...over,
    },
  ],
});

function setAccount(on: boolean) {
  useAccountsStore.setState({
    accounts: [
      {
        id: 'a1',
        username: 'alice',
        avatarUrl: null,
        appTokenScope: 'read',
        hasServiceToken: on,
        pushComments: on,
        pushNotifications: on,
        notificationRegistrationId: null,
        notificationStatus: null,
      },
    ],
    activeAccountId: 'a1',
    hydrated: true,
  });
}

beforeEach(() => {
  desktop = true;
  fetchNotificationSettings.mockResolvedValue({ feed: { configured: 1, settings: {} } });
  getStatus.mockResolvedValue(status());
  checkNow.mockResolvedValue(
    status({ result: { kind: 'ok', text: '1 new, 1 notification(s) shown' } }),
  );
  sendTest.mockResolvedValue({ ok: true, detail: 'Windows accepted the notification.' });
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('desktop notification status and test toast', () => {
  it('shows the status line and Check now when notifications are on', async () => {
    setAccount(true);
    render(<NotificationsSection />);
    await waitFor(() =>
      expect(screen.getByTestId('notify-status').textContent).toBe(
        'Checked 2 minutes ago · next check in about 3 minutes · Nothing new',
      ),
    );
    await userEvent.click(screen.getByText('Check now'));
    expect(checkNow).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByTestId('notify-status').textContent).toContain('1 new'));
  });

  it('offers the test notification even with notifications off, and reports the result', async () => {
    setAccount(false);
    render(<NotificationsSection />);
    expect(screen.queryByTestId('notify-status')).toBeNull();
    expect(screen.queryByText('Check now')).toBeNull();
    expect(getStatus).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('Send a test notification'));
    await waitFor(() =>
      expect(screen.getByTestId('notify-test-result').textContent).toContain(
        'Windows accepted the notification.',
      ),
    );
  });

  it('says plainly when the system could not show the test toast', async () => {
    sendTest.mockResolvedValue({ ok: false, detail: 'Windows could not show it: boom' });
    setAccount(true);
    render(<NotificationsSection />);
    await userEvent.click(screen.getByText('Send a test notification'));
    await waitFor(() =>
      expect(screen.getByTestId('notify-test-result').textContent).toBe(
        'Not shown. Windows could not show it: boom',
      ),
    );
  });

  it('renders none of it off the desktop shell', async () => {
    desktop = false;
    setAccount(true);
    render(<NotificationsSection />);
    await screen.findByText('b-mobile notifications');
    expect(screen.queryByText('Send a test notification')).toBeNull();
    expect(screen.queryByText('Check now')).toBeNull();
    expect(getStatus).not.toHaveBeenCalled();
  });
});
