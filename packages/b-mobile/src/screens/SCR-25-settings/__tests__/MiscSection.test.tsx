// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MiscSection } from '../sections/MiscSection.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import { useDevicePrefsStore } from '../../../state/devicePrefsStore.js';

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

function acct(id: string, username: string) {
  return {
    id,
    username,
    avatarUrl: null,
    appTokenScope: 'read,write' as const,
    hasServiceToken: false,
    notificationRegistrationId: null,
    notificationStatus: null,
  };
}

beforeEach(() => {
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
    hydrated: true,
  });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

describe('MiscSection', () => {
  it('shows the upload-full-size toggle, defaulting on', () => {
    render(<MiscSection />);
    expect(screen.getByText('Upload full-size photos')).toBeDefined();
    expect(useDevicePrefsStore.getState().uploadFullSize).toBe(true);
  });

  it('toggling upload-full-size persists immediately', () => {
    render(<MiscSection />);
    const toggle = screen.getByText('Upload full-size photos').closest('ion-checkbox')!;
    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: false } }),
    );
    expect(useDevicePrefsStore.getState().uploadFullSize).toBe(false);
  });

  it('hides the confirm-account toggle with fewer than two accounts stored', () => {
    render(<MiscSection />);
    expect(screen.queryByText('Confirm account before Star, Favourite or comment')).toBeNull();
  });

  it('shows the confirm-account toggle, off by default, with two or more accounts', () => {
    useAccountsStore.setState({
      accounts: [acct('a1', 'alice'), acct('a2', 'bob')],
      activeAccountId: 'a1',
    });
    render(<MiscSection />);
    const toggle = screen
      .getByText('Confirm account before Star, Favourite or comment')
      .closest('ion-checkbox')!;
    expect(toggle.getAttribute('checked')).not.toBe('true');

    toggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }),
    );
    expect(useDevicePrefsStore.getState().confirmAccountBeforeReaction).toBe(true);
  });

  it('offers the account-picture choice only with two or more accounts, and persists it', () => {
    const { unmount } = render(<MiscSection />);
    expect(document.querySelector('ion-segment[aria-label="Account picture"]')).toBeNull();
    unmount();

    useAccountsStore.setState({ accounts: [acct('a1', 'alice'), acct('a2', 'bob')] });
    render(<MiscSection />);
    const segment = document.querySelector('ion-segment[aria-label="Account picture"]')!;
    expect(segment.getAttribute('value')).toBe('picture');
    segment.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { value: 'icon' } }),
    );
    expect(useDevicePrefsStore.getState().accountAvatarStyle).toBe('icon');
    useDevicePrefsStore.setState({ accountAvatarStyle: 'picture' });
  });
});
