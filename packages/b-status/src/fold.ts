// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Folding old samples into per-day rows (free-tier discipline: raw rows are kept only briefly).
// Only whole UTC days that ended at least 48 hours ago are folded, in one D1 batch with the delete,
// so a crash can't double-count or lose a sample. Day rows hold COUNTS, so days sum into any window.

import { countDay, type SampleStates } from './counts.js';
import type { DbLike } from './db.js';
import { deriveStates } from './derive.js';
import { DAY_MS, INTERVAL_MS, dayOf, dayStartMs, slotOf, startOfUtcDay } from './time.js';
import type { CheckResult, Component, IncidentRow } from './types.js';

interface FoldSample extends SampleStates {
  ts: number;
  checks: string;
}

/** Fold every complete day older than 48 hours. Returns how many days were folded. */
export async function foldCompleteDays(db: DbLike, now: number): Promise<number> {
  const before = startOfUtcDay(now - 2 * DAY_MS);
  const old = (
    await db
      .prepare(
        'SELECT slot, ts, site_state, api_state, checks FROM samples WHERE ts < ? ORDER BY ts',
      )
      .bind(before)
      .all<FoldSample>()
  ).results;
  if (old.length === 0) return 0;

  const first = await db.prepare("SELECT value FROM meta WHERE key = 'first_ts'").first<{
    value: string;
  }>();
  const firstSlot = slotOf(first ? Number(first.value) : old[0].ts);
  const incidents = (
    await db.prepare('SELECT * FROM incidents WHERE started_at < ?').bind(before).all<IncidentRow>()
  ).results;

  const days = [...new Set(old.map((s) => dayOf(s.ts)))];
  const stmts = [];
  for (const day of days) {
    const start = dayStartMs(day);
    const counts = countDay(old, day, firstSlot, Infinity);
    for (const c of ['site', 'api'] as Component[]) {
      const inDay = incidents.filter(
        (i) => i.component === c && i.started_at >= start && i.started_at < start + DAY_MS,
      );
      const longest = Math.max(
        0,
        ...inDay.map((i) => Math.round(((i.ended_at ?? now) - i.started_at) / 60_000)),
      );
      const failedCounts: Record<string, number> = {};
      for (const s of old) {
        if (dayOf(s.ts) !== day || (c === 'site' ? s.site_state : s.api_state) !== 'down') continue;
        const failed = deriveStates(JSON.parse(s.checks) as CheckResult[])[c].failed;
        for (const id of failed) failedCounts[id] = (failedCounts[id] ?? 0) + 1;
      }
      stmts.push(
        db
          .prepare(
            'INSERT OR REPLACE INTO day_rows (day, component, up_samples, down_samples, unknown_samples, incident_count, longest_incident_min, failed_checks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .bind(
            day,
            c,
            counts[c].up,
            counts[c].down,
            counts[c].unknown,
            inDay.length,
            longest,
            JSON.stringify(failedCounts),
          ),
      );
    }
  }
  stmts.push(db.prepare('DELETE FROM samples WHERE ts < ?').bind(before));
  await db.batch(stmts);
  return days.length;
}

export const MINUTES_PER_SAMPLE = INTERVAL_MS / 60_000;
