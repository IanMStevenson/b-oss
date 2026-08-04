// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Feed/entry fetchers used by usePagedResource/useResource, each wrapping a b-api call and
// mapping the result through the live adapter (viewModel.ts). One function per SCR-02 tab plus
// SCR-05's tag search and SCR-06's single-entry load.

import { getClient } from './client.js';
import { stubToEntryIndex, entryResponseToViewEntry } from './viewModel.js';
import type { Page } from './usePagedResource.js';
import type { EntryIndex, BlipEntry } from '@b-oss/b-view';

const PAGE_SIZE = 30;

export async function fetchRecentPage(pageIndex: number): Promise<Page<EntryIndex>> {
  const client = await getClient();
  const res = await client.getRecentEntries({ pageIndex, pageSize: PAGE_SIZE });
  return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
}

export async function fetchPopularPage(pageIndex: number): Promise<Page<EntryIndex>> {
  const client = await getClient();
  const res = await client.getPopularEntries({ pageIndex, pageSize: PAGE_SIZE });
  return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
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
  const client = await getClient();
  const res = await client.searchEntries({
    location_type: 'radial',
    lat: coords.lat,
    lon: coords.lon,
    distance: 50,
    pageIndex,
    pageSize: PAGE_SIZE,
  });
  return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
}

export async function fetchTagPage(tag: string, pageIndex: number): Promise<Page<EntryIndex>> {
  const client = await getClient();
  const res = await client.searchEntries({ query: tag, pageIndex, pageSize: PAGE_SIZE });
  return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
}

export interface LoadedEntry {
  entry: BlipEntry;
  prevEntryId: string | null;
  nextEntryId: string | null;
}

export async function fetchEntry(entryId: string): Promise<LoadedEntry> {
  const client = await getClient();
  const res = await client.getEntry(entryId, {
    returnDetails: true,
    returnMetadata: true,
    returnComments: true,
    includeReplies: true,
    returnRelated: true,
    returnActions: true,
    returnImageUrls: true,
  });
  return {
    entry: entryResponseToViewEntry(res),
    prevEntryId: res.related?.previous?.entry_id_str ?? null,
    nextEntryId: res.related?.next?.entry_id_str ?? null,
  };
}
