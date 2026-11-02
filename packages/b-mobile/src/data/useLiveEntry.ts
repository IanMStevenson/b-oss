// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Adapts useResource's four states to b-view's EntryState shape (idle/loading/error/loaded, no
// "empty" — a single entry either loads or errors) for SCR-06's rendering, plus the
// action-bar/comment data (action flags, star/favourite state, friendship, raw comments) that
// entryState's b-view-shaped `data` doesn't carry (see entries.ts's LoadedEntry doc comment).

import { useResource } from './useResource.js';
import { fetchEntry } from './entries.js';
import type { LoadedEntry } from './entries.js';
import type { EntryState } from '@b-oss/b-view';
import type { BlipEntryActions, BlipFriendship, BlipComment as ApiComment } from '@b-oss/b-api';
import { useAccountsStore } from '../state/accountsStore.js';

export interface LiveEntryResult {
  entryState: EntryState;
  /** The entry failed to load at the transport level (no response), so LoadFailed can ask whether
   * the phone is offline or Blipfoto isn't answering. */
  errorIsTransport: boolean;
  prevEntryId: string | null;
  nextEntryId: string | null;
  actions: BlipEntryActions | null;
  starred: boolean;
  favorited: boolean;
  friendship: BlipFriendship | null;
  comments: ApiComment[];
  /** Refetch the entry — used both for the error state's retry and, on the loaded state, to
   * refresh after a mutation (post/edit/delete comment, hide/unhide, FLW-07). */
  reload: () => void;
  /** `reload` without the spinner: refreshes comments etc. in place after an inline mutation. */
  refresh: () => void;
}

const emptyResult: Omit<LiveEntryResult, 'entryState' | 'errorIsTransport' | 'reload' | 'refresh'> =
  {
    prevEntryId: null,
    nextEntryId: null,
    actions: null,
    starred: false,
    favorited: false,
    friendship: null,
    comments: [],
  };

export function useLiveEntry(entryId: string): LiveEntryResult {
  // The response carries per-viewer state (star/favourite, which comments you can edit or delete,
  // friendship), so switching account from the header reloads it for the new account (b-oss#219).
  const activeAccountId = useAccountsStore((s) => s.activeAccountId);
  const { state, reload, refresh } = useResource<LoadedEntry>(
    () => fetchEntry(entryId),
    [entryId, activeAccountId],
  );

  switch (state.status) {
    case 'loading':
      return {
        entryState: { status: 'loading' },
        errorIsTransport: false,
        ...emptyResult,
        reload,
        refresh,
      };
    case 'error':
      return {
        entryState: { status: 'error', message: state.message },
        errorIsTransport: state.isTransport,
        ...emptyResult,
        reload,
        refresh,
      };
    case 'empty':
      return {
        entryState: { status: 'error', message: 'Entry not found.' },
        errorIsTransport: false,
        ...emptyResult,
        reload,
        refresh,
      };
    case 'loaded':
      return {
        entryState: { status: 'loaded', data: state.data.entry },
        errorIsTransport: false,
        prevEntryId: state.data.prevEntryId,
        nextEntryId: state.data.nextEntryId,
        actions: state.data.actions,
        starred: state.data.starred,
        favorited: state.data.favorited,
        friendship: state.data.friendship,
        comments: state.data.comments,
        reload,
        refresh,
      };
  }
}
