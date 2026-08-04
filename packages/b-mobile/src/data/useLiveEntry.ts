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

export interface LiveEntryResult {
  entryState: EntryState;
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
}

const emptyResult: Omit<LiveEntryResult, 'entryState' | 'reload'> = {
  prevEntryId: null,
  nextEntryId: null,
  actions: null,
  starred: false,
  favorited: false,
  friendship: null,
  comments: [],
};

export function useLiveEntry(entryId: string): LiveEntryResult {
  const { state, reload } = useResource<LoadedEntry>(() => fetchEntry(entryId), [entryId]);

  switch (state.status) {
    case 'loading':
      return { entryState: { status: 'loading' }, ...emptyResult, reload };
    case 'error':
      return { entryState: { status: 'error', message: state.message }, ...emptyResult, reload };
    case 'empty':
      return {
        entryState: { status: 'error', message: 'Entry not found.' },
        ...emptyResult,
        reload,
      };
    case 'loaded':
      return {
        entryState: { status: 'loaded', data: state.data.entry },
        prevEntryId: state.data.prevEntryId,
        nextEntryId: state.data.nextEntryId,
        actions: state.data.actions,
        starred: state.data.starred,
        favorited: state.data.favorited,
        friendship: state.data.friendship,
        comments: state.data.comments,
        reload,
      };
  }
}
