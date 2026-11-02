// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { SettingsScreen } from '../SettingsScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
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

function isDisabled(el: Element | null): boolean {
  return el !== null && (el as { disabled?: boolean }).disabled === true;
}

function renderHub() {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <OverlayHost />
        <SettingsScreen />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('SettingsScreen hub', () => {
  it('lists every row of the restructured hub', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    for (const label of [
      'Appearance',
      'Reminders',
      'Accounts',
      'Hidden members',
      'Details & journal',
      'Profile',
      'Notification settings',
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    for (const gone of ['General', 'Journal', 'Browsing', 'Notifications', 'Misc']) {
      expect(screen.queryByText(gone)).toBeNull();
    }
  });

  it('orders the rows as App settings then Blipfoto account settings', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    const rows = Array.from(document.querySelectorAll('ion-item')).map((i) => i.textContent);
    expect(rows.map((r) => r?.replace(/alice$/, ''))).toEqual([
      'Appearance',
      'Reminders',
      'Accounts',
      'Hidden members',
      'Details & journal',
      'Profile',
      'Notification settings',
    ]);
  });

  it('groups rows under Blipfoto account settings and App Settings headers', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    expect(screen.getByText('Blipfoto account settings')).toBeDefined();
    expect(screen.getByText('App settings')).toBeDefined();
  });

  it('each row navigates to its own page', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    const cases: Array<[string, string]> = [
      ['Appearance', '/settings/appearance'],
      ['Reminders', '/settings/reminders'],
      ['Details & journal', '/settings/details'],
      ['Profile', '/settings/profile'],
      ['Notification settings', '/settings/notifications'],
    ];
    for (const [label, path] of cases) {
      await userEvent.click(screen.getByText(label));
      expect(push).toHaveBeenCalledWith(path);
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

  it('loading: shows a spinner while the privacy fetch is in flight, without blocking the hub rows', () => {
    fetchUserSettings.mockReturnValue(new Promise(() => {}));
    renderHub();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
    expect(screen.getByText('Appearance')).toBeDefined();
  });

  it('still shows the hub rows when the privacy fetch fails', async () => {
    fetchUserSettings.mockRejectedValue(new Error('down'));
    renderHub();
    expect(await screen.findByText(/Could not load your privacy setting/)).toBeDefined();
    expect(screen.getByText('Appearance')).toBeDefined();
  });
});

describe('SettingsScreen section routing', () => {
  it('renders the Details & journal section when given section="details"', async () => {
    render(
      <MemoryRouter>
        <OverlayProvider>
          <OverlayHost />
          <SettingsScreen section="details" />
        </OverlayProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Details & journal')).toBeDefined();
    expect(await screen.findByText('Your journal')).toBeDefined();
  });

  it('renders Appearance (with the former Browsing controls) for section="appearance"', () => {
    render(
      <MemoryRouter>
        <OverlayProvider>
          <OverlayHost />
          <SettingsScreen section="appearance" />
        </OverlayProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Show zoom/navigation bar')).toBeDefined();
    expect(screen.getByText('Links')).toBeDefined();
  });

  it('renders Reminders for section="reminders"', () => {
    render(
      <MemoryRouter>
        <OverlayProvider>
          <OverlayHost />
          <SettingsScreen section="reminders" />
        </OverlayProvider>
      </MemoryRouter>,
    );
    expect(screen.getByLabelText('Daily reminder')).toBeDefined();
  });

  it('the hub is a nav-menu destination: menu button, no back arrow (b-oss#278)', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    expect(document.querySelector('ion-menu-button')).not.toBeNull();
    expect(document.querySelector('ion-back-button')).toBeNull();
  });

  it('Accounts and Hidden members rows push as drill-ins so they show a back arrow (b-oss#273)', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    await userEvent.click(screen.getByText('Accounts'));
    expect(push).toHaveBeenCalledWith('/accounts');
    await userEvent.click(screen.getByText('Hidden members'));
    expect(push).toHaveBeenCalledWith('/hidden');
  });

  it('falls back to the hub for an unrecognised section', async () => {
    render(
      <MemoryRouter>
        <OverlayProvider>
          <OverlayHost />
          <SettingsScreen section="not-a-real-section" />
        </OverlayProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    expect(screen.getByText('Accounts')).toBeDefined();
  });

  describe('signed out', () => {
    beforeEach(() => {
      useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
    });

    it('does not fetch user/settings, and says the account rows need a sign-in', () => {
      renderHub();
      expect(fetchUserSettings).not.toHaveBeenCalled();
      expect(screen.getByText('Sign in to change these.')).toBeDefined();
      expect(screen.queryByText(/Could not load/)).toBeNull();
    });

    it('greys out the Blipfoto account rows', () => {
      renderHub();
      const item = (label: string) => screen.getByText(label).closest('ion-item')!;
      for (const label of ['Details & journal', 'Profile', 'Notification settings']) {
        expect(isDisabled(item(label))).toBe(true);
      }
    });

    it('keeps the App settings rows enabled and navigable', async () => {
      renderHub();
      for (const label of ['Appearance', 'Reminders', 'Accounts', 'Hidden members']) {
        expect(isDisabled(screen.getByText(label).closest('ion-item'))).toBe(false);
      }
      await userEvent.click(screen.getByText('Appearance'));
      expect(push).toHaveBeenCalledWith('/settings/appearance');
    });
  });
});
