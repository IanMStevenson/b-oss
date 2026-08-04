// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { RemindersSection } from '../sections/RemindersSection.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';

const { scheduleReminder, cancelReminder, rescheduleReminderSkippingToday } = vi.hoisted(() => ({
  scheduleReminder: vi.fn(),
  cancelReminder: vi.fn(),
  rescheduleReminderSkippingToday: vi.fn(),
}));
vi.mock('../../../platform/localNotifications.js', () => ({
  scheduleReminder,
  cancelReminder,
  rescheduleReminderSkippingToday,
}));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  scheduleReminder.mockResolvedValue(undefined);
  cancelReminder.mockResolvedValue(undefined);
  rescheduleReminderSkippingToday.mockResolvedValue(undefined);
  useAccountsStore.setState({
    accounts: [
      {
        id: 'a1',
        username: 'alice',
        avatarUrl: null,
        appTokenScope: 'read,write',
        hasServiceToken: false,
        notificationRegistrationId: null,
        notificationStatus: null,
      },
    ],
    activeAccountId: 'a1',
    hydrated: true,
  });
  useDevicePrefsStore.setState({
    confirmAccountBeforeReaction: false,
    reminders: {},
    uploadFullSize: true,
    openBlipfotoLinksInApp: false,
    notificationPollingIntervalMinutes: 5,
    hydrated: true,
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('RemindersSection', () => {
  it('starts off, with no time picker shown', () => {
    render(<RemindersSection />);
    const toggle = screen.getByText('Daily reminder').closest('ion-checkbox')!;
    expect(toggle.getAttribute('checked')).not.toBe('true');
    expect(screen.queryByLabelText('Reminder hour')).toBeNull();
  });

  it('enabling schedules the reminder and reveals the time picker', async () => {
    render(<RemindersSection />);
    const toggle = screen.getByText('Daily reminder').closest('ion-checkbox')!;
    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }),
    );

    await waitFor(() =>
      expect(scheduleReminder).toHaveBeenCalledWith('a1', { hour: 20, minute: 0 }),
    );
    expect(screen.getByLabelText('Reminder hour')).toBeDefined();
  });

  it('shows the active account’s own already-configured time', () => {
    useDevicePrefsStore.getState().setReminder('a1', { enabled: true, hour: 7, minute: 30 });
    render(<RemindersSection />);
    expect(screen.getByLabelText<HTMLSelectElement>('Reminder hour').value).toBe('7');
    expect(screen.getByLabelText<HTMLSelectElement>('Reminder minute').value).toBe('30');
  });

  it('switching accounts shows that account’s own setting', () => {
    useDevicePrefsStore.getState().setReminder('a1', { enabled: true, hour: 7, minute: 30 });
    const { rerender } = render(<RemindersSection />);
    useAccountsStore.setState({
      accounts: [
        ...useAccountsStore.getState().accounts,
        {
          id: 'a2',
          username: 'bob',
          avatarUrl: null,
          appTokenScope: 'read,write',
          hasServiceToken: false,
          notificationRegistrationId: null,
          notificationStatus: null,
        },
      ],
      activeAccountId: 'a2',
    });
    rerender(<RemindersSection />);
    const toggle = screen.getByText('Daily reminder').closest('ion-checkbox')!;
    expect(toggle.getAttribute('checked')).not.toBe('true');
  });

  it('disabling cancels the reminder', async () => {
    useDevicePrefsStore.getState().setReminder('a1', { enabled: true, hour: 7, minute: 30 });
    render(<RemindersSection />);
    const toggle = screen.getByText('Daily reminder').closest('ion-checkbox')!;
    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: false } }),
    );
    await waitFor(() => expect(cancelReminder).toHaveBeenCalledWith('a1'));
  });
});
