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
  return el?.disabled === true;
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
  it('lists every section row, Hidden members, and Accounts', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    for (const label of [
      'Accounts',
      'Journal',
      'Profile',
      'Notifications',
      'Browsing',
      'Hidden members',
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    // two 'General' rows: the Blipfoto account's own, and App Settings'
    expect(screen.getAllByText('General')).toHaveLength(2);
    expect(screen.queryByText('Misc')).toBeNull();
    expect(screen.queryByText('Reminders')).toBeNull();
  });

  it('puts App Settings General straight after Accounts', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    const rows = Array.from(document.querySelectorAll('ion-item')).map((i) => i.textContent);
    const accounts = rows.findIndex((t) => t?.startsWith('Accounts'));
    expect(rows[accounts + 1]).toBe('General');
  });

  it('groups rows under Blipfoto Account Settings and App Settings headers', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    expect(screen.getByText('Blipfoto Account Settings')).toBeDefined();
    expect(screen.getByText('App Settings')).toBeDefined();
  });

  it('tapping Browsing navigates to /settings/browsing', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    await userEvent.click(screen.getByText('Browsing'));
    expect(push).toHaveBeenCalledWith('/settings/browsing');
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

  it('tapping each General row navigates to its own page', async () => {
    renderHub();
    await waitFor(() => expect(fetchUserSettings).toHaveBeenCalled());
    const [accountGeneral, appGeneral] = screen.getAllByText('General');
    await userEvent.click(accountGeneral);
    expect(push).toHaveBeenCalledWith('/settings/general');
    await userEvent.click(appGeneral);
    expect(push).toHaveBeenCalledWith('/settings/app');
  });

  it('loading: shows a spinner while the privacy fetch is in flight, without blocking the hub rows', () => {
    fetchUserSettings.mockReturnValue(new Promise(() => {}));
    renderHub();
    expect(document.querySelector('ion-spinner')).not.toBeNull();
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
  });

  it('still shows the hub rows when the privacy fetch fails', async () => {
    fetchUserSettings.mockRejectedValue(new Error('down'));
    renderHub();
    expect(await screen.findByText(/Could not load your privacy setting/)).toBeDefined();
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
  });
});

describe('SettingsScreen section routing', () => {
  it('renders the General section when given section="general"', async () => {
    render(
      <MemoryRouter>
        <OverlayProvider>
          <OverlayHost />
          <SettingsScreen section="general" />
        </OverlayProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText('General')).toBeDefined();
  });

  it('renders the Browsing section when given section="browsing"', () => {
    render(
      <MemoryRouter>
        <OverlayProvider>
          <OverlayHost />
          <SettingsScreen section="browsing" />
        </OverlayProvider>
      </MemoryRouter>,
    );
    expect(screen.getByText('Show zoom/navigation bar')).toBeDefined();
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
    expect(push).toHaveBeenCalledWith('/accounts', { drilledIn: true });
    await userEvent.click(screen.getByText('Hidden members'));
    expect(push).toHaveBeenCalledWith('/hidden', { drilledIn: true });
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

    it('greys out the Blipfoto account rows and Hidden members', () => {
      renderHub();
      const item = (label: string) => screen.getAllByText(label)[0].closest('ion-item')!;
      for (const label of ['Journal', 'Profile', 'Notifications', 'Hidden members']) {
        expect(isDisabled(item(label))).toBe(true);
      }
      expect(isDisabled(screen.getAllByText('General')[0].closest('ion-item'))).toBe(true);
    });

    it('keeps Accounts, App General and Browsing enabled and navigable', async () => {
      renderHub();
      const [, appGeneral] = screen.getAllByText('General');
      for (const el of [screen.getByText('Accounts'), appGeneral, screen.getByText('Browsing')]) {
        expect(isDisabled(el.closest('ion-item'))).toBe(false);
      }
      await userEvent.click(appGeneral);
      expect(push).toHaveBeenCalledWith('/settings/app');
    });
  });
});
