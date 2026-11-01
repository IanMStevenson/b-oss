// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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

function acct(id: string, username: string, scope: 'read' | 'read,write' = 'read,write') {
  return {
    id,
    username,
    avatarUrl: null,
    appTokenScope: scope,
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
  };
}

function isDisabled(el: Element): boolean {
  return (el as Element & { disabled?: boolean }).disabled === true;
}

function toggleOf(label: string): HTMLElement {
  return screen.getByLabelText(label);
}

function flip(el: HTMLElement, checked: boolean) {
  el.dispatchEvent(new CustomEvent('ionChange', { bubbles: true, detail: { checked } }));
}

beforeEach(() => {
  scheduleReminder.mockResolvedValue(true);
  cancelReminder.mockResolvedValue(undefined);
  rescheduleReminderSkippingToday.mockResolvedValue(undefined);
  useAccountsStore.setState({
    accounts: [acct('a1', 'alice')],
    activeAccountId: 'a1',
    hydrated: true,
  });
  useDevicePrefsStore.setState({
    confirmAccountBeforeReaction: false,
    reminders: {},
    uploadFullSize: true,
    openBlipfotoLinksInApp: false,
    notificationPollingIntervalMinutes: 5,
    accountAvatarStyle: 'picture',
    hydrated: true,
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('RemindersSection', () => {
  it('explains what the reminder does and when it fires', () => {
    render(<RemindersSection />);
    expect(screen.getByText('Reminders')).toBeDefined();
    expect(screen.getByText(/each day, if you haven’t published an entry/)).toBeDefined();
    expect(screen.getByText(/skips that day’s reminder/)).toBeDefined();
  });

  it('starts off, with no time pickers shown', () => {
    render(<RemindersSection />);
    expect(toggleOf('Daily reminder').getAttribute('checked')).not.toBe('true');
    expect(screen.queryByText('Reminder time')).toBeNull();
  });

  it('enabling schedules the reminder and reveals the time pickers', async () => {
    render(<RemindersSection />);
    flip(toggleOf('Daily reminder'), true);
    await waitFor(() =>
      expect(scheduleReminder).toHaveBeenCalledWith('a1', { hour: 20, minute: 0 }),
    );
    expect(screen.getByText('Reminder time').parentElement?.textContent).toContain('20:00');
    expect(screen.queryByText('Reminder hour')).toBeNull();
    expect(screen.queryByText('Reminder minute')).toBeNull();
  });

  it('shows the active account’s own already-configured time', () => {
    useDevicePrefsStore.getState().setReminder('a1', { enabled: true, hour: 7, minute: 30 });
    render(<RemindersSection />);
    // One row: the label with the current time beneath it.
    expect(screen.getByText('Reminder time').parentElement?.textContent).toContain('07:30');
  });

  it('choosing a time in the picker saves it and reschedules', async () => {
    useDevicePrefsStore.getState().setReminder('a1', { enabled: true, hour: 7, minute: 30 });
    render(<RemindersSection />);
    await userEvent.click(screen.getByText('Reminder time'));
    const picker = await waitFor(() => {
      const el = document.querySelector<HTMLElement>('ion-datetime');
      if (!el) throw new Error('picker not open');
      return el;
    });
    expect((picker as HTMLElement & { presentation: string }).presentation).toBe('time');
    picker.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { value: '2026-01-01T18:45:00' } }),
    );
    await userEvent.click(await screen.findByText('Done'));
    await waitFor(() =>
      expect(scheduleReminder).toHaveBeenCalledWith('a1', { hour: 18, minute: 45 }),
    );
    expect(useDevicePrefsStore.getState().reminders['a1']).toMatchObject({ hour: 18, minute: 45 });
  });

  it('Cancel in the time picker leaves the reminder alone', async () => {
    useDevicePrefsStore.getState().setReminder('a1', { enabled: true, hour: 7, minute: 30 });
    render(<RemindersSection />);
    await userEvent.click(screen.getByText('Reminder time'));
    await userEvent.click(await screen.findByText('Cancel'));
    expect(scheduleReminder).not.toHaveBeenCalled();
    expect(useDevicePrefsStore.getState().reminders['a1']).toMatchObject({ hour: 7, minute: 30 });
  });

  it('disabling cancels the reminder', async () => {
    useDevicePrefsStore.getState().setReminder('a1', { enabled: true, hour: 7, minute: 30 });
    render(<RemindersSection />);
    flip(toggleOf('Daily reminder'), false);
    await waitFor(() => expect(cancelReminder).toHaveBeenCalledWith('a1'));
  });

  it('a refused notification permission turns the toggle back off and says why', async () => {
    scheduleReminder.mockResolvedValue(false);
    render(<RemindersSection />);
    flip(toggleOf('Daily reminder'), true);
    expect(await screen.findByText(/Notifications are off for b-mobile/)).toBeDefined();
    expect(screen.getByText(/allow them in your phone’s Settings/)).toBeDefined();
    expect(useDevicePrefsStore.getState().reminders['a1']).toEqual({
      enabled: false,
      hour: 20,
      minute: 0,
    });
    expect(toggleOf('Daily reminder').getAttribute('checked')).not.toBe('true');
    expect(screen.queryByText('Reminder time')).toBeNull();
  });

  it('a scheduling error turns the toggle back off with a generic message', async () => {
    scheduleReminder.mockRejectedValue(new Error('boom'));
    render(<RemindersSection />);
    flip(toggleOf('Daily reminder'), true);
    expect(
      await screen.findByText('Could not change the reminder. Please try again.'),
    ).toBeDefined();
    expect(useDevicePrefsStore.getState().reminders['a1']?.enabled).toBe(false);
    expect(toggleOf('Daily reminder').getAttribute('checked')).not.toBe('true');
  });

  it('has no Reminders section for a read-only account', () => {
    useAccountsStore.setState({ accounts: [acct('a1', 'alice', 'read')] });
    render(<RemindersSection />);
    expect(screen.queryByText('Reminders')).toBeNull();
    expect(screen.queryByLabelText('Daily reminder')).toBeNull();
  });
});

describe('RemindersSection — signed out', () => {
  beforeEach(() => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
  });

  it('greys out the reminder toggle with a sign-in hint', () => {
    render(<RemindersSection />);
    expect(screen.getByText('Sign in to set a daily reminder to publish.')).toBeDefined();
    expect(isDisabled(toggleOf('Daily reminder'))).toBe(true);
  });
});
