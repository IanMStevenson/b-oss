// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { BlipfotoError, HttpError } from '@b-oss/b-api';
import type { BackupErrorPayload, PendingEntry, PendingFailureKind } from './types.js';

export class BackupAbortedError extends Error {
  constructor(public readonly payload: BackupErrorPayload) {
    super(payload.kind);
    this.name = 'BackupAbortedError';
  }
}

export class BackupCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'BackupCancelledError';
  }
}

/** An entry is dropped from the pending list once it has failed for this long. */
export const PENDING_GIVE_UP_DAYS = 14;

/**
 * What a failed entry fetch means. `gone`: the server says there is no such entry (code 201).
 * `unavailable`: the server answered but won't serve it (code 202, e.g. suspended).
 * `network`: no usable answer. Anything unrecognised is `other` and treated as an ordinary failure.
 */
export function classifyFetchFailure(err: unknown): 'gone' | PendingFailureKind {
  if (err instanceof BackupAbortedError)
    return err.payload.kind === 'network' ? 'network' : 'other';
  if (err instanceof BlipfotoError) {
    if (err.code === 201) return 'gone';
    if (err.code === 202) return 'unavailable';
    return 'other';
  }
  if (err instanceof HttpError) return 'network';
  return 'other';
}

/** Worth another quick attempt within the same run (the server gave no definite answer). */
export function isTransientFailure(err: unknown): boolean {
  if (err instanceof BackupAbortedError) return err.payload.kind === 'network';
  if (err instanceof BlipfotoError) return err.code === 0 || err.code === 1;
  return true;
}

export interface OutstandingCounts {
  /** Failing, but still inside the give-up window: retried on every run. */
  retrying: number;
  /** Past the window and the server said "entry unavailable" (code 202), e.g. suspended. */
  unavailable: number;
  /** Past the window after network or other errors. */
  other: number;
}

/** Entries known to exist but not archived, split by state; null when there are none. */
export function countOutstanding(
  pending: ReadonlyArray<PendingEntry>,
  now: number = Date.now(),
): OutstandingCounts | null {
  const counts: OutstandingCounts = { retrying: 0, unavailable: 0, other: 0 };
  for (const p of pending) {
    if (!isUnfetchable(p, now)) counts.retrying++;
    else if (p.last_error.kind === 'unavailable') counts.unavailable++;
    else counts.other++;
  }
  return counts.retrying + counts.unavailable + counts.other > 0 ? counts : null;
}

const entries = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Shown (amber) while any entry is not archived. */
export function outstandingMessage(counts: OutstandingCounts): string {
  const parts: string[] = [];
  if (counts.retrying > 0) {
    parts.push(`${entries(counts.retrying, 'entry', 'entries')} not archived yet — will retry`);
  }
  if (counts.unavailable > 0) {
    parts.push(
      `${entries(counts.unavailable, 'entry is', 'entries are')} suspended or unavailable on Blipfoto`,
    );
  }
  if (counts.other > 0) {
    parts.push(
      `${entries(counts.other, 'entry', 'entries')} could not be fetched after ${PENDING_GIVE_UP_DAYS} days of trying`,
    );
  }
  return parts.join('. ');
}

/** Still failing after the give-up window: no longer retried automatically, shown as unfetchable. */
export function isUnfetchable(p: { first_failed_at: string }, now: number = Date.now()): boolean {
  return now - Date.parse(p.first_failed_at) > PENDING_GIVE_UP_DAYS * 24 * 60 * 60 * 1000;
}
