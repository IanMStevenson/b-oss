// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { BlipfotoError } from '@b-oss/b-api';
import { JournalSection } from '../sections/JournalSection.js';
import { useAccountsStore } from '../../../state/accountsStore.js';

const { fetchUserSettings, saveUserSettings } = vi.hoisted(() => ({
  fetchUserSettings: vi.fn(),
  saveUserSettings: vi.fn(),
}));
vi.mock('../../../data/settings.js', () => ({ fetchUserSettings, saveUserSettings }));

const goBack = vi.fn();
vi.mock('../../../app/routes/useAppNavigate.js', () => ({
  useAppNavigate: () => ({ push: vi.fn(), replace: vi.fn(), goBack }),
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
    journal_title: 'My journal',
    real_name: '',
    real_name_search: 0,
    biography: '',
    locale_code: 'en',
    country_code: 'gb',
    privacy: 0,
    comments: 1,
    avatar_url: '',
  });
  saveUserSettings.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <JournalSection />
    </MemoryRouter>,
  );
}

describe('JournalSection', () => {
  it('loads current values', async () => {
    renderScreen();
    expect(await screen.findByDisplayValue('My journal')).toBeDefined();
  });

  it('shows an error state when the load fails', async () => {
    fetchUserSettings.mockRejectedValue(new BlipfotoError(500, 'Server error'));
    renderScreen();
    expect(await screen.findByText('Server error')).toBeDefined();
  });

  it('toggling privacy and saving sends the flag', async () => {
    renderScreen();
    await screen.findByDisplayValue('My journal');
    const privacyToggle = screen.getByText('Protected journal').closest('ion-checkbox')!;
    privacyToggle.dispatchEvent(
      new CustomEvent('ionChange', { bubbles: true, detail: { checked: true } }),
    );
    await userEvent.click(screen.getByText('Save', { selector: 'ion-button' }));

    await waitFor(() =>
      expect(saveUserSettings).toHaveBeenCalledWith({
        journal_title: 'My journal',
        privacy: 1,
        comments: 1,
      }),
    );
    expect(goBack).toHaveBeenCalled();
  });

  it('read-only accounts see values with no Save affordance', async () => {
    useAccountsStore.setState({
      accounts: [account({ appTokenScope: 'read' })],
      activeAccountId: 'a1',
    });
    renderScreen();
    await screen.findByDisplayValue('My journal');
    expect(screen.queryByText('Save', { selector: 'ion-button' })).toBeNull();
    expect(screen.getByText('This account is read-only.')).toBeDefined();
  });
});
