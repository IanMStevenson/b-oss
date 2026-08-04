// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Adapts useResource's four states to b-view's EntryState shape (idle/loading/error/loaded, no
// "empty" — a single entry either loads or errors) for EntryDetail's `entryState` prop.

import { useResource } from './useResource.js';
import { fetchEntry } from './entries.js';
import type { LoadedEntry } from './entries.js';
import type { EntryState } from '@b-oss/b-view';

export interface LiveEntryResult {
  entryState: EntryState;
  prevEntryId: string | null;
  nextEntryId: string | null;
  retry: () => void;
}

export function useLiveEntry(entryId: string): LiveEntryResult {
  const resource = useResource<LoadedEntry>(() => fetchEntry(entryId), [entryId]);

  switch (resource.status) {
    case 'loading':
      return {
        entryState: { status: 'loading' },
        prevEntryId: null,
        nextEntryId: null,
        retry: () => {},
      };
    case 'error':
      return {
        entryState: { status: 'error', message: resource.message },
        prevEntryId: null,
        nextEntryId: null,
        retry: resource.retry,
      };
    case 'empty':
      return {
        entryState: { status: 'error', message: 'Entry not found.' },
        prevEntryId: null,
        nextEntryId: null,
        retry: () => {},
      };
    case 'loaded':
      return {
        entryState: { status: 'loaded', data: resource.data.entry },
        prevEntryId: resource.data.prevEntryId,
        nextEntryId: resource.data.nextEntryId,
        retry: () => {},
      };
  }
}
