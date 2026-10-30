// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Recovers the position Blipfoto already holds for one of the user's own entries when "Add to map"
// is off (b-oss#650). The entry's `location` is only returned while the map is on, but the stored
// co-ordinates survive turning it off. So: switch the map on without sending any position (the
// server uses what it holds, or refuses), read the entry back to get the position, and switch it
// off again straight away. The edit screen then opens the picker at that position; the map is only
// switched on for good when the user confirms and saves.
//
// This is deliberately immediate, not queued: there is no photo to upload, and the answer is needed
// before the picker opens. The entry is visible on the map for the second or so between the two
// writes.

import { BlipfotoError } from '@b-oss/b-api';
import { getClientForAccount } from './client.js';

export type StoredPosition = { lat: number; lon: number } | null;

/** The hide step failed even after retries, so the entry is still showing on the map. Carries the
 * position that was read, so the caller can still use it. */
export class StillVisibleError extends Error {
  constructor(
    public readonly position: StoredPosition,
    cause?: unknown,
  ) {
    super('Could not switch the map off again after reading the position.');
    this.name = 'StillVisibleError';
    this.cause = cause;
  }
}

const HIDE_ATTEMPT_DELAYS_MS = [0, 1000, 3000];

/** The server refuses to show an entry on the map when it holds no position. Its error text is
 * the raw key `entry.location_missing`, so this matches on that rather than on prose. */
function isLocationMissing(err: unknown): boolean {
  return err instanceof BlipfotoError && /location_missing/i.test(err.message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Resolves to the stored position, or null when the server holds none. Throws on any other
 * failure (offline, rate limited, signed out…) before anything has been shown; throws
 * StillVisibleError if it could not hide the entry again afterwards. */
export async function revealStoredPosition(
  accountId: string,
  entryId: string,
): Promise<StoredPosition> {
  const client = await getClientForAccount(accountId);

  try {
    await client.updateEntry({ entryId, display_location: 1 });
  } catch (err) {
    if (isLocationMissing(err)) return null;
    throw err;
  }

  let position: StoredPosition = null;
  let readError: unknown = null;
  try {
    const res = await client.getEntry(entryId);
    position = res.entry.location ?? null;
  } catch (err) {
    readError = err;
  }

  // The entry is on the map now, so hiding it again comes before anything else, including
  // reporting a failed read.
  let hideError: unknown = null;
  for (const wait of HIDE_ATTEMPT_DELAYS_MS) {
    if (wait > 0) await delay(wait);
    try {
      await client.updateEntry({ entryId, display_location: 0 });
      hideError = null;
      break;
    } catch (err) {
      hideError = err;
    }
  }
  if (hideError) throw new StillVisibleError(position, hideError);
  if (readError) {
    throw readError instanceof Error
      ? readError
      : new Error('Could not read the entry back after looking up its position.');
  }
  return position;
}
