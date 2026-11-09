// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/**
 * Wrap an async function so only one call runs at a time. A call made while
 * another is in flight is not run and resolves to `whenBusy`. Used for the
 * folder-picker IPC handlers: a native dialog must never open twice, and two
 * picks must never bind/write the backup folder concurrently (b-oss#983).
 */
export function singleFlight<A extends unknown[], R, B>(
  fn: (...args: A) => Promise<R>,
  whenBusy: B,
): (...args: A) => Promise<R | B> {
  let busy = false;
  return async (...args: A): Promise<R | B> => {
    if (busy) return whenBusy;
    busy = true;
    try {
      return await fn(...args);
    } finally {
      busy = false;
    }
  };
}
