// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Profile/social-graph fetchers for SCR-17/18/19/20/21/22 — same one-function-per-list shape as
// entries.ts. `username: undefined` means "the active account's own" for every endpoint that
// accepts it (getUserProfile, entries/journal, entries/favorites) — the API's own convention,
// which is why SCR-17 (My Profile) and SCR-18 (User Profile) can share one screen component.

import { getClient, withRateLimitFallback } from './client.js';
import { stubToEntryIndex } from './viewModel.js';
import { JOURNAL_PAGE_SIZE } from './entries.js';
import { t } from '../strings/index.js';
import { pageMeta } from './usePagedResource.js';
import type { Page } from './usePagedResource.js';
import type { EntryIndex } from '@b-oss/b-view';
import { BlipfotoError } from '@b-oss/b-api';
import type {
  BlipUser,
  BlipUserDetails,
  BlipFriendship,
  BlipEntryStub,
  BlipAward,
} from '@b-oss/b-api';

// Page size for the *people* lists (followers, following, requests, blocked, user search). Entry
// feeds use entries.ts's PAGE_SIZE (100) — see that file's comment.
export const PAGE_SIZE = 30;
export { JOURNAL_PAGE_SIZE };

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

/** API codes 101 (malformed username) and 103 (user unavailable) must read identically on
 * SCR-18 ("no such user"), rather than 101 falling through to a generic error — same rewrite-at-
 * the-fetcher approach as entries.ts's fetchEntry, so useResource's generic error state shows the
 * right text with no per-screen mapApiError step of its own. */
// One avatar lookup per author per session — swiping through a journal's entries would otherwise
// refetch the same author's profile on every entry. The promise is cached (so concurrent callers
// share one request); a failed lookup is evicted so the next entry retries.
const avatarCache = new Map<string, Promise<string | null>>();

/** The author's avatar URL for the entry page's author block, or `null` if they have none. A
 * deliberately minimal profile call (no details/entries/friendship) — the entry response itself
 * doesn't carry an avatar. */
export function fetchAuthorAvatar(username: string): Promise<string | null> {
  const cached = avatarCache.get(username);
  if (cached) return cached;
  const request = getClient()
    .then((client) => client.getUserProfile({ username }))
    .then((res) => res.user.avatar_url || null);
  avatarCache.set(username, request);
  request.catch(() => avatarCache.delete(username));
  return request;
}

/** Test seam: forget cached avatars. */
export function clearAuthorAvatarCache(): void {
  avatarCache.clear();
}

export async function fetchUserProfile(username?: string): Promise<UserProfile> {
  const client = await getClient();
  try {
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
  } catch (err) {
    if (err instanceof BlipfotoError && (err.code === 101 || err.code === 103)) {
      throw new Error(t('SCR-18.error.not_found'));
    }
    throw err;
  }
}

export async function fetchJournalEntriesFor(
  username: string | undefined,
  pageIndex: number,
): Promise<Page<EntryIndex>> {
  const client = await getClient();
  const res = await client.getJournalEntries({ username, pageIndex, pageSize: JOURNAL_PAGE_SIZE });
  return { items: res.entries.map(stubToEntryIndex), ...pageMeta(res.page) };
}

export async function fetchFavoriteEntriesFor(
  username: string | undefined,
  pageIndex: number,
): Promise<Page<EntryIndex>> {
  const client = await getClient();
  const res = await client.getFavoriteEntries({ username, pageIndex, pageSize: JOURNAL_PAGE_SIZE });
  return { items: res.entries.map(stubToEntryIndex), ...pageMeta(res.page) };
}

export async function fetchFollowers(
  username: string | undefined,
  pageIndex: number,
): Promise<Page<BlipUser>> {
  const client = await getClient();
  const res = await client.getFollowers({ username, pageIndex, pageSize: PAGE_SIZE });
  return { items: res.users, ...pageMeta(res.page) };
}

export async function fetchFollowing(
  username: string | undefined,
  pageIndex: number,
): Promise<Page<BlipUser>> {
  const client = await getClient();
  const res = await client.getFollowing({ username, pageIndex, pageSize: PAGE_SIZE });
  return { items: res.users, ...pageMeta(res.page) };
}

export async function fetchPendingRequests(pageIndex: number): Promise<Page<BlipUser>> {
  const client = await getClient();
  const res = await client.getPendingRequests({ pageIndex, pageSize: PAGE_SIZE });
  return { items: res.users, ...pageMeta(res.page) };
}

export async function fetchBlockedUsers(pageIndex: number): Promise<Page<BlipUser>> {
  const client = await getClient();
  const res = await client.getBlockedUsers({ pageIndex, pageSize: PAGE_SIZE });
  return { items: res.users, ...pageMeta(res.page) };
}

export async function fetchAwards(username?: string): Promise<BlipAward[]> {
  const client = await getClient();
  const res = await client.getUserAwards({ username });
  return res.awards;
}

/** SCR-03's People tab. `users/search` returns the same `BlipUser` shape (`username`,
 * `avatar_url`, `icons`) as every other people list — confirmed against `fetchFollowers`/
 * `fetchFollowing` above, which is what lets SearchScreen reuse `UserRow` directly rather than a
 * second row component. Public browsing like entries.ts's Recent/Popular/Tag/Search — falls back
 * to the anonymous token if the active account's own is rate-limited. */
export async function fetchSearchUsersPage(
  query: string,
  pageIndex: number,
): Promise<Page<BlipUser>> {
  return withRateLimitFallback(async (client) => {
    const res = await client.searchUsers({ query, pageIndex, pageSize: PAGE_SIZE });
    return { items: res.users, ...pageMeta(res.page) };
  });
}
