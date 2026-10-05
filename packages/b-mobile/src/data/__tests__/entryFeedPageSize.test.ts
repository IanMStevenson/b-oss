// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#196: the on-device probe showed every entry feed honours a 100-entry page and clamps
// `page_index` at 200, so every entry feed asks for 100 — a 30-entry page would cap a deep feed at
// 6,000 entries. This pins the page size so a feed can't quietly drift back.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fetchRecentPage,
  fetchPopularPage,
  fetchNewBlippersPage,
  fetchFollowingPage,
  fetchJustMePage,
  fetchNearbyPage,
  fetchTagPage,
  fetchSearchEntriesPage,
  PAGE_SIZE,
} from '../entries.js';
import { fetchFavoriteEntriesFor, fetchJournalEntriesFor } from '../users.js';

const response = { page: { index: 0, size: 100, more: 0 }, entries: [] };
const methods = [
  'getRecentEntries',
  'getPopularEntries',
  'getNewEntries',
  'getFollowingEntries',
  'getJournalEntries',
  'getFavoriteEntries',
  'searchEntries',
] as const;
const client = Object.fromEntries(methods.map((m) => [m, vi.fn()])) as Record<
  (typeof methods)[number],
  ReturnType<typeof vi.fn>
>;

vi.mock('../client.js', () => ({
  getClient: () => Promise.resolve(client),
  withRateLimitFallback: (fn: (c: typeof client) => Promise<unknown>) => fn(client),
}));

beforeEach(() => {
  for (const m of methods) client[m].mockReset().mockResolvedValue(response);
});

describe('entry feed page size', () => {
  it('is 100', () => {
    expect(PAGE_SIZE).toBe(100);
  });

  it.each([
    ['recent', () => fetchRecentPage(3), 'getRecentEntries'],
    ['popular', () => fetchPopularPage(3), 'getPopularEntries'],
    ['new blippers', () => fetchNewBlippersPage(3), 'getNewEntries'],
    ['following', () => fetchFollowingPage(3), 'getFollowingEntries'],
    ['just me', () => fetchJustMePage(3), 'getJournalEntries'],
    ['nearby', () => fetchNearbyPage(3, { lat: 1, lon: 2 }), 'searchEntries'],
    ['tag', () => fetchTagPage('sunset', 3), 'searchEntries'],
    ['text search', () => fetchSearchEntriesPage('london', 3), 'searchEntries'],
    ['favourites', () => fetchFavoriteEntriesFor('alice', 3), 'getFavoriteEntries'],
    ['someone’s journal', () => fetchJournalEntriesFor('alice', 3), 'getJournalEntries'],
  ] as const)('%s requests 100 per page', async (_name, run, method) => {
    await run();
    expect(client[method]).toHaveBeenCalledWith(
      expect.objectContaining({ pageIndex: 3, pageSize: 100 }),
    );
  });
});
