// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { foldCompleteDays } from '../fold.js';
import { loadHistory, rebuildHistory } from '../history.js';
import { buildSnapshot, storeSnapshot, uptimePercent } from '../snapshot.js';
import { NOW, WEEK, at, simulate } from './sim.js';
import { createTestDb, type TestDb } from './testDb.js';

let db: TestDb;
beforeEach(() => {
  db = createTestDb();
});
afterEach(() => db.close());

const count = async (table: string): Promise<number> =>
  (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? -1;

describe('uptimePercent', () => {
  it('rounds down: 100 only when nothing was found down', () => {
    expect(uptimePercent(0, 10)).toBe(100);
    expect(uptimePercent(1, 100_000)).toBe(99.999);
    expect(uptimePercent(1, 10_000_000)).toBe(99.999); // never rounds up to 100
    expect(uptimePercent(1, 100)).toBe(99);
    expect(uptimePercent(5, 525)).toBe(99.047);
  });
  it('is null with no checked time', () => {
    expect(uptimePercent(0, 0)).toBeNull();
  });
});

describe('foldCompleteDays', () => {
  it('folds whole days ended 48+ hours ago into SPARSE exceptions, and deletes their samples', async () => {
    await simulate(db, WEEK);
    expect(await count('samples')).toBe(5 * 96 + 49 - 4);
    expect(await foldCompleteDays(db, NOW)).toBe(3); // 18th, 19th, 20th
    // Only the one day with a problem gets a row: the 18th and 20th were perfect.
    const rows = (await db.prepare('SELECT * FROM day_exceptions').all()).results;
    expect(rows).toEqual([
      { day: '2026-10-19', component: 'site', down_samples: 2, unknown_samples: 0 },
    ]);
    // 21st (92 samples: 4 missing), 22nd (96), 23rd (49) remain raw.
    expect(await count('samples')).toBe(92 + 96 + 49);
    const done = await db.prepare("SELECT value FROM meta WHERE key = 'folded_through'").first();
    expect(done).toEqual({ value: '2026-10-20' });
  });

  it('is idempotent: a second fold finds nothing and writes nothing', async () => {
    await simulate(db, WEEK);
    await foldCompleteDays(db, NOW);
    expect(await foldCompleteDays(db, NOW)).toBe(0);
    expect(await count('day_exceptions')).toBe(1);
  });

  it('counts slots with no sample as unknown, not up or down', async () => {
    await simulate(db, [{ from: at(19, 0), to: at(19, 2), skip: true }]);
    await foldCompleteDays(db, NOW);
    const rows = (await db.prepare('SELECT * FROM day_exceptions ORDER BY component').all())
      .results;
    expect(rows).toEqual([
      { day: '2026-10-19', component: 'api', down_samples: 0, unknown_samples: 8 },
      { day: '2026-10-19', component: 'site', down_samples: 0, unknown_samples: 8 },
    ]);
  });

  it('records a day on which the monitor never ran as all-unknown, not as a perfect day', async () => {
    // Nothing at all on the 19th; samples resume on the 20th.
    await simulate(db, [{ from: at(19, 0), to: at(20, 0), skip: true }]);
    await foldCompleteDays(db, NOW);
    const rows = (await db.prepare('SELECT * FROM day_exceptions ORDER BY component').all())
      .results;
    expect(rows).toEqual([
      { day: '2026-10-19', component: 'api', down_samples: 0, unknown_samples: 96 },
      { day: '2026-10-19', component: 'site', down_samples: 0, unknown_samples: 96 },
    ]);
  });

  it('does nothing before monitoring has started', async () => {
    expect(await foldCompleteDays(db, NOW)).toBe(0);
    expect(await count('meta')).toBe(0);
  });
});

describe('history cache', () => {
  it('summarises the folded chart days and the uptime totals', async () => {
    await simulate(db, WEEK);
    await foldCompleteDays(db, NOW);
    const h = await rebuildHistory(db, NOW);
    expect(h.through).toBe('2026-10-20');
    expect(h.first_day).toBe('2026-10-18');
    expect(h.days.site).toEqual([['2026-10-19', 30, 1, 0]]);
    expect(h.days.api).toEqual([]);
    // 3 folded days = 288 slots; the Site was down for 2 of them, in 1 incident.
    expect(h.totals.site.all).toEqual([2, 3 * 96, 1]);
    expect(h.totals.api.all).toEqual([0, 3 * 96, 0]);
  });

  it('leaves unknown time out of the checked total', async () => {
    await simulate(db, [{ from: at(19, 0), to: at(20, 0), skip: true }]);
    await foldCompleteDays(db, NOW);
    const h = await rebuildHistory(db, NOW);
    expect(h.totals.site.all).toEqual([0, 2 * 96, 0]);
    expect(h.days.site).toEqual([['2026-10-19', 0, 0, 1440]]);
  });

  it('is rebuilt only when missing or from before the current fold boundary', async () => {
    await simulate(db, WEEK);
    await foldCompleteDays(db, NOW);
    const first = await loadHistory(db, NOW);
    expect(first.through).toBe('2026-10-20');
    expect((await loadHistory(db, NOW)).through).toBe('2026-10-20');
    const later = await loadHistory(db, NOW + 24 * 3600_000);
    expect(later.through).toBe('2026-10-21');
  });
});

describe('buildSnapshot', () => {
  async function snapshot() {
    await simulate(db, WEEK);
    await foldCompleteDays(db, NOW);
    return storeSnapshot(db, NOW);
  }

  it('states when fresher data can exist', async () => {
    const s = await snapshot();
    expect(s.generated_at).toBe(NOW);
    expect(s.next_refresh_at).toBe(NOW + 15 * 60_000 + 90_000);
    expect(s.monitoring_since).toBe(at(18, 0));
  });

  it('reports now: Site up, API down with the failing check', async () => {
    const s = await snapshot();
    expect(s.now.site).toMatchObject({ state: 'up', checked_at: NOW, stale: false });
    expect(s.now.api).toMatchObject({ state: 'down', failed: ['api_recent'], stale: false });
  });

  it('is Unknown when the newest sample is more than two intervals old', async () => {
    await simulate(db, [], at(18, 0), at(23, 0));
    await foldCompleteDays(db, NOW);
    const s = await buildSnapshot(db, NOW);
    expect(s.now.site).toMatchObject({ state: 'unknown', stale: true });
  });

  it('draws the 48 hours as down and no-data segments', async () => {
    const s = await snapshot();
    expect(s.last48h.site).toEqual([
      { kind: 'nodata', start: at(21, 14), end: at(21, 15) },
      {
        kind: 'down',
        start: at(22, 9),
        end: at(22, 9, 15),
        failed: ['photo'],
        reason: 'timed out after 10 s',
      },
    ]);
    // An ongoing outage has no end.
    expect(s.last48h.api.at(-1)).toMatchObject({
      kind: 'down',
      end: null,
      failed: ['api_recent'],
      reason: 'timed out after 10 s',
    });
  });

  it('computes uptime, rounded down, with unchecked slots left out', async () => {
    const s = await snapshot();
    // 529 slots, 4 unchecked: 525 known, Site down in 3 of them.
    expect(s.uptime.site.all).toEqual({ uptime: 99.428, down_minutes: 45, incidents: 2 });
    expect(s.uptime.site.d7).toEqual(s.uptime.site.all);
    // Last 24 hours is exact: API down for the final two samples of 97.
    expect(s.uptime.api.h24).toMatchObject({ uptime: 97.938, down_minutes: 30 });
    // The 09:00 photo outage on the 22nd is outside the last 24 hours (cutoff 12:00 on the 22nd).
    expect(s.uptime.site.h24).toMatchObject({ uptime: 100, down_minutes: 0 });
  });

  it('merges live days into daily and weekly history', async () => {
    const s = await snapshot();
    expect(s.history.first_day).toBe('2026-10-18');
    expect(s.history.days.site).toEqual([
      ['2026-10-19', 30, 1, 0],
      ['2026-10-21', 0, 0, 60],
      ['2026-10-22', 15, 1, 0],
    ]);
  });

  it('shows one incident row when a single cause took both parts down', async () => {
    const s = await snapshot();
    expect(s.incidents.map((i) => [i.components, i.started_at, i.ended_at])).toEqual([
      [['api'], at(23, 11, 45), null],
      [['site', 'api'], at(22, 9), at(22, 9, 15)],
      [['site'], at(19, 3), at(19, 3, 30)],
    ]);
  });

  it('draws an incident opened by the newest sample in the 48-hour lane', async () => {
    await db.batch([
      db.prepare("INSERT INTO meta (key, value) VALUES ('first_ts', ?)").bind(String(NOW)),
      db
        .prepare(
          "INSERT INTO samples (slot, ts, site_state, api_state, retried, checks) VALUES (?, ?, 'up', 'down', 0, '[]')",
        )
        .bind(Math.floor(NOW / 900_000), NOW),
      db
        .prepare(
          "INSERT INTO incidents (component, started_at, ended_at, failed_checks) VALUES ('api', ?, NULL, 'api_recent')",
        )
        .bind(NOW),
    ]);
    const s = await buildSnapshot(db, NOW);
    expect(s.last48h.api).toEqual([
      { kind: 'down', start: NOW, end: null, failed: ['api_recent'] },
    ]);
  });

  it('is a small document', async () => {
    const s = await snapshot();
    expect(JSON.stringify(s).length).toBeLessThan(10_000);
  });

  it('reports no uptime before anything has been checked', async () => {
    const s = await buildSnapshot(db, NOW);
    expect(s.uptime.site.all.uptime).toBeNull();
    expect(s.now.api.state).toBe('unknown');
    expect(s.monitoring_since).toBeNull();
  });
});
