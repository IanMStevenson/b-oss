// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { OutstandingCounts } from '@b-oss/backup-engine';
import type { RagReason } from '@b-oss/b-ark-ui-electron';

type Rag = 'green' | 'amber' | 'red';

/**
 * Reasons (and so the colour) a finished run leaves behind. The website-session reason is
 * deliberately not here: it is worked out live from the account (see `effectiveStatus`), so
 * signing in or out takes effect at once instead of at the next run.
 */
export function completedStatus(opts: { outstanding: OutstandingCounts | null }): {
  rag_state: Rag;
  rag_reasons: RagReason[];
} {
  const rag_reasons: RagReason[] = opts.outstanding
    ? [{ code: 'outstanding', ...opts.outstanding }]
    : [];
  return { rag_state: rag_reasons.length > 0 ? 'amber' : 'green', rag_reasons };
}

/**
 * Replace the `outstanding` reason, keeping the other stored ones. Used when the user dismisses
 * or retries entries between runs. Never lowers a red status.
 */
export function withOutstanding(
  current: { rag_state: Rag; rag_reasons?: RagReason[] },
  outstanding: OutstandingCounts | null,
): { rag_state: Rag; rag_reasons: RagReason[] } {
  const others = (current.rag_reasons ?? []).filter(
    (r) => r.code !== 'outstanding' && r.code !== 'web_signin_missing',
  );
  const rag_reasons: RagReason[] = [
    ...others,
    ...(outstanding ? [{ code: 'outstanding' as const, ...outstanding }] : []),
  ];
  if (current.rag_state === 'red') return { rag_state: 'red', rag_reasons };
  return { rag_state: rag_reasons.length > 0 ? 'amber' : 'green', rag_reasons };
}

/**
 * The status the UI should show: the stored status, plus the website-session reason when
 * full-resolution/extra images are enabled and the account has no website session. Stored
 * `web_signin_missing` reasons (from earlier versions) are ignored. Red is never changed.
 */
export function effectiveStatus(
  stored: { rag_state: Rag; rag_reasons?: RagReason[] },
  webSigninMissing: boolean,
): { rag_state: Rag; rag_reasons: RagReason[] | undefined } {
  if (stored.rag_state === 'red') return { rag_state: 'red', rag_reasons: stored.rag_reasons };
  const storedReasons = stored.rag_reasons;
  const others = (storedReasons ?? []).filter((r) => r.code !== 'web_signin_missing');
  if (webSigninMissing) {
    return {
      rag_state: 'amber',
      rag_reasons: [{ code: 'web_signin_missing' }, ...others],
    };
  }
  const hadStoredSignin = storedReasons !== undefined && storedReasons.length !== others.length;
  if (hadStoredSignin && others.length === 0 && stored.rag_state === 'amber') {
    return { rag_state: 'green', rag_reasons: [] };
  }
  return {
    rag_state: stored.rag_state,
    rag_reasons: storedReasons === undefined ? undefined : others,
  };
}
