// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { AppGeneralSection } from '../sections/AppGeneralSection.js';
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
  scheduleReminder.mockResolvedValue(undefined);
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

describe('AppGeneralSection — reminders', () => {
  it('explains what the reminder does and when it fires', () => {
    render(<AppGeneralSection />);
    expect(screen.getByText('Reminders')).toBeDefined();
    expect(screen.getByText(/each day, if you haven’t published an entry/)).toBeDefined();
    expect(screen.getByText(/skips that day’s reminder/)).toBeDefined();
  });

  it('starts off, with no time pickers shown', () => {
    render(<AppGeneralSection />);
    expect(toggleOf('Daily reminder').getAttribute('checked')).not.toBe('true');
    expect(screen.queryByText('Reminder time')).toBeNull();
  });

  it('enabling schedules the reminder and reveals the time pickers', async () => {
    render(<AppGeneralSection />);
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
    render(<AppGeneralSection />);
    // One row: the label with the current time beneath it.
    expect(screen.getByText('Reminder time').parentElement?.textContent).toContain('07:30');
  });

  it('choosing a time in the picker saves it and reschedules', async () => {
    useDevicePrefsStore.getState().setReminder('a1', { enabled: true, hour: 7, minute: 30 });
    render(<AppGeneralSection />);
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
    render(<AppGeneralSection />);
    await userEvent.click(screen.getByText('Reminder time'));
    await userEvent.click(await screen.findByText('Cancel'));
    expect(scheduleReminder).not.toHaveBeenCalled();
    expect(useDevicePrefsStore.getState().reminders['a1']).toMatchObject({ hour: 7, minute: 30 });
  });

  it('disabling cancels the reminder', async () => {
    useDevicePrefsStore.getState().setReminder('a1', { enabled: true, hour: 7, minute: 30 });
    render(<AppGeneralSection />);
    flip(toggleOf('Daily reminder'), false);
    await waitFor(() => expect(cancelReminder).toHaveBeenCalledWith('a1'));
  });

  it('has no Reminders section for a read-only account', () => {
    useAccountsStore.setState({ accounts: [acct('a1', 'alice', 'read')] });
    render(<AppGeneralSection />);
    expect(screen.queryByText('Reminders')).toBeNull();
    expect(screen.queryByLabelText('Daily reminder')).toBeNull();
  });
});

describe('AppGeneralSection — multiple accounts', () => {
  it('hides the confirm-account and account-picture settings with fewer than two accounts', () => {
    render(<AppGeneralSection />);
    expect(screen.queryByLabelText('Confirm account before star, favourite or comment')).toBeNull();
    expect(document.querySelector('ion-segment[aria-label="Account picture"]')).toBeNull();
  });

  it('shows the confirm-account toggle (off by default) with two or more accounts, and persists it', () => {
    useAccountsStore.setState({ accounts: [acct('a1', 'alice'), acct('a2', 'bob')] });
    render(<AppGeneralSection />);
    const toggle = toggleOf('Confirm account before star, favourite or comment');
    expect(toggle.getAttribute('checked')).not.toBe('true');
    flip(toggle, true);
    expect(useDevicePrefsStore.getState().confirmAccountBeforeReaction).toBe(true);
  });

  it('offers the account-picture choice with two or more accounts, and persists it', () => {
    useAccountsStore.setState({ accounts: [acct('a1', 'alice'), acct('a2', 'bob')] });
    render(<AppGeneralSection />);
    const segment = document.querySelector<HTMLElement & { value: string }>(
      'ion-segment[aria-label="Account picture"]',
    )!;
    expect(segment.classList.contains('settings-pill-segment')).toBe(true);
    expect(segment.value).toBe('picture');
    segment.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { value: 'icon' } }),
    );
    expect(useDevicePrefsStore.getState().accountAvatarStyle).toBe('icon');
  });
});

describe('AppGeneralSection — signed out', () => {
  beforeEach(() => {
    useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
  });

  it('greys out the reminder toggle with a sign-in hint, and shows no multi-account settings', () => {
    render(<AppGeneralSection />);
    expect(screen.getByText('Sign in to set a daily reminder to publish.')).toBeDefined();
    expect(isDisabled(toggleOf('Daily reminder'))).toBe(true);
    expect(screen.queryByLabelText('Confirm account before star, favourite or comment')).toBeNull();
  });

  it('the links toggle is still usable', () => {
    render(<AppGeneralSection />);
    const toggle = toggleOf('Open blipfoto.com links in this app');
    expect(isDisabled(toggle)).toBe(false);
    flip(toggle, true);
    expect(useDevicePrefsStore.getState().openBlipfotoLinksInApp).toBe(true);
  });
});

describe('AppGeneralSection — links', () => {
  it('the link-handling toggle defaults off, is always shown, and persists when flipped', () => {
    render(<AppGeneralSection />);
    const toggle = toggleOf('Open blipfoto.com links in this app');
    expect(toggle.getAttribute('checked')).not.toBe('true');
    flip(toggle, true);
    expect(useDevicePrefsStore.getState().openBlipfotoLinksInApp).toBe(true);
  });
});
