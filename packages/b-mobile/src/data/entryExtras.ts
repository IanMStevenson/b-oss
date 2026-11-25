// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// An entry's extra photos (b-oss#941, epic b-oss#149), read from the entry page by b-api's
// fetchEntryExtras() because the API does not expose them. Loaded lazily after the entry itself,
// cached for the session, and silent: no extras and a failed fetch both show nothing (a failure
// is not cached, so reopening the entry retries). Standard resolution only; the app has no
// original/hi-res path.
//
// A protected journal's public page shows no gallery (b-oss#1042). There, where the host has a
// website session (flows/extrasFlow.ts, the same one used to add extras), the extras are read with
// it; without a usable session the result says `needsLogin` so the screen can offer to sign in.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchEntryExtras } from '@b-oss/b-api';
import type { EntryExtra } from '@b-oss/b-api';
import type { EntryState } from '@b-oss/b-view';
import { readExtrasViaSession, type SiteAccount } from '../flows/extrasFlow.js';
import { fetchSiteText } from '../platform/siteText.js';
import { siteSessionAvailable } from '../platform/siteSession.js';
import { extrasKey, forgetEntryExtras } from './extrasCache.js';
import { resumeGet, resumeSet } from './resumeCache.js';

export { forgetEntryExtras };

export interface EntryExtrasResult {
  extras: EntryExtra[];
  /** The journal is protected and there is no website session to read the extras with. */
  needsLogin: boolean;
}

const NONE: EntryExtrasResult = { extras: [], needsLogin: false };
const NEEDS_LOGIN: EntryExtrasResult = { extras: [], needsLogin: true };
const KEY = (entryId: string, account: SiteAccount | null) =>
  extrasKey(entryId, account?.id ?? null);
const inFlight = new Map<string, Promise<EntryExtrasResult>>();

/** The entry's extras; none on any failure. Never throws. */
export function loadEntryExtras(
  entryId: string,
  account: SiteAccount | null,
): Promise<EntryExtrasResult> {
  const cached = resumeGet<EntryExtrasResult>(KEY(entryId, account));
  if (cached) return Promise.resolve(cached);
  const flightKey = KEY(entryId, account);
  const pending = inFlight.get(flightKey);
  if (pending) return pending;
  const p = fetchEntryExtras(entryId, fetchSiteText)
    .then(async (result): Promise<EntryExtrasResult> => {
      if (result.status === 'protected') {
        if (!siteSessionAvailable() || account === null) return NONE;
        const viaSession = await readExtrasViaSession(entryId, account);
        if (viaSession.kind === 'ok') return { extras: viaSession.extras, needsLogin: false };
        return viaSession.kind === 'needs-login' ? NEEDS_LOGIN : NONE;
      }
      return result.status === 'ok' ? { extras: result.extras, needsLogin: false } : NONE;
    })
    .catch(() => NONE)
    .then((value) => {
      // Neither a failure nor "web sign-in needed" is remembered: reopening the entry reads again,
      // so a member who has just signed in (or whose session was missing a moment ago) never
      // sees a stale notice. What was read is remembered until extras change or the session does.
      if (value !== NONE && value !== NEEDS_LOGIN) resumeSet(KEY(entryId, account), value);
      return value;
    })
    .finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, p);
  return p;
}

/** Fetches once `enabled` (i.e. the entry has loaded). `reload` re-reads after a sign-in. */
export function useEntryExtrasResult(
  entryId: string,
  enabled: boolean,
  account: SiteAccount | null,
): EntryExtrasResult & { reload: () => void } {
  const [state, setState] = useState<{ id: string; result: EntryExtrasResult }>({
    id: entryId,
    result: NONE,
  });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadEntryExtras(entryId, account).then((result) => {
      if (!cancelled) setState({ id: entryId, result });
    });
    return () => {
      cancelled = true;
    };
  }, [entryId, enabled, attempt, account]);
  const reload = useCallback(() => {
    forgetEntryExtras();
    setAttempt((n) => n + 1);
  }, []);
  const result = state.id === entryId ? state.result : NONE;
  return { ...result, reload };
}

/** The entry state with `images.extras` filled in (same object when there are none), plus whether
 * the extras are waiting on a website sign-in and how to re-read them afterwards. */
export function useEntryExtrasView(
  entryId: string,
  entryState: EntryState,
  account: SiteAccount | null,
): { entryState: EntryState; needsLogin: boolean; reload: () => void } {
  const { extras, needsLogin, reload } = useEntryExtrasResult(
    entryId,
    entryState.status === 'loaded',
    account,
  );
  const withExtras = useMemo(() => {
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
  return { entryState: withExtras, needsLogin, reload };
}

/** The entry state with `images.extras` filled in (same object when there are none). */
export function useEntryStateWithExtras(
  entryId: string,
  entryState: EntryState,
  account: SiteAccount | null,
): EntryState {
  return useEntryExtrasView(entryId, entryState, account).entryState;
}
