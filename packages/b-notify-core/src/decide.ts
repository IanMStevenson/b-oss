// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The count-diff rule, as a pure function plus the delivery-settling step. The rule:
//   - per stream, delta = total - lastSeen; notify only when delta > 0 and the user has left that
//     stream switched on;
//   - a switched-off stream still has its new total stored, so switching it back on later starts
//     from the current count instead of firing a catch-up burst (b-oss#244);
//   - a stream's new total is stored only once its notification was delivered. If a delivery
//     fails, that stream keeps its old total so the next poll tries again, and so does every
//     stream after it (their delivery was not attempted).
// This is the same rule b-push applies to its D1 rows. b-push still carries its own copy; moving
// it onto this package is a separate follow-up.

import type { UnreadTotals } from './unread-totals.js';

export type Stream = 'comments' | 'notifications';

/** Order streams are delivered in; also the order of `Decision.notify`. */
export const STREAMS: readonly Stream[] = ['comments', 'notifications'];

export type StreamSettings = Readonly<Record<Stream, boolean>>;

/** The last total seen per stream. Same shape as UnreadTotals. */
export type SeenTotals = UnreadTotals;

export interface Notify {
  stream: Stream;
  /** How many new items since the last seen total; always > 0. */
  count: number;
}

export interface Decision {
  /** Streams to deliver, in STREAMS order. */
  notify: Notify[];
  /** The totals to store if every delivery succeeds (use `settle` otherwise). */
  nextSeen: SeenTotals;
}

export function decideNotifications(input: {
  totals: UnreadTotals;
  lastSeen: SeenTotals;
  streams: StreamSettings;
}): Decision {
  const { totals, lastSeen, streams } = input;
  const notify: Notify[] = [];
  for (const stream of STREAMS) {
    const delta = totals[stream] - lastSeen[stream];
    if (streams[stream] && delta > 0) notify.push({ stream, count: delta });
  }
  return { notify, nextSeen: { comments: totals.comments, notifications: totals.notifications } };
}

export interface Settled {
  /** Delivered, in order. */
  delivered: Notify[];
  /** What to store: new totals for delivered and switched-off/quiet streams, old totals kept for
   * a failed stream and any stream not attempted after it. */
  nextSeen: SeenTotals;
  /** The first delivery failure, if any; a caller records it and retries on its next poll. */
  error: Error | null;
}

/** Delivers a decision's notifications in order via `deliver`, stopping at the first failure, and
 * works out which totals are safe to store. */
export async function settle(
  decision: Decision,
  lastSeen: SeenTotals,
  deliver: (n: Notify) => Promise<void>,
): Promise<Settled> {
  const nextSeen: SeenTotals = { ...decision.nextSeen };
  const delivered: Notify[] = [];
  let error: Error | null = null;
  for (const n of decision.notify) {
    if (error === null) {
      try {
        await deliver(n);
        delivered.push(n);
        continue;
      } catch (err) {
        error = err instanceof Error ? err : new Error(String(err));
      }
    }
    nextSeen[n.stream] = lastSeen[n.stream];
  }
  return { delivered, nextSeen, error };
}
