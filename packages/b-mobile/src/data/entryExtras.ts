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
import { resumeClear, resumeGet, resumeSet } from './resumeCache.js';

export interface EntryExtrasResult {
  extras: EntryExtra[];
  /** The journal is protected and there is no website session to read the extras with. */
  needsLogin: boolean;
}

const NONE: EntryExtrasResult = { extras: [], needsLogin: false };
// Per account: what one member's website session could read must never be served to another.
const KEY = (entryId: string, account: SiteAccount | null) =>
  `extras:${account?.id ?? ''}:${entryId}`;
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
        // Remembered for the session: opening the entry again does not re-run a hidden page
        // for a member who has not signed in. Signing in clears it (forgetEntryExtras).
        return viaSession.kind === 'needs-login' ? { extras: [], needsLogin: true } : NONE;
      }
      return result.status === 'ok' ? { extras: result.extras, needsLogin: false } : NONE;
    })
    .catch(() => NONE)
    .then((value) => {
      // A failure is not cached, so reopening the entry retries.
      if (value !== NONE) resumeSet(KEY(entryId, account), value);
      return value;
    })
    .finally(() => inFlight.delete(flightKey));
  inFlight.set(flightKey, p);
  return p;
}

/** Drops every remembered extras result, e.g. once the member has signed in to the website. */
export function forgetEntryExtras(): void {
  resumeClear('extras:');
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
