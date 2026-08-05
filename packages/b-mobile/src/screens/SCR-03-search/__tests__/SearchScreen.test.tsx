// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { Router } from 'react-router-dom';
import { createMemoryHistory } from 'history';
import { SearchScreen } from '../SearchScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import { useHiddenMembersStore } from '../../../state/hiddenMembersStore.js';
import { useAccountsStore } from '../../../state/accountsStore.js';
import type { EntryIndex } from '@b-oss/b-view';
import type { BlipUser } from '@b-oss/b-api';

vi.mock('../../../data/entries.js', () => ({
  fetchSearchEntriesPage: vi.fn(),
}));

vi.mock('../../../data/users.js', () => ({
  fetchSearchUsersPage: vi.fn(),
}));

vi.mock('../../../platform/prefs.js', () => ({
  getPref: vi.fn().mockResolvedValue(null),
  setPref: vi.fn().mockResolvedValue(undefined),
  deletePref: vi.fn().mockResolvedValue(undefined),
}));

const entry: EntryIndex = {
  entry_id: 'e1',
  date: '2026-01-01',
  title: 'Sunrise',
  thumbnail_path: 'https://example.com/thumb.jpg',
  json_path: 'e1',
};

const user: BlipUser = { username: 'alice', avatar_url: '', icons: [] };

beforeEach(() => {
  useHiddenMembersStore.setState({ hiddenByAccount: {}, hydrated: true });
  useAccountsStore.setState({ accounts: [], activeAccountId: null, hydrated: true });
});

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  const history = createMemoryHistory();
  const utils = render(
    <Router history={history}>
      <OverlayProvider>
        <OverlayHost />
        <SearchScreen />
      </OverlayProvider>
    </Router>,
  );
  return { history, ...utils };
}

function getInput(): HTMLInputElement {
  return screen.getByLabelText('Search');
}

describe('SearchScreen', () => {
  it('shows a neutral idle prompt with no query, and runs no search', async () => {
    const { fetchSearchEntriesPage } = await import('../../../data/entries.js');
    renderScreen();
    expect(screen.getByText('Search entries and people.')).toBeDefined();
    await new Promise((r) => setTimeout(r, 500));
    expect(fetchSearchEntriesPage).not.toHaveBeenCalled();
  });

  it('does not search for a whitespace-only query', async () => {
    const { fetchSearchEntriesPage } = await import('../../../data/entries.js');
    renderScreen();
    fireEvent.change(getInput(), { target: { value: '   ' } });
    await new Promise((r) => setTimeout(r, 500));
    expect(fetchSearchEntriesPage).not.toHaveBeenCalled();
    expect(screen.getByText('Search entries and people.')).toBeDefined();
  });

  it('searches the Entries tab after the debounce for a non-empty term', async () => {
    const { fetchSearchEntriesPage } = await import('../../../data/entries.js');
    vi.mocked(fetchSearchEntriesPage).mockResolvedValue({ items: [entry], more: false });
    renderScreen();
    fireEvent.change(getInput(), { target: { value: 'sun' } });
    await waitFor(() => expect(fetchSearchEntriesPage).toHaveBeenCalledWith('sun', 0), {
      timeout: 2000,
    });
    expect(await screen.findByLabelText('Sunrise')).toBeDefined();
  });

  it('searches immediately on submit, bypassing the debounce', async () => {
    const { fetchSearchEntriesPage } = await import('../../../data/entries.js');
    vi.mocked(fetchSearchEntriesPage).mockResolvedValue({ items: [], more: false });
    renderScreen();
    const input = getInput();
    fireEvent.change(input, { target: { value: 'sun' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(fetchSearchEntriesPage).toHaveBeenCalledWith('sun', 0));
  });

  it('loading: shows a spinner while the search fetch is in flight', async () => {
    const { fetchSearchEntriesPage } = await import('../../../data/entries.js');
    vi.mocked(fetchSearchEntriesPage).mockReturnValue(new Promise(() => {}));
    renderScreen();
    fireEvent.change(getInput(), { target: { value: 'sun' } });
    await waitFor(() => expect(document.querySelector('ion-spinner')).not.toBeNull());
  });

  it('shows an empty state naming the term', async () => {
    const { fetchSearchEntriesPage } = await import('../../../data/entries.js');
    vi.mocked(fetchSearchEntriesPage).mockResolvedValue({ items: [], more: false });
    renderScreen();
    fireEvent.change(getInput(), { target: { value: 'nope' } });
    expect(await screen.findByText('No results for ‘nope’.')).toBeDefined();
  });

  it('shows an error with retry on failure', async () => {
    const { fetchSearchEntriesPage } = await import('../../../data/entries.js');
    vi.mocked(fetchSearchEntriesPage).mockRejectedValue(new Error('Network down'));
    renderScreen();
    fireEvent.change(getInput(), { target: { value: 'sun' } });
    expect(await screen.findByText('Network down')).toBeDefined();
  });

  it('tapping an entry result opens SCR-06', async () => {
    const { fetchSearchEntriesPage } = await import('../../../data/entries.js');
    vi.mocked(fetchSearchEntriesPage).mockResolvedValue({ items: [entry], more: false });
    const { history } = renderScreen();
    fireEvent.change(getInput(), { target: { value: 'sun' } });
    const tile = await screen.findByLabelText('Sunrise');
    fireEvent.click(tile);
    expect(history.location.pathname).toBe('/entry/e1');
  });

  it('switching to the People tab searches it for the current term', async () => {
    const { fetchSearchUsersPage } = await import('../../../data/users.js');
    vi.mocked(fetchSearchUsersPage).mockResolvedValue({ items: [user], more: false });
    renderScreen();
    fireEvent.change(getInput(), { target: { value: 'ali' } });

    const segment = document.querySelector('ion-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'people' } }));

    await waitFor(() => expect(fetchSearchUsersPage).toHaveBeenCalledWith('ali', 0), {
      timeout: 2000,
    });
    expect(await screen.findByText('alice')).toBeDefined();
  });

  it('tapping a person result opens their profile', async () => {
    const { fetchSearchUsersPage } = await import('../../../data/users.js');
    vi.mocked(fetchSearchUsersPage).mockResolvedValue({ items: [user], more: false });
    const { history } = renderScreen();
    fireEvent.change(getInput(), { target: { value: 'ali' } });
    const segment = document.querySelector('ion-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'people' } }));
    const row = await screen.findByText('alice');
    fireEvent.click(row);
    expect(history.location.pathname).toBe('/user/alice');
  });

  it('marks a hidden member as Hidden in the People tab, rather than suppressing them', async () => {
    useAccountsStore.setState({
      accounts: [
        {
          id: 'a1',
          username: 'me',
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
    useHiddenMembersStore.setState({ hiddenByAccount: { a1: ['alice'] }, hydrated: true });
    const { fetchSearchUsersPage } = await import('../../../data/users.js');
    vi.mocked(fetchSearchUsersPage).mockResolvedValue({ items: [user], more: false });
    renderScreen();
    fireEvent.change(getInput(), { target: { value: 'ali' } });
    const segment = document.querySelector('ion-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'people' } }));
    expect(await screen.findByText('alice')).toBeDefined();
    expect(screen.getByText('(Hidden)')).toBeDefined();
  });

  it('does not refetch a tab already searched for the same term when switching back to it', async () => {
    const { fetchSearchEntriesPage } = await import('../../../data/entries.js');
    const { fetchSearchUsersPage } = await import('../../../data/users.js');
    vi.mocked(fetchSearchEntriesPage).mockResolvedValue({ items: [entry], more: false });
    vi.mocked(fetchSearchUsersPage).mockResolvedValue({ items: [], more: false });
    renderScreen();
    fireEvent.change(getInput(), { target: { value: 'sun' } });
    await screen.findByLabelText('Sunrise');
    expect(fetchSearchEntriesPage).toHaveBeenCalledTimes(1);

    const segment = document.querySelector('ion-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'people' } }));
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'entries' } }));

    await new Promise((r) => setTimeout(r, 500));
    expect(fetchSearchEntriesPage).toHaveBeenCalledTimes(1);
  });
});
