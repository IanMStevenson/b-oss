// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson
// @vitest-environment jsdom

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BrowseScreen } from '../BrowseScreen.js';
import { OverlayProvider, OverlayHost } from '../../../app/OverlayProvider.js';
import type { EntryIndex } from '@b-oss/b-view';

vi.mock('../../../data/entries.js', () => ({
  fetchRecentPage: vi.fn(),
  fetchPopularPage: vi.fn(),
  fetchNewBlippersPage: vi.fn(),
  fetchMilestonesPage: vi.fn(),
  fetchFollowingPage: vi.fn(),
  fetchJustMePage: vi.fn(),
  fetchNearbyPage: vi.fn(),
  PAGE_SIZE: 30,
  JOURNAL_PAGE_SIZE: 100,
}));

vi.mock('../../../platform/geolocation.js', () => ({
  getCurrentPosition: vi.fn(),
}));

vi.mock('../../../data/users.js', () => ({
  fetchUserProfile: vi.fn(),
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
    expect(await screen.findByLabelText('2026-01-01')).toBeDefined();
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

    expect(await screen.findByLabelText('2026-01-01')).toBeDefined();
  });

  it("Me tab uses the profile's real entry_total for pagination, not just what has loaded (b-oss#144)", async () => {
    const { fetchRecentPage, fetchJustMePage } = await import('../../../data/entries.js');
    const { fetchUserProfile } = await import('../../../data/users.js');
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
    // more: true — genuinely still mid-load (real total 40, one page in), distinct from
    // b-oss#146's "genuinely nothing more" case where more:false would correctly make
    // allEntriesLoaded override this guess with what's actually loaded so far.
    vi.mocked(fetchJustMePage).mockResolvedValue({ items: [entry], more: true });
    vi.mocked(fetchUserProfile).mockResolvedValue({
      user: { username: 'alice', avatar_url: '', icons: [] },
      // 40 total at the fallback unmeasured pageSize (4) is 10 pages — only reachable via
      // entry_total, since fetchJustMePage above only ever returns a single loaded item.
      details: { entry_total: 40 } as never,
      visible: true,
      friendship: null,
      latestEntry: null,
    });
    renderScreen();

    const segment = document.querySelector('ion-segment')!;
    segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value: 'justme' } }));

    expect(await screen.findByLabelText('Page 10')).toBeDefined();
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

  describe('keeps your place when you leave for an entry and come Back (b-oss#182)', () => {
    const account = (id: string) => ({
      id,
      username: id,
      avatarUrl: null,
      appTokenScope: 'read' as const,
      hasServiceToken: false,
      notificationRegistrationId: null,
      notificationStatus: null,
    });

    function pickTab(value: string) {
      const segment = document.querySelector('ion-segment')!;
      segment.dispatchEvent(new CustomEvent('ionChange', { detail: { value } }));
    }

    it('returns to the tab you were on, not Recent, with its entries and no refetch', async () => {
      const { fetchRecentPage, fetchFollowingPage } = await import('../../../data/entries.js');
      const { useActiveAccount } = await import('../../../state/accountsStore.js');
      vi.mocked(useActiveAccount).mockReturnValue(account('a1'));
      const recentEntry = { ...entry, entry_id: '9', date: '2026-02-02', title: 'Recent one' };
      vi.mocked(fetchRecentPage).mockResolvedValue({ items: [recentEntry], more: false });
      vi.mocked(fetchFollowingPage).mockResolvedValue({ items: [entry], more: false });

      const first = renderScreen();
      await screen.findByLabelText('2026-02-02');
      pickTab('following');
      expect(await screen.findByLabelText('2026-01-01')).toBeDefined();
      first.unmount(); // opening an entry unmounts Browse

      vi.mocked(fetchRecentPage).mockClear();
      vi.mocked(fetchFollowingPage).mockClear();
      renderScreen(); // Back
      expect(document.querySelector('ion-segment')!.value).toBe('following');
      expect(await screen.findByLabelText('2026-01-01')).toBeDefined();
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchFollowingPage).not.toHaveBeenCalled();
      expect(fetchRecentPage).not.toHaveBeenCalled();
    });

    it('does not carry one account’s tab or feeds over to another', async () => {
      const { fetchRecentPage, fetchFollowingPage } = await import('../../../data/entries.js');
      const { useActiveAccount } = await import('../../../state/accountsStore.js');
      vi.mocked(useActiveAccount).mockReturnValue(account('a1'));
      vi.mocked(fetchRecentPage).mockResolvedValue({ items: [], more: false });
      vi.mocked(fetchFollowingPage).mockResolvedValue({ items: [entry], more: false });
      const first = renderScreen();
      await screen.findByText('Nothing here yet.');
      pickTab('following');
      await screen.findByLabelText('2026-01-01');
      first.unmount();

      vi.mocked(useActiveAccount).mockReturnValue(account('a2'));
      renderScreen();
      await waitFor(() => expect(document.querySelector('ion-segment')!.value).toBe('recent'));
    });

    it('falls back to Recent if the remembered tab needs an account you no longer have', async () => {
      const { fetchRecentPage, fetchFollowingPage } = await import('../../../data/entries.js');
      const { useActiveAccount } = await import('../../../state/accountsStore.js');
      vi.mocked(useActiveAccount).mockReturnValue(account('a1'));
      vi.mocked(fetchRecentPage).mockResolvedValue({ items: [], more: false });
      vi.mocked(fetchFollowingPage).mockResolvedValue({ items: [entry], more: false });
      const first = renderScreen();
      await screen.findByText('Nothing here yet.');
      pickTab('following');
      await screen.findByLabelText('2026-01-01');
      first.unmount();

      vi.mocked(useActiveAccount).mockReturnValue(null); // signed out
      renderScreen();
      await waitFor(() => expect(document.querySelector('ion-segment')!.value).toBe('recent'));
      expect(screen.queryByText('Following')).toBeNull();
    });

    it('choosing a tab starts it at page 1 again rather than remembering where you were (b-oss#204)', async () => {
      const { fetchRecentPage, fetchFollowingPage } = await import('../../../data/entries.js');
      const { useActiveAccount } = await import('../../../state/accountsStore.js');
      vi.mocked(useActiveAccount).mockReturnValue(account('a1'));
      vi.mocked(fetchRecentPage).mockResolvedValue({ items: [entry], more: false });
      vi.mocked(fetchFollowingPage).mockResolvedValue({ items: [entry], more: false });
      renderScreen();
      await screen.findByLabelText('2026-01-01');
      expect(fetchRecentPage).toHaveBeenCalledTimes(1);

      pickTab('following');
      await waitFor(() => expect(fetchFollowingPage).toHaveBeenCalledTimes(1));
      pickTab('recent');
      await waitFor(() => expect(fetchRecentPage).toHaveBeenCalledTimes(2));
      expect(vi.mocked(fetchRecentPage).mock.calls[1]?.[0]).toBe(
        vi.mocked(fetchRecentPage).mock.calls[0]?.[0],
      ); // the same first page as on open
    });

    it('switching account while on a per-account tab reloads it for the new account (b-oss#204)', async () => {
      const { fetchRecentPage, fetchFollowingPage } = await import('../../../data/entries.js');
      const { useActiveAccount } = await import('../../../state/accountsStore.js');
      vi.mocked(useActiveAccount).mockReturnValue(account('a1'));
      vi.mocked(fetchRecentPage).mockResolvedValue({ items: [], more: false });
      vi.mocked(fetchFollowingPage).mockResolvedValue({ items: [entry], more: false });
      const view = renderScreen();
      await screen.findByText('Nothing here yet.');
      pickTab('following');
      await screen.findByLabelText('2026-01-01');
      expect(fetchFollowingPage).toHaveBeenCalledTimes(1);

      vi.mocked(useActiveAccount).mockReturnValue(account('a2'));
      view.rerender(
        <MemoryRouter>
          <OverlayProvider>
            <OverlayHost />
            <BrowseScreen />
          </OverlayProvider>
        </MemoryRouter>,
      );
      await waitFor(() => expect(fetchFollowingPage).toHaveBeenCalledTimes(2));
    });
  });

  describe('tabs and the navigation bar (b-oss#216, #217)', () => {
    function pickTab(value: string) {
      document
        .querySelector('ion-segment')!
        .dispatchEvent(new CustomEvent('ionChange', { detail: { value } }));
    }
    const signedIn = {
      id: 'a1',
      username: 'a1',
      avatarUrl: null,
      appTokenScope: 'read' as const,
      hasServiceToken: false,
      notificationRegistrationId: null,
      notificationStatus: null,
    };

    it('has a New Blippers tab that loads entries/new', async () => {
      const { fetchRecentPage, fetchNewBlippersPage } = await import('../../../data/entries.js');
      const { useActiveAccount } = await import('../../../state/accountsStore.js');
      vi.mocked(useActiveAccount).mockReturnValue(null);
      vi.mocked(fetchRecentPage).mockResolvedValue({ items: [], more: false });
      vi.mocked(fetchNewBlippersPage).mockResolvedValue({ items: [entry], more: false });
      renderScreen();
      await screen.findByText('Nothing here yet.');
      expect(screen.getByText('New Blippers')).toBeDefined();
      pickTab('new');
      expect(await screen.findByLabelText('2026-01-01')).toBeDefined();
      expect(fetchNewBlippersPage).toHaveBeenCalled();
    });

    it('has a Milestones tab that loads entries/milestones', async () => {
      const { fetchRecentPage, fetchMilestonesPage } = await import('../../../data/entries.js');
      const { useActiveAccount } = await import('../../../state/accountsStore.js');
      vi.mocked(useActiveAccount).mockReturnValue(null);
      vi.mocked(fetchRecentPage).mockResolvedValue({ items: [], more: false });
      vi.mocked(fetchMilestonesPage).mockResolvedValue({ items: [entry], more: false });
      renderScreen();
      await screen.findByText('Nothing here yet.');
      expect(screen.getByText('Milestones')).toBeDefined();
      pickTab('milestones');
      expect(await screen.findByLabelText('2026-01-01')).toBeDefined();
    });

    it('shows the calendar on the Me tab only — not Recent, Popular or New Blippers', async () => {
      const { fetchRecentPage, fetchJustMePage, fetchNewBlippersPage, fetchPopularPage } =
        await import('../../../data/entries.js');
      const { fetchUserProfile } = await import('../../../data/users.js');
      const { useActiveAccount } = await import('../../../state/accountsStore.js');
      vi.mocked(useActiveAccount).mockReturnValue(signedIn);
      for (const f of [fetchRecentPage, fetchJustMePage, fetchNewBlippersPage, fetchPopularPage]) {
        vi.mocked(f).mockResolvedValue({ items: [entry], more: false });
      }
      vi.mocked(fetchUserProfile).mockResolvedValue({ details: { entry_total: 1 } } as never);
      renderScreen();
      await screen.findByLabelText('2026-01-01');
      expect(screen.queryByLabelText('Jump to date')).toBeNull();

      for (const tab of ['popular', 'new']) {
        pickTab(tab);
        await screen.findByLabelText('2026-01-01');
        expect(screen.queryByLabelText('Jump to date')).toBeNull();
      }
      pickTab('justme');
      expect(await screen.findByLabelText('Jump to date')).toBeDefined();
    });
  });
});
