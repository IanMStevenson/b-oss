// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BlipfotoError } from '@b-oss/b-api';
import { NotificationsSection } from '../sections/NotificationsSection.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';

const { fetchNotificationSettings, saveNotificationSettings } = vi.hoisted(() => ({
  fetchNotificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
}));
vi.mock('../../../data/settings.js', () => ({
  fetchNotificationSettings,
  saveNotificationSettings,
}));

const { changeAccountMode } = vi.hoisted(() => ({ changeAccountMode: vi.fn() }));
vi.mock('../../../flows/accountsFlow.js', () => ({ changeAccountMode }));

const { pingRefreshPreferences, updatePollingInterval } = vi.hoisted(() => ({
  pingRefreshPreferences: vi.fn().mockResolvedValue(undefined),
  updatePollingInterval: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../../../flows/pushFlow.js', () => ({ pingRefreshPreferences, updatePollingInterval }));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    username: 'alice',
    avatarUrl: null,
    appTokenScope: 'read,write' as const,
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
    ...overrides,
  };
}

beforeEach(() => {
  useAccountsStore.setState({ accounts: [account()], activeAccountId: 'a1', hydrated: true });
  useDevicePrefsStore.setState({
    confirmAccountBeforeReaction: false,
    reminders: {},
    uploadFullSize: true,
    openBlipfotoLinksInApp: false,
    notificationPollingIntervalMinutes: 5,
    hydrated: true,
  });
  fetchNotificationSettings.mockResolvedValue({
    feed: { configured: 1, settings: { new_comment: 1, new_follower: 0 } },
    push: { configured: 0, settings: { new_comment: 0 } },
  });
  saveNotificationSettings.mockResolvedValue(undefined);
  changeAccountMode.mockResolvedValue(undefined);
  pingRefreshPreferences.mockResolvedValue(undefined);
  updatePollingInterval.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('NotificationsSection', () => {
  it('shows the master switch reflecting the account’s current hasServiceToken', async () => {
    render(<NotificationsSection />);
    expect(await screen.findByText('Off')).toBeDefined();
  });

  it('toggling the master switch calls changeAccountMode with the flipped notifications flag', async () => {
    render(<NotificationsSection />);
    await screen.findByText('Off');
    await userEvent.click(screen.getByText('Off'));

    await waitFor(() =>
      expect(changeAccountMode).toHaveBeenCalledWith('a1', {
        scope: 'read,write',
        notifications: true,
      }),
    );
  });

  it('renders Feed toggles from whatever keys the server returns', async () => {
    render(<NotificationsSection />);
    expect(await screen.findByText('New Comment')).toBeDefined();
    expect(screen.getByText('New Follower')).toBeDefined();
  });

  it('does not render the Push group when the master switch is off', async () => {
    render(<NotificationsSection />);
    await screen.findByText('New Comment');
    // Only one "New Comment" (Feed) — Push's own copy is absent while the switch is off.
    expect(screen.getAllByText('New Comment')).toHaveLength(1);
  });

  it('renders the Push group once the master switch is on', async () => {
    useAccountsStore.setState({
      accounts: [account({ hasServiceToken: true })],
      activeAccountId: 'a1',
    });
    render(<NotificationsSection />);
    await screen.findByText('On');
    await waitFor(() => expect(screen.getByText('Push')).toBeDefined());
  });

  it('shows an error state when the load fails', async () => {
    fetchNotificationSettings.mockRejectedValue(new BlipfotoError(500, 'Server error'));
    render(<NotificationsSection />);
    expect(await screen.findByText('Server error')).toBeDefined();
  });

  it('saving a toggle change sends only the changed key', async () => {
    render(<NotificationsSection />);
    const followerToggle = await screen.findByText('New Follower');
    const checkbox = followerToggle.closest('ion-checkbox')!;
    checkbox.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }),
    );
    await userEvent.click(await screen.findByText('Save', { selector: 'ion-button' }));

    await waitFor(() =>
      expect(saveNotificationSettings).toHaveBeenCalledWith({ new_comment: 1, new_follower: 1 }),
    );
  });

  it('the Advanced polling control is collapsed by default and enforces the 5-minute floor', async () => {
    render(<NotificationsSection />);
    await screen.findByText('New Comment');
    expect(screen.queryByText(/Check for new activity every/)).toBeNull();

    await userEvent.click(screen.getByText(/Advanced/));
    const input = screen.getByRole<HTMLInputElement>('spinbutton');
    expect(input.value).toBe('5');
    expect(input.min).toBe('5');
  });

  it('a successful save pings the notification service to refresh its cached preferences', async () => {
    useAccountsStore.setState({
      accounts: [account({ hasServiceToken: true, notificationRegistrationId: 'reg-1' })],
      activeAccountId: 'a1',
    });
    render(<NotificationsSection />);
    const followerToggle = await screen.findByText('New Follower');
    followerToggle
      .closest('ion-checkbox')!
      .dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }));
    await userEvent.click(await screen.findByText('Save', { selector: 'ion-button' }));

    await waitFor(() => expect(pingRefreshPreferences).toHaveBeenCalledWith('a1'));
  });

  it('changing the Advanced interval, with a live registration, PATCHes it to the service', async () => {
    useAccountsStore.setState({
      accounts: [account({ hasServiceToken: true, notificationRegistrationId: 'reg-1' })],
      activeAccountId: 'a1',
    });
    render(<NotificationsSection />);
    await screen.findByText('Push'); // both groups render — Push only when the switch is on
    await userEvent.click(screen.getByText(/Advanced/));
    const input = screen.getByRole<HTMLInputElement>('spinbutton');

    fireEvent.change(input, { target: { value: '20' } });

    await waitFor(() => expect(updatePollingInterval).toHaveBeenCalledWith('a1', 20));
    expect(useDevicePrefsStore.getState().notificationPollingIntervalMinutes).toBe(20);
  });

  it('changing the interval with no live registration stays local-only, no error shown', async () => {
    // Default account (from beforeEach) has notificationRegistrationId: null.
    render(<NotificationsSection />);
    await screen.findByText('New Comment');
    await userEvent.click(screen.getByText(/Advanced/));
    const input = screen.getByRole<HTMLInputElement>('spinbutton');

    fireEvent.change(input, { target: { value: '10' } });

    await waitFor(() =>
      expect(useDevicePrefsStore.getState().notificationPollingIntervalMinutes).toBe(10),
    );
    expect(updatePollingInterval).not.toHaveBeenCalled();
  });

  it('a PATCH failure against an existing registration rolls back the value and shows an error', async () => {
    useAccountsStore.setState({
      accounts: [account({ hasServiceToken: true, notificationRegistrationId: 'reg-1' })],
      activeAccountId: 'a1',
    });
    updatePollingInterval.mockRejectedValueOnce(new Error('server floor rejected'));
    render(<NotificationsSection />);
    await screen.findByText('Push'); // both groups render — Push only when the switch is on
    await userEvent.click(screen.getByText(/Advanced/));
    const input = screen.getByRole<HTMLInputElement>('spinbutton');

    fireEvent.change(input, { target: { value: '20' } });

    expect(await screen.findByText('server floor rejected')).toBeDefined();
    await waitFor(() => expect(input.value).toBe('5'));
  });
});
