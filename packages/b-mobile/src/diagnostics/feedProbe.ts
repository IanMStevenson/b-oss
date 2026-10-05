// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// One-shot diagnostic for b-oss#196: what depth limit and page-size support does each entry feed
// have? Read-only. For every feed it records what the server actually served (`page.index/size/
// more` and the entry count) for a baseline page, a 100-entry page, and deep seeks past the
// 200-page clamp #153 found on entries/journal.
//
// Inert unless the build sets VITE_FEED_PROBE=1, so it can never run in a normal build. When
// enabled it runs once per install (re-armed by clearing app data), once signed in, and:
//   - logs one `[feedprobe]` console line per probe (adb logcat | grep feedprobe)
//   - stores the whole result as JSON under the `b-mobile:feed-probe-result` preference
//     (adb shell run-as <pkg> cat shared_prefs/CapacitorStorage.xml)
// Probes run sequentially and stop at the first rate-limit error rather than burning the allowance.

import type { BlipfotoClient, EntriesResponse } from '@b-oss/b-api';
import { BlipfotoError } from '@b-oss/b-api';
import { getClient } from '../data/client.js';
import { getPref, setPref } from '../platform/prefs.js';
import { authReady } from '../state/authReady.js';
import { useAccountsStore } from '../state/accountsStore.js';

const DONE_KEY = 'b-mobile:feed-probe-done';
const RESULT_KEY = 'b-mobile:feed-probe-result';

type Fetch = (client: BlipfotoClient, pageIndex: number, pageSize: number) => Promise<EntriesResponse>;

interface Feed {
  name: string;
  fetch: Fetch;
}

export interface ProbeRow {
  feed: string;
  requestedIndex: number;
  requestedSize: number;
  servedIndex?: number;
  servedSize?: number;
  more?: number;
  count?: number;
  error?: string;
}

function feeds(username: string): Feed[] {
  return [
    { name: 'journal (control)', fetch: (c, i, s) => c.getJournalEntries({ pageIndex: i, pageSize: s }) },
    { name: 'recent', fetch: (c, i, s) => c.getRecentEntries({ pageIndex: i, pageSize: s }) },
    { name: 'popular', fetch: (c, i, s) => c.getPopularEntries({ pageIndex: i, pageSize: s }) },
    { name: 'following', fetch: (c, i, s) => c.getFollowingEntries({ pageIndex: i, pageSize: s }) },
    {
      name: 'favourites',
      fetch: (c, i, s) => c.getFavoriteEntries({ username, pageIndex: i, pageSize: s }),
    },
    {
      name: 'tag search',
      fetch: (c, i, s) => c.searchEntries({ query: 'sunset', pageIndex: i, pageSize: s }),
    },
    {
      name: 'text search',
      fetch: (c, i, s) => c.searchEntries({ query: 'london', pageIndex: i, pageSize: s }),
    },
    {
      name: 'nearby',
      fetch: (c, i, s) =>
        c.searchEntries({
          location_type: 'radial',
          lat: 51.5,
          lon: -0.12,
          distance: 50,
          pageIndex: i,
          pageSize: s,
        }),
    },
  ];
}

// [index, size]: baseline; a 100-entry page; the clamp boundary at both sizes; and a far seek.
const PROBES: Array<[number, number]> = [
  [0, 30],
  [0, 100],
  [199, 30],
  [201, 30],
  [201, 100],
  [1000, 30],
];

export async function runFeedProbe(): Promise<ProbeRow[]> {
  const account = useAccountsStore
    .getState()
    .accounts.find((a) => a.id === useAccountsStore.getState().activeAccountId);
  if (!account) throw new Error('no active account');
  const client = await getClient();
  const rows: ProbeRow[] = [];

  for (const feed of feeds(account.username)) {
    for (const [requestedIndex, requestedSize] of PROBES) {
      const row: ProbeRow = { feed: feed.name, requestedIndex, requestedSize };
      try {
        const res = await feed.fetch(client, requestedIndex, requestedSize);
        row.servedIndex = res.page.index;
        row.servedSize = res.page.size;
        row.more = res.page.more;
        row.count = res.entries.length;
      } catch (err) {
        row.error = err instanceof Error ? err.message : String(err);
        rows.push(row);
        console.warn('[feedprobe]', JSON.stringify(row));
        if (err instanceof BlipfotoError && err.isRateLimited) return rows;
        continue;
      }
      rows.push(row);
      console.warn('[feedprobe]', JSON.stringify(row));
    }
  }
  return rows;
}

/** Called once from AppShell's startup effect. A no-op in any build without VITE_FEED_PROBE=1. */
export async function maybeRunFeedProbe(): Promise<void> {
  if (import.meta.env.VITE_FEED_PROBE !== '1') return;
  await authReady;
  if (!useAccountsStore.getState().activeAccountId) return; // retried on the next launch
  if ((await getPref(DONE_KEY)) === '1') return;
  try {
    const rows = await runFeedProbe();
    await setPref(RESULT_KEY, JSON.stringify(rows));
    await setPref(DONE_KEY, '1');
    console.warn('[feedprobe] done', rows.length, 'probes');
  } catch (err) {
    console.warn('[feedprobe] failed', err instanceof Error ? err.message : String(err));
  }
}
