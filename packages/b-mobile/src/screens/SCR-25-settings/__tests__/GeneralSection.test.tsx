// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BlipfotoError } from '@b-oss/b-api';
import { GeneralSection } from '../sections/GeneralSection.js';
import { useAccountsStore } from '../../../state/accountsStore.js';

const { fetchUserSettings, saveUserSettings } = vi.hoisted(() => ({
  fetchUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
}));
vi.mock('../../../data/settings.js', () => ({ fetchUserSettings, saveUserSettings }));

const { fetchCountries, fetchLocales } = vi.hoisted(() => ({
  fetchCountries: vi.fn(),
  fetchLocales: vi.fn(),
}));
vi.mock('../../../data/config.js', () => ({ fetchCountries, fetchLocales }));

const push = vi.fn();
const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push, replace: vi.fn(), goBack }),
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
  fetchUserSettings.mockResolvedValue({
    username: 'alice',
    journal_title: '',
    real_name: 'Alice Example',
    real_name_search: 0,
    biography: '',
    locale_code: 'en',
    country_code: 'gb',
    privacy: 0,
    comments: 1,
    avatar_url: '',
  });
  fetchCountries.mockResolvedValue([
    { code: 'gb', title: 'United Kingdom' },
    { code: 'fr', title: 'France' },
  ]);
  fetchLocales.mockResolvedValue([{ code: 'en', title: 'English' }]);
  saveUserSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <GeneralSection />
    </MemoryRouter>,
  );
}

describe('GeneralSection', () => {
  it('loads current values into the form', async () => {
    renderScreen();
    expect(await screen.findByDisplayValue('Alice Example')).toBeDefined();
  });

  it('shows an error state when the load fails', async () => {
    fetchUserSettings.mockRejectedValue(new BlipfotoError(500, 'Server error'));
    renderScreen();
    expect(await screen.findByText('Server error')).toBeDefined();
  });

  it('edits and saves, sending only General fields', async () => {
    renderScreen();
    const input = await screen.findByDisplayValue('Alice Example');
    await userEvent.clear(input);
    await userEvent.type(input, 'Alice Two');
    await userEvent.click(screen.getByText('Save', { selector: 'ion-button' }));

    await waitFor(() =>
      expect(saveUserSettings).toHaveBeenCalledWith({
        real_name: 'Alice Two',
        real_name_search: 0,
        country_code: 'gb',
        locale_code: 'en',
      }),
    );
    expect(goBack).toHaveBeenCalled();
  });

  it('Cancel with no edits goes straight back with no confirmation', async () => {
    renderScreen();
    await screen.findByDisplayValue('Alice Example');
    await userEvent.click(screen.getByText('Cancel', { selector: 'ion-button' }));
    expect(goBack).toHaveBeenCalled();
  });

  it('Cancel with unsaved edits confirms discard', async () => {
    renderScreen();
    const input = await screen.findByDisplayValue('Alice Example');
    await userEvent.type(input, '!');
    await userEvent.click(screen.getByText('Cancel', { selector: 'ion-button' }));
    expect(await screen.findByText('Discard changes?')).toBeDefined();
    expect(goBack).not.toHaveBeenCalled();
  });

  it('read-only accounts see loaded values with no Save affordance', async () => {
    useAccountsStore.setState({
      accounts: [account({ appTokenScope: 'read' })],
      activeAccountId: 'a1',
    });
    renderScreen();
    const input = await screen.findByDisplayValue<HTMLInputElement>('Alice Example');
    expect(input.disabled).toBe(true);
    expect(screen.queryByText('Save', { selector: 'ion-button' })).toBeNull();
    expect(screen.getByText('This account is read-only.')).toBeDefined();
  });
});
