// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Profile/social-graph fetchers for SCR-17/18/19/20/21/22 — same one-function-per-list shape as
// entries.ts. `username: undefined` means "the active account's own" for every endpoint that
// accepts it (getUserProfile, entries/journal, entries/favorites) — the API's own convention,
// which is why SCR-17 (My Profile) and SCR-18 (User Profile) can share one screen component.

import { getClient } from './client.js';
import { stubToEntryIndex } from './viewModel.js';
import type { Page } from './usePagedResource.js';
import type { EntryIndex } from '@b-oss/b-view';
import type {
  BlipUser,
  BlipUserDetails,
  BlipFriendship,
  BlipEntryStub,
  BlipAward,
} from '@b-oss/b-api';

const PAGE_SIZE = 30;

export interface UserProfile {
  user: BlipUser;
  details: BlipUserDetails | null;
  /** Whether the current viewer may see this journal's entries — distinct from `details.privacy`
   * (whether the journal *is* protected). A protected journal the viewer already follows still
   * has visibility 1. */
  visible: boolean;
  friendship: BlipFriendship | null;
  latestEntry: BlipEntryStub | null;
}

export async function fetchUserProfile(username?: string): Promise<UserProfile> {
  const client = await getClient();
  const res = await client.getUserProfile({
    username,
    returnDetails: true,
    returnEntries: true,
    returnFriendship: true,
  });
  return {
    user: res.user,
    details: res.details ?? null,
    visible: res.visibility === 1,
    friendship: res.friendship ?? null,
    latestEntry: res.entries?.latest ?? null,
  };
}

export async function fetchJournalEntriesFor(
  username: string | undefined,
  pageIndex: number,
): Promise<Page<EntryIndex>> {
  const client = await getClient();
  const res = await client.getJournalEntries({ username, pageIndex, pageSize: PAGE_SIZE });
  return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
}

export async function fetchFavoriteEntriesFor(
  username: string | undefined,
  pageIndex: number,
): Promise<Page<EntryIndex>> {
  const client = await getClient();
  const res = await client.getFavoriteEntries({ username, pageIndex, pageSize: PAGE_SIZE });
  return { items: res.entries.map(stubToEntryIndex), more: res.page.more === 1 };
}

export async function fetchFollowers(
  username: string | undefined,
  pageIndex: number,
): Promise<Page<BlipUser>> {
  const client = await getClient();
  const res = await client.getFollowers({ username, pageIndex, pageSize: PAGE_SIZE });
  return { items: res.users, more: res.page.more === 1 };
}

export async function fetchFollowing(
  username: string | undefined,
  pageIndex: number,
): Promise<Page<BlipUser>> {
  const client = await getClient();
  const res = await client.getFollowing({ username, pageIndex, pageSize: PAGE_SIZE });
  return { items: res.users, more: res.page.more === 1 };
}

export async function fetchPendingRequests(pageIndex: number): Promise<Page<BlipUser>> {
  const client = await getClient();
  const res = await client.getPendingRequests({ pageIndex, pageSize: PAGE_SIZE });
  return { items: res.users, more: res.page.more === 1 };
}

export async function fetchBlockedUsers(pageIndex: number): Promise<Page<BlipUser>> {
  const client = await getClient();
  const res = await client.getBlockedUsers({ pageIndex, pageSize: PAGE_SIZE });
  return { items: res.users, more: res.page.more === 1 };
}

export async function fetchAwards(username?: string): Promise<BlipAward[]> {
  const client = await getClient();
  const res = await client.getUserAwards({ username });
  return res.awards;
}
