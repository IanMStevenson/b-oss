// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Folding old samples into SPARSE per-day exceptions (free-tier discipline: raw rows are kept only
// briefly, and a perfect day stores nothing at all). Whole UTC days that ended at least 48 hours ago
// are folded in one D1 batch with the delete, so a crash can't double-count or lose a sample.
// A day only gets a row if some slot was down or unknown. A day on which the monitor never ran has
// no samples to find, so every day since the last fold is visited, and such a day is recorded as
// all-unknown rather than silently counting as up.

import { countDay, type SampleStates } from './counts.js';
import type { DbLike } from './db.js';
import { INTERVAL_MS, addDays, dayOf, dayStartMs, foldedThrough, slotOf } from './time.js';
import type { Component } from './types.js';

const COMPONENTS: Component[] = ['site', 'api'];

/** Fold every complete day older than 48 hours that hasn't been folded yet. Returns how many days
 * were folded (zero when already up to date). */
export async function foldCompleteDays(db: DbLike, now: number): Promise<number> {
  const first = await db.prepare("SELECT value FROM meta WHERE key = 'first_ts'").first<{
    value: string;
  }>();
  if (!first) return 0;
  const done = await db.prepare("SELECT value FROM meta WHERE key = 'folded_through'").first<{
    value: string;
  }>();
  const firstTs = Number(first.value);
  const through = foldedThrough(now);
  const start = done ? addDays(done.value, 1) : dayOf(firstTs);
  if (start > through) return 0;

  const boundarySlot = slotOf(dayStartMs(addDays(through, 1)));
  const old = (
    await db
      .prepare('SELECT slot, site_state, api_state FROM samples WHERE slot < ? ORDER BY slot')
      .bind(boundarySlot)
      .all<SampleStates>()
  ).results;

  const stmts = [];
  let days = 0;
  for (let day = start; day <= through; day = addDays(day, 1)) {
    days++;
    const counts = countDay(old, day, slotOf(firstTs), Infinity);
    for (const c of COMPONENTS) {
      if (counts[c].down === 0 && counts[c].unknown === 0) continue;
      stmts.push(
        db
          .prepare(
            'INSERT OR REPLACE INTO day_exceptions (day, component, down_samples, unknown_samples) VALUES (?, ?, ?, ?)',
          )
          .bind(day, c, counts[c].down, counts[c].unknown),
      );
    }
  }
  stmts.push(
    db
      .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('folded_through', ?)")
      .bind(through),
    db.prepare('DELETE FROM samples WHERE slot < ?').bind(boundarySlot),
  );
  await db.batch(stmts);
  return days;
}

export const MINUTES_PER_SAMPLE = INTERVAL_MS / 60_000;
