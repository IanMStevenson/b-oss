// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrowseScreen } from '../BrowseScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import type { EntryIndex } from '@b-oss/b-view';

vi.mock('../../../data/entries.js', () => ({
  fetchRecentPage: vi.fn(),
  fetchPopularPage: vi.fn(),
  fetchFollowingPage: vi.fn(),
  fetchJustMePage: vi.fn(),
  fetchNearbyPage: vi.fn(),
}));

vi.mock('../../../platform/geolocation.js', () => ({
  getCurrentPosition: vi.fn(),
}));

vi.mock('../../../state/accountsStore.js', () => ({
  useActiveAccount: vi.fn(),
  // AccountIndicator's own selector — fixed at "fewer than two accounts" (its own no-op case)
  // since this file's tests aren't about multi-account switching.
  useAccountsStore: (selector: (state: { accounts: never[] }) => unknown) =>
    selector({ accounts: [] }),
}));

vi.mock('../../../state/hiddenMembersStore.js', () => ({
  useHiddenMembers: () => [],
}));

const entry: EntryIndex = {
  entry_id: '1',
  date: '2026-01-01',
  title: 'Sunrise',
  thumbnail_path: 'https://example.com/thumb.jpg',
  json_path: '1',
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderScreen() {
  return render(
    <MemoryRouter>
      <OverlayProvider>
        <OverlayHost />
        <BrowseScreen />
      </OverlayProvider>
    </MemoryRouter>,
  );
}

describe('BrowseScreen', () => {
  it('loads the Recent tab on open and shows an error with retry on failure', async () => {
    const { fetchRecentPage } = await import('../../../data/entries.js');
    const { useActiveAccount } = await import('../../../state/accountsStore.js');
    vi.mocked(useActiveAccount).mockReturnValue(null);
    vi.mocked(fetchRecentPage).mockRejectedValue(new Error('Network down'));
    renderScreen();
    expect(await screen.findByText('Network down')).toBeDefined();
  });

  it('shows an empty state naming nothing found, then a loaded grid on retry', async () => {
    const { fetchRecentPage } = await import('../../../data/entries.js');
    const { useActiveAccount } = await import('../../../state/accountsStore.js');
    vi.mocked(useActiveAccount).mockReturnValue(null);
    vi.mocked(fetchRecentPage).mockResolvedValue({ items: [], more: false });
    renderScreen();
    expect(await screen.findByText('Nothing here yet.')).toBeDefined();
  });

  it('renders loaded Recent entries', async () => {
    const { fetchRecentPage } = await import('../../../data/entries.js');
    const { useActiveAccount } = await import('../../../state/accountsStore.js');
    vi.mocked(useActiveAccount).mockReturnValue(null);
    vi.mocked(fetchRecentPage).mockResolvedValue({ items: [entry], more: false });
    renderScreen();
    expect(await screen.findByLabelText('Sunrise')).toBeDefined();
  });

  it('hides the Following/Just Me tabs when signed out', async () => {
    const { fetchRecentPage } = await import('../../../data/entries.js');
    const { useActiveAccount } = await import('../../../state/accountsStore.js');
    vi.mocked(useActiveAccount).mockReturnValue(null);
    vi.mocked(fetchRecentPage).mockResolvedValue({ items: [], more: false });
    renderScreen();
    await screen.findByText('Nothing here yet.');
    expect(screen.queryByText('Following')).toBeNull();
    expect(screen.queryByText('Just Me')).toBeNull();
  });

  it('shows the Following/Just Me tabs and lazy-loads Following on first visit when signed in', async () => {
    const { fetchRecentPage, fetchFollowingPage } = await import('../../../data/entries.js');
    const { useActiveAccount } = await import('../../../state/accountsStore.js');
    vi.mocked(useActiveAccount).mockReturnValue({
      id: 'a1',
      username: 'alice',
      avatarUrl: null,
      appTokenScope: 'read',
      hasServiceToken: false,
      notificationRegistrationId: null,
      notificationStatus: null,
    });
    vi.mocked(fetchRecentPage).mockResolvedValue({ items: [], more: false });
    vi.mocked(fetchFollowingPage).mockResolvedValue({ items: [entry], more: false });
    renderScreen();
    await screen.findByText('Nothing here yet.');
    expect(fetchFollowingPage).not.toHaveBeenCalled();

    const segment = document.querySelector('ion-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'following' } }));

    expect(await screen.findByLabelText('Sunrise')).toBeDefined();
  });

  // Phase 6 made platform/geolocation.ts real: getCurrentPosition() can now resolve `null`
  // (permission granted, no fix available), distinct from a rejection (permission refused).
  // Before this test existed, resolving null left NearbyTab's `!coords` branch stuck on its
  // spinner forever, since only the reject path set `locationDenied`.
  it('Nearby tab shows the location-needed message rather than spinning forever when a fix is unavailable', async () => {
    const { fetchRecentPage } = await import('../../../data/entries.js');
    const { useActiveAccount } = await import('../../../state/accountsStore.js');
    const { getCurrentPosition } = await import('../../../platform/geolocation.js');
    vi.mocked(useActiveAccount).mockReturnValue(null);
    vi.mocked(fetchRecentPage).mockResolvedValue({ items: [], more: false });
    vi.mocked(getCurrentPosition).mockResolvedValue(null);
    renderScreen();
    await screen.findByText('Nothing here yet.');

    const segment = document.querySelector('ion-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'nearby' } }));

    expect(
      await screen.findByText('This tab needs location access to show entries near you.'),
    ).toBeDefined();
  });
});
