// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Feed/entry fetchers used by usePagedResource/useResource, each wrapping a b-api call and
// mapping the result through the live adapter (viewModel.ts). One function per SCR-02 tab plus
// SCR-05's tag search and SCR-06's single-entry load.

import { getClient, withRateLimitFallback } from './client.js';
import { stubToEntryIndex, entryResponseToViewEntry } from './viewModel.js';
import { t } from '../strings/index.js';
import type { Page } from './usePagedResource.js';
import type { EntryIndex, BlipEntry } from '@b-oss/b-view';
import { BlipfotoError } from '@b-oss/b-api';
import type { BlipEntryActions, BlipFriendship, BlipComment as ApiComment } from '@b-oss/b-api';

// Exported so callers of usePagedResource can pass it through as that hook's own `pageSize`
// argument — needed for seekTo()/loadBefore() (b-oss#153) to convert an absolute entry offset
// into the right API pageIndex. Every fetcher in this file uses the same fixed size.
export const PAGE_SIZE = 30;

// Recent/Popular/Nearby/Tag/Search are pure public browsing — content is identical regardless of
// who's asking (confirmed: no per-viewer field in EntryIndex/the list response shape), so a
// rate-limited active-account token falls back to the anonymous app token instead of a hard
// failure (client.ts's withRateLimitFallback doc comment has the full reasoning). Following and
// Just-me are deliberately excluded below — both are genuinely account-specific.
export async function fetchRecentPage(pageIndex: number): Promise<Page<EntryIndex>> {
  return withRateLimitFallback(async (client) => {
    const res = await client.getRecentEntries({ pageIndex, pageSize: PAGE_SIZE });
    return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
  });
}

export async function fetchPopularPage(pageIndex: number): Promise<Page<EntryIndex>> {
  return withRateLimitFallback(async (client) => {
    const res = await client.getPopularEntries({ pageIndex, pageSize: PAGE_SIZE });
    return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
  });
}

export async function fetchFollowingPage(pageIndex: number): Promise<Page<EntryIndex>> {
  const client = await getClient();
  const res = await client.getFollowingEntries({ pageIndex, pageSize: PAGE_SIZE });
  return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
}

export async function fetchJustMePage(pageIndex: number): Promise<Page<EntryIndex>> {
  const client = await getClient();
  const res = await client.getJournalEntries({ pageIndex, pageSize: PAGE_SIZE });
  return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
}

export async function fetchNearbyPage(
  pageIndex: number,
  coords: { lat: number; lon: number },
): Promise<Page<EntryIndex>> {
  return withRateLimitFallback(async (client) => {
    const res = await client.searchEntries({
      location_type: 'radial',
      lat: coords.lat,
      lon: coords.lon,
      distance: 50,
      pageIndex,
      pageSize: PAGE_SIZE,
    });
    return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
  });
}

export async function fetchTagPage(tag: string, pageIndex: number): Promise<Page<EntryIndex>> {
  return withRateLimitFallback(async (client) => {
    const res = await client.searchEntries({ query: tag, pageIndex, pageSize: PAGE_SIZE });
    return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
  });
}

/** SCR-03's Entries tab. Same shape as every other feed; the caller (SearchScreen) is what keeps
 * this from running for an empty/whitespace term (FLW-04: "no search runs"). */
export async function fetchSearchEntriesPage(
  query: string,
  pageIndex: number,
): Promise<Page<EntryIndex>> {
  return withRateLimitFallback(async (client) => {
    const res = await client.searchEntries({ query, pageIndex, pageSize: PAGE_SIZE });
    return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
  });
}

export interface LoadedEntry {
  entry: BlipEntry;
  prevEntryId: string | null;
  nextEntryId: string | null;
  /** Per-viewer action flags (glossary.md) driving the action bar — null only if the server
   * omitted them, treated as "nothing offered" rather than guessed. */
  actions: BlipEntryActions | null;
  starred: boolean;
  favorited: boolean;
  /** The viewer's relationship to the entry's author, for the Follow/Unfollow affordance (§FLW-08).
   * Absent on one's own entry (nothing to follow). */
  friendship: BlipFriendship | null;
  /** Raw b-api comments, not routed through the b-view live adapter: comment actions (reply/edit/
   * delete) are a live-interaction concept with no backup-viewer equivalent, so b-view's shared
   * BlipComment type doesn't carry them (same reasoning as EntryIndex.username). */
  comments: ApiComment[];
}

/** FLW-13's Delete — a direct, immediate call (unlike Edit/Replace-photo, which enqueue a durable
 * background upload via flows/composeFlow.ts): deleting has no file to send and no reason to
 * survive leaving the screen, so there's nothing the queue would add here. */
export async function deleteEntry(entryId: string): Promise<void> {
  const client = await getClient();
  await client.deleteEntry(entryId);
}

/** SCR-06's error-state message is whatever `Error.message` this throws (useResource/
 * useLiveEntry display it as-is, with no mapApiError step of their own) — so codes 104/202 get
 * their own copy-deck wording (error-codes.md's own TODO F/G note) by rewriting the error here,
 * at the one place SCR-06 fetches an entry, rather than teaching the generic four-state primitive
 * about per-screen copy keys.
 *
 * Deliberately NOT wrapped in withRateLimitFallback, unlike this file's other browse/listing
 * fetchers: this call requests returnFriendships/returnActions, which are genuinely per-viewer
 * (whether you're following the author, whether you've starred/favourited this entry) — an
 * anonymous fallback would show that state incorrectly (e.g. your own star looking un-starred)
 * rather than just looking the same either way, the assumption the fallback otherwise relies on. */
export async function fetchEntry(entryId: string): Promise<LoadedEntry> {
  const client = await getClient();
  try {
    const res = await client.getEntry(entryId, {
      returnDetails: true,
      returnMetadata: true,
      returnComments: true,
      includeReplies: true,
      returnRelated: true,
      returnFriendships: true,
      returnActions: true,
      returnImageUrls: true,
    });
    return {
      entry: entryResponseToViewEntry(res),
      prevEntryId: res.related?.previous?.entry_id_str ?? null,
      nextEntryId: res.related?.next?.entry_id_str ?? null,
      actions: res.actions ?? null,
      starred: res.details?.stars.starred === 1,
      favorited: res.details?.favorites.favorited === 1,
      friendship: res.friendships?.[0] ?? null,
      comments: res.comments?.list ?? [],
    };
  } catch (err) {
    if (err instanceof BlipfotoError) {
      if (err.code === 104) throw new Error(t('SCR-06.error.protected'));
      if (err.code === 202) throw new Error(t('SCR-06.error.unavailable'));
    }
    throw err;
  }
}
