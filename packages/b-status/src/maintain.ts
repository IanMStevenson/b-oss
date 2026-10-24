// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The housekeeping the cron does after storing a sample, before it rebuilds the snapshot: fold old
// samples and shares into day rows, drop expired share-limiter rows, and forget the cached history
// summary if either fold wrote anything (so it is rebuilt including those days).

import type { DbLike } from './db.js';
import { foldCompleteDays } from './fold.js';
import { invalidateHistory } from './history.js';
import { foldShares, purgeShareLimit } from './shares.js';

export async function runMaintenance(
  db: DbLike,
  now: number,
): Promise<{ foldedDays: number; foldedShareDays: number }> {
  const foldedDays = await foldCompleteDays(db, now);
  const foldedShareDays = await foldShares(db, now);
  await purgeShareLimit(db, now);
  if (foldedDays > 0 || foldedShareDays > 0) await invalidateHistory(db);
  return { foldedDays, foldedShareDays };
}
