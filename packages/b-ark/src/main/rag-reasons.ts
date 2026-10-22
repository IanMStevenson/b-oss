// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { OutstandingCounts } from '@b-oss/backup-engine';
import type { RagReason } from '@b-oss/b-ark-ui-electron';

type Rag = 'green' | 'amber' | 'red';

/** Reasons (and so the colour) for a run that finished. */
export function completedStatus(opts: {
  scrapeDegraded: boolean;
  outstanding: OutstandingCounts | null;
}): { rag_state: Rag; rag_reasons: RagReason[] } {
  const rag_reasons: RagReason[] = [
    ...(opts.scrapeDegraded ? [{ code: 'web_signin_missing' as const }] : []),
    ...(opts.outstanding ? [{ code: 'outstanding' as const, ...opts.outstanding }] : []),
  ];
  return { rag_state: rag_reasons.length > 0 ? 'amber' : 'green', rag_reasons };
}

/**
 * Replace the `outstanding` reason, keeping the rest. Used when the user dismisses or retries
 * entries between runs. Never lowers a red status.
 */
export function withOutstanding(
  current: { rag_state: Rag; rag_reasons?: RagReason[] },
  outstanding: OutstandingCounts | null,
): { rag_state: Rag; rag_reasons: RagReason[] } {
  const others = (current.rag_reasons ?? []).filter((r) => r.code !== 'outstanding');
  const rag_reasons: RagReason[] = [
    ...others,
    ...(outstanding ? [{ code: 'outstanding' as const, ...outstanding }] : []),
  ];
  if (current.rag_state === 'red') return { rag_state: 'red', rag_reasons };
  return { rag_state: rag_reasons.length > 0 ? 'amber' : 'green', rag_reasons };
}
