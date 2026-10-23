// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The cached summary of FOLDED days (everything older than the 48 hours of raw samples). Folded days
// never change, so it is rebuilt once a UTC day — not once per run — and read as one row. That keeps
// the per-run D1 read cost flat however many years of history accumulate (b-oss#476 budget).

import { countDay } from './counts.js';
import type { DbLike } from './db.js';
import { addDays, dayOf, foldedThrough, slotOf, weekStart } from './time.js';
import { MINUTES_PER_SAMPLE } from './fold.js';
import type { Component } from './types.js';

/** [day or week-start (UTC), minutes down, incidents, minutes with no data] — non-empty entries only. */
export type HistoryEntry = [string, number, number, number];
/** [samples down, samples known (up + down), incidents]. */
export type Totals = [number, number, number];
export type WindowKey = 'w7' | 'w30' | 'w365' | 'all';

export interface HistoryCache {
  v: 2;
  /** Last folded UTC day; the cache is stale when this isn't `foldedThrough(now)`. */
  through: string;
  first_day: string | null;
  days: Record<Component, HistoryEntry[]>;
  weeks: Record<Component, HistoryEntry[]>;
  /** Sums over folded days only, for windows that end at today (the live days are added later). */
  totals: Record<Component, Record<WindowKey, Totals>>;
  /** Visitor shares per UTC day and per week (Monday), non-empty only, from folded `share_days`. */
  shares: {
    days: Record<Component, [string, number][]>;
    weeks: Record<Component, [string, number][]>;
  };
}

const COMPONENTS: Component[] = ['site', 'api'];

interface DayRow {
  day: string;
  component: Component;
  up_samples: number;
  down_samples: number;
  unknown_samples: number;
  incident_count: number;
}

function empty(through: string): HistoryCache {
  const totals = () =>
    ({ w7: [0, 0, 0], w30: [0, 0, 0], w365: [0, 0, 0], all: [0, 0, 0] }) as Record<
      WindowKey,
      Totals
    >;
  return {
    v: 2,
    through,
    first_day: null,
    days: { site: [], api: [] },
    weeks: { site: [], api: [] },
    totals: { site: totals(), api: totals() },
    shares: { days: { site: [], api: [] }, weeks: { site: [], api: [] } },
  };
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
    const firstSlot = slotOf(firstTs);
    cache.first_day = firstDay;
    const rows = (
      await db
        .prepare(
          'SELECT day, component, up_samples, down_samples, unknown_samples, incident_count FROM day_rows ORDER BY day',
        )
        .all<DayRow>()
    ).results;
    const byKey = new Map(rows.map((r) => [`${r.day}|${r.component}`, r]));
    // Windows end at today (= through + 3 days); day-granular, so these are day offsets from `through`.
    const starts: Record<WindowKey, string | null> = {
      w7: addDays(through, -3),
      w30: addDays(through, -26),
      w365: addDays(through, -361),
      all: null,
    };
    const weeks: Record<Component, Map<string, HistoryEntry>> = { site: new Map(), api: new Map() };
    for (let day = firstDay; day <= through; day = addDays(day, 1)) {
      for (const c of COMPONENTS) {
        const r = byKey.get(`${day}|${c}`);
        // A day with no row at all means the monitor never ran: every slot is "no data".
        const counts = r
          ? { up: r.up_samples, down: r.down_samples, unknown: r.unknown_samples }
          : countDay([], day, firstSlot, Infinity)[c];
        const inc = r?.incident_count ?? 0;
        const downMin = counts.down * MINUTES_PER_SAMPLE;
        const noDataMin = counts.unknown * MINUTES_PER_SAMPLE;
        if (downMin > 0 || noDataMin > 0 || inc > 0) {
          cache.days[c].push([day, downMin, inc, noDataMin]);
          const wk = weekStart(day);
          const w = weeks[c].get(wk) ?? [wk, 0, 0, 0];
          w[1] += downMin;
          w[2] += inc;
          w[3] += noDataMin;
          weeks[c].set(wk, w);
        }
        for (const k of Object.keys(starts) as WindowKey[]) {
          const s = starts[k];
          if (s === null || day >= s) {
            const t = cache.totals[c][k];
            t[0] += counts.down;
            t[1] += counts.up + counts.down;
            t[2] += inc;
          }
        }
      }
    }
    for (const c of COMPONENTS) cache.weeks[c] = [...weeks[c].values()];
  }
  const shareRows = (
    await db
      .prepare('SELECT day, component, count FROM share_days ORDER BY day')
      .all<{ day: string; component: Component; count: number }>()
  ).results;
  const shareWeeks: Record<Component, Map<string, number>> = { site: new Map(), api: new Map() };
  for (const r of shareRows) {
    cache.shares.days[r.component].push([r.day, r.count]);
    const wk = weekStart(r.day);
    shareWeeks[r.component].set(wk, (shareWeeks[r.component].get(wk) ?? 0) + r.count);
  }
  for (const c of COMPONENTS) cache.shares.weeks[c] = [...shareWeeks[c].entries()];
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
    if (cache.v === 2 && cache.through === foldedThrough(now)) return cache;
  }
  return rebuildHistory(db, now);
}

/** Forget the cached summary so the next snapshot rebuilds it. Called whenever a fold writes rows,
 * so the cache can't miss days folded after it was built. One write, only on fold events. */
export async function invalidateHistory(db: DbLike): Promise<void> {
  await db.prepare("DELETE FROM meta WHERE key = 'history'").run();
}
