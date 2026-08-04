// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsScreen } from '../SettingsScreen.js';
import { useAccountsStore } from '../../../state/accountsStore.js';

const { fetchUserSettings } = vi.hoisted(() => ({ fetchUserSettings: vi.fn() }));
vi.mock('../../../data/settings.js', () => ({
  fetchUserSettings,
  saveUserSettings: vi.fn(),
  fetchNotificationSettings: vi.fn(),
  saveNotificationSettings: vi.fn(),
}));

const { fetchCountries, fetchLocales } = vi.hoisted(() => ({
  fetchCountries: vi.fn(),
  fetchLocales: vi.fn(),
}));
vi.mock('../../../data/config.js', () => ({ fetchCountries, fetchLocales }));

const push = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack: vi.fn() }),
}));

function baseSettings(overrides: Record<string, unknown> = {}) {
  return {
    username: 'alice',
    journal_title: 'My journal',
    real_name: '',
    real_name_search: 0,
    biography: '',
    locale_code: 'en',
    country_code: 'gb',
    privacy: 0,
    comments: 1,
    avatar_url: '',
    ...overrides,
  };
}

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
  fetchUserSettings.mockResolvedValue(baseSettings());
  fetchCountries.mockResolvedValue([{ code: 'gb', title: 'United Kingdom' }]);
  fetchLocales.mockResolvedValue([{ code: 'en', title: 'English' }]);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderHub() {
  return render(
    <MemoryRouter>
      <SettingsScreen />
    </MemoryRouter>,
  );
}

describe('SettingsScreen hub', () => {
  it('lists every section row, Hidden members, and Accounts', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    for (const label of [
      'Accounts',
      'General',
      'Journal',
      'Profile',
      'Notifications',
      'Reminders',
      'Misc',
      'Hidden members',
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
  });

  it('hides Refused followers for an unprotected journal', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    expect(screen.queryByText('Refused followers')).toBeNull();
  });

  it('shows Refused followers once the journal is protected', async () => {
    fetchUserSettings.mockResolvedValue(baseSettings({ privacy: 1 }));
    renderHub();
    expect(await screen.findByText('Refused followers')).toBeDefined();
  });

  it('hides Reminders for a read-only account', async () => {
    useAccountsStore.setState({
      accounts: [account({ appTokenScope: 'read' })],
      activeAccountId: 'a1',
    });
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    expect(screen.queryByText('Reminders')).toBeNull();
  });

  it('tapping General navigates to /settings/general', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    await userEvent.click(screen.getByText('General'));
    expect(push).toHaveBeenCalledWith('/settings/general');
  });

  it('still shows the hub rows when the privacy fetch fails', async () => {
    fetchUserSettings.mockRejectedValue(new Error('down'));
    renderHub();
    expect(await screen.findByText(/Could not load your privacy setting/)).toBeDefined();
    expect(screen.getByText('General')).toBeDefined();
  });
});

describe('SettingsScreen section routing', () => {
  it('renders the General section when given section="general"', async () => {
    render(
      <MemoryRouter>
        <SettingsScreen section="general" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('General')).toBeDefined();
  });

  it('falls back to the hub for an unrecognised section', async () => {
    render(
      <MemoryRouter>
        <SettingsScreen section="not-a-real-section" />
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    expect(screen.getByText('Accounts')).toBeDefined();
  });
});
