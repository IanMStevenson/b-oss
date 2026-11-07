// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// An entry's extra photos (b-oss#941, epic b-oss#149), read from the public entry page by b-api's
// fetchEntryExtras() because the API does not expose them. Loaded lazily after the entry itself,
// cached for the session, and silent: no extras and a failed fetch both show nothing (a failure
// is not cached, so reopening the entry retries). Standard resolution only; the app has no
// original/hi-res path and never posts extras.

import { useEffect, useMemo, useState } from 'react';
import { fetchEntryExtras } from '@b-oss/b-api';
import type { EntryExtra } from '@b-oss/b-api';
import type { EntryState } from '@b-oss/b-view';
import { fetchSiteText } from '../platform/siteText.js';
import { resumeGet, resumeSet } from './resumeCache.js';

const KEY = (entryId: string) => `extras:${entryId}`;
const inFlight = new Map<string, Promise<EntryExtra[]>>();

/** The entry's extras; `[]` for none or on any failure. Never throws. */
export function loadEntryExtras(entryId: string): Promise<EntryExtra[]> {
  const cached = resumeGet<EntryExtra[]>(KEY(entryId));
  if (cached) return Promise.resolve(cached);
  const pending = inFlight.get(entryId);
  if (pending) return pending;
  const p = fetchEntryExtras(entryId, fetchSiteText)
    .then((result) => {
      if (result.status !== 'ok') return [];
      resumeSet(KEY(entryId), result.extras);
      return result.extras;
    })
    .catch(() => [] as EntryExtra[])
    .finally(() => inFlight.delete(entryId));
  inFlight.set(entryId, p);
  return p;
}

/** Fetches once `enabled` (i.e. the entry has loaded). */
export function useEntryExtras(entryId: string, enabled: boolean): EntryExtra[] {
  const [state, setState] = useState<{ id: string; extras: EntryExtra[] }>({
    id: entryId,
    extras: [],
  });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadEntryExtras(entryId).then((extras) => {
      if (!cancelled) setState({ id: entryId, extras });
    });
    return () => {
      cancelled = true;
    };
  }, [entryId, enabled]);
  return state.id === entryId ? state.extras : [];
}

/** The entry state with `images.extras` filled in (same object when there are none). */
export function useEntryStateWithExtras(entryId: string, entryState: EntryState): EntryState {
  const extras = useEntryExtras(entryId, entryState.status === 'loaded');
  return useMemo(() => {
    if (entryState.status !== 'loaded' || extras.length === 0) return entryState;
    return {
      ...entryState,
      data: {
        ...entryState.data,
        images: {
          ...entryState.data.images,
          extras: extras.map((e) => ({
            item_id: e.item_id,
            thumbnail: e.thumbnail,
            image: e.image,
          })),
        },
      },
    };
  }, [entryState, extras]);
}
