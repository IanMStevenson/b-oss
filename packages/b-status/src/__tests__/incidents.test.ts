// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, describe, expect, it } from 'vitest';
import { recordSample } from '../incidents.js';
import { slotOf, type ProbeOutcome } from '../probe.js';
import type { CheckId, ComponentState, IncidentRow, State } from '../types.js';
import { createTestDb, type TestDb } from './testDb.js';

const MIN = 60_000;
const T0 = 1_700_000_000_000;

function outcome(
  i: number,
  site: State,
  api: State,
  siteFailed: CheckId[] = [],
  apiFailed: CheckId[] = [],
): ProbeOutcome {
  const ts = T0 + i * 15 * MIN;
  const cs = (state: State, failed: CheckId[]): ComponentState => ({ state, failed });
  return {
    ts,
    slot: slotOf(ts),
    states: { site: cs(site, siteFailed), api: cs(api, apiFailed) },
    results: [],
    retried: false,
  };
}

let db: TestDb;
afterEach(() => db.close());

const incidents = async (): Promise<IncidentRow[]> =>
  (await db.prepare('SELECT * FROM incidents ORDER BY id').all<IncidentRow>()).results;

describe('recordSample', () => {
  it('stores one sample per slot and ignores a duplicate cron invocation', async () => {
    db = createTestDb();
    await recordSample(db, outcome(0, 'up', 'up'));
    await recordSample(db, outcome(0, 'up', 'up'));
    const n = await db.prepare('SELECT COUNT(*) AS n FROM samples').first<{ n: number }>();
    expect(n?.n).toBe(1);
  });

  it('opens an incident on the first down sample and closes it at the first passing one', async () => {
    db = createTestDb();
    await recordSample(db, outcome(0, 'up', 'up'));
    await recordSample(db, outcome(1, 'down', 'up', ['website_browse']));
    await recordSample(db, outcome(2, 'down', 'up', ['website_browse']));
    let rows = await incidents();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      component: 'site',
      started_at: outcome(1, 'up', 'up').ts,
      ended_at: null,
    });

    await recordSample(db, outcome(3, 'up', 'up'));
    rows = await incidents();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ended_at).toBe(outcome(3, 'up', 'up').ts);
  });

  it('extends failed_checks with newly failing checks during the same incident', async () => {
    db = createTestDb();
    await recordSample(db, outcome(0, 'down', 'up', ['website_browse']));
    await recordSample(db, outcome(1, 'down', 'up', ['website_browse', 'photo']));
    expect((await incidents())[0]?.failed_checks).toBe('website_browse,photo');
  });

  it('tracks site and api incidents independently, and one cause can open both', async () => {
    db = createTestDb();
    await recordSample(db, outcome(0, 'down', 'down', ['photo'], ['photo']));
    await recordSample(db, outcome(1, 'up', 'down', [], ['photo']));
    const rows = await incidents();
    expect(rows.map((r) => [r.component, r.ended_at !== null])).toEqual([
      ['site', true],
      ['api', false],
    ]);
  });

  it('an Unknown sample neither opens nor closes an incident', async () => {
    db = createTestDb();
    await recordSample(db, outcome(0, 'down', 'unknown', ['website_browse']));
    await recordSample(db, outcome(1, 'unknown', 'unknown'));
    const rows = await incidents();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ended_at).toBeNull();
  });
});
