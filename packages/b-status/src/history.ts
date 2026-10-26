// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The cached summary of FOLDED days (everything older than the 48 hours of raw samples): the uptime
// totals for each window, and the last 30 days of the History chart. Folded days never change, so it
// is rebuilt once a UTC day, not once per run, and read as one row. Because long-term history is
// sparse (day_exceptions) the rebuild reads only the handful of days that had a problem.

import type { DbLike } from './db.js';
import { addDays, dayOf, dayStartMs, foldedThrough, slotOf } from './time.js';
import { MINUTES_PER_SAMPLE } from './fold.js';
import type { Component } from './types.js';

/** [UTC day, minutes down, incidents that started that day, minutes with no data]: non-empty days only. */
export type HistoryEntry = [string, number, number, number];
/** [samples down, samples checked (slots minus unknown), incidents]. */
export type Totals = [number, number, number];
export type WindowKey = 'w7' | 'w30' | 'w365' | 'all';

/** How many UTC days the History chart shows, ending today. */
export const HISTORY_DAYS = 30;

export interface HistoryCache {
  v: 3;
  /** Last folded UTC day; the cache is stale when this isn't `foldedThrough(now)`. */
  through: string;
  first_day: string | null;
  /** Folded days inside the 30-day chart window, non-empty only. */
  days: Record<Component, HistoryEntry[]>;
  /** Sums over folded days only, for windows that end today (the live days are added later). */
  totals: Record<Component, Record<WindowKey, Totals>>;
  /** Folded daily share counts inside the chart window, non-empty only. */
  shares: { days: Record<Component, [string, number][]> };
}

const COMPONENTS: Component[] = ['site', 'api'];

function zeroTotals(): Record<WindowKey, Totals> {
  return { w7: [0, 0, 0], w30: [0, 0, 0], w365: [0, 0, 0], all: [0, 0, 0] };
}

function empty(through: string): HistoryCache {
  return {
    v: 3,
    through,
    first_day: null,
    days: { site: [], api: [] },
    totals: { site: zeroTotals(), api: zeroTotals() },
    shares: { days: { site: [], api: [] } },
  };
}

interface ExceptionRow {
  day: string;
  component: Component;
  down_samples: number;
  unknown_samples: number;
}

export async function rebuildHistory(db: DbLike, now: number): Promise<HistoryCache> {
  const through = foldedThrough(now);
  const cache = empty(through);
  const first = await db.prepare("SELECT value FROM meta WHERE key = 'first_ts'").first<{
    value: string;
  }>();
  if (first) {
    const firstTs = Number(first.value);
    const firstDay = dayOf(firstTs);
    cache.first_day = firstDay;
    const firstSlot = slotOf(firstTs);
    const endSlot = slotOf(dayStartMs(addDays(through, 1))) - 1; // last slot of the folded days
    // Windows end at today (= through + 3 days); day-granular, so these are day offsets from `through`.
    const starts: Record<WindowKey, string> = {
      w7: addDays(through, -3),
      w30: addDays(through, -(HISTORY_DAYS - 4)),
      w365: addDays(through, -361),
      all: firstDay,
    };
    const exceptions = (
      await db
        .prepare(
          'SELECT day, component, down_samples, unknown_samples FROM day_exceptions ORDER BY day',
        )
        .all<ExceptionRow>()
    ).results;
    const incidents = (
      await db
        .prepare('SELECT component, started_at FROM incidents WHERE started_at < ?')
        .bind(dayStartMs(addDays(through, 1)))
        .all<{ component: Component; started_at: number }>()
    ).results;

    for (const c of COMPONENTS) {
      for (const k of Object.keys(starts) as WindowKey[]) {
        const from = starts[k];
        const slots = Math.max(0, endSlot - Math.max(slotOf(dayStartMs(from)), firstSlot) + 1);
        let down = 0;
        let unknown = 0;
        for (const e of exceptions) {
          if (e.component === c && e.day >= from) {
            down += e.down_samples;
            unknown += e.unknown_samples;
          }
        }
        const inc = incidents.filter(
          (i) => i.component === c && dayOf(i.started_at) >= from,
        ).length;
        cache.totals[c][k] = [down, Math.max(0, slots - unknown), inc];
      }
      // The chart window: folded days that had downtime, no data, or an incident starting.
      const chartFrom = starts.w30;
      const byDay = new Map<string, HistoryEntry>();
      for (const e of exceptions) {
        if (e.component !== c || e.day < chartFrom) continue;
        byDay.set(e.day, [
          e.day,
          e.down_samples * MINUTES_PER_SAMPLE,
          0,
          e.unknown_samples * MINUTES_PER_SAMPLE,
        ]);
      }
      for (const i of incidents) {
        const d = dayOf(i.started_at);
        if (i.component !== c || d < chartFrom) continue;
        const entry = byDay.get(d) ?? [d, 0, 0, 0];
        entry[2]++;
        byDay.set(d, entry);
      }
      cache.days[c] = [...byDay.values()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
    }

    const shareRows = (
      await db
        .prepare('SELECT day, component, count FROM share_days WHERE day >= ? ORDER BY day')
        .bind(starts.w30)
        .all<{ day: string; component: Component; count: number }>()
    ).results;
    for (const r of shareRows) cache.shares.days[r.component].push([r.day, r.count]);
  }
  await db
    .prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('history', ?)")
    .bind(JSON.stringify(cache))
    .run();
  return cache;
}

/** The cache, rebuilt only if missing or from before the latest fold boundary. */
export async function loadHistory(db: DbLike, now: number): Promise<HistoryCache> {
  const row = await db.prepare("SELECT value FROM meta WHERE key = 'history'").first<{
    value: string;
  }>();
  if (row) {
    const cache = JSON.parse(row.value) as HistoryCache;
    if (cache.v === 3 && cache.through === foldedThrough(now)) return cache;
  }
  return rebuildHistory(db, now);
}

/** Forget the cached summary so the next snapshot rebuilds it. Called whenever a fold writes rows,
 * so the cache can't miss days folded after it was built. One write, only on fold events. */
export async function invalidateHistory(db: DbLike): Promise<void> {
  await db.prepare("DELETE FROM meta WHERE key = 'history'").run();
}
