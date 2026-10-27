// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { recordSample } from '../incidents.js';
import { runProbe, slotOf, type ProbeOutcome } from '../probe.js';
import { CRON_LAG_MS, decideTrigger, runTriggeredCheck } from '../recheck.js';
import { handleShare } from '../shares.js';
import { storeSnapshot, type StatusSnapshot } from '../snapshot.js';
import { INTERVAL_MS } from '../time.js';
import type { CheckId, ComponentState, IncidentRow, State } from '../types.js';
import { CFG, fakeFetch, healthy } from './fixtures.js';
import { NOW } from './sim.js';
import { createTestDb, type TestDb } from './testDb.js';

const MIN = 60_000;
const S = NOW; // a slot start (12:00 UTC)

describe('decideTrigger', () => {
  const slot = slotOf(S);
  // [name, now offset from slot start (min), triggeredSlot, lastCheck offset (min) or null, expected]
  const cases: [string, number, number | null, number | null, boolean][] = [
    ['first report ever', 1, null, 0.5, true],
    ['first report of a cycle', 1, slot - 1, 0.5, true],
    ['first report even right after the scheduled check', 0.6, null, 0.5, true],
    ['second at +2 min: too soon', 3, slot, 1, false],
    ['second 4.9 min after the last check: too soon', 5.9, slot, 1, false],
    ['second at +6 min with >5 min remaining', 7, slot, 1, true],
    ['second exactly 5 min after the last check', 6, slot, 1, true],
    ['second with only 4 min to the boundary', 11, slot, 1, false],
    ['second with 4.9 min to the next scheduled check', 10.6, slot, 1, false],
    ['second with exactly 5 min to the next scheduled check', 10.5, slot, 1, false],
    ['second with just over 5 min to the next scheduled check', 10.4, slot, 1, true],
    ['new cycle resets', 16, slot, 1, true],
    ['no known last check counts as long ago', 7, slot, null, true],
  ];
  it.each(cases)('%s', (_n, nowMin, trig, lastMin, expected) => {
    const d = decideTrigger({
      now: S + nowMin * MIN,
      triggeredSlot: trig,
      lastCheckAt: lastMin === null ? null : S + lastMin * MIN,
    });
    expect(d.run).toBe(expected);
  });
  it('treats the cron lag as part of the wait for the next check', () => {
    expect(CRON_LAG_MS).toBe(30_000);
    expect(INTERVAL_MS).toBe(15 * MIN);
  });
});

function outcome(
  ts: number,
  site: State,
  api: State,
  siteFailed: CheckId[] = [],
  apiFailed: CheckId[] = [],
): ProbeOutcome {
  const cs = (state: State, failed: CheckId[]): ComponentState => ({ state, failed });
  return {
    ts,
    slot: slotOf(ts),
    states: { site: cs(site, siteFailed), api: cs(api, apiFailed) },
    results: siteFailed.concat(apiFailed).map((id) => ({ id, status: 'fail', ms: 1 })),
    retried: site === 'down' || api === 'down',
  };
}

let db: TestDb;
let logs: string[];
beforeEach(() => {
  db = createTestDb();
  logs = [];
});
afterEach(() => db.close());

/** Scheduled sample for the slot at S + 30 s, plus a snapshot, like the cron leaves things. */
async function scheduled(site: State = 'up', api: State = 'up'): Promise<void> {
  const o = outcome(
    S + 30_000,
    site,
    api,
    site === 'down' ? ['photo'] : [],
    api === 'down' ? ['api_recent'] : [],
  );
  await recordSample(db, o);
  await storeSnapshot(db, o.ts);
}

const run = (nowMin: number, probeOut: ProbeOutcome | (() => Promise<ProbeOutcome>)) => {
  let t = S + nowMin * MIN;
  return runTriggeredCheck(db, {
    probe: typeof probeOut === 'function' ? probeOut : () => Promise.resolve(probeOut),
    now: () => (t += 10), // wall clock moves a little on every read
    log: (l) => logs.push(l),
  });
};

const sample = () =>
  db.prepare('SELECT * FROM samples WHERE slot = ?').bind(slotOf(S)).first<{
    site_state: State;
    api_state: State;
    retried: number;
    checks: string;
  }>();
const incidents = async () =>
  (await db.prepare('SELECT * FROM incidents ORDER BY id').all<IncidentRow>()).results;
const meta = async (k: string) =>
  (await db.prepare('SELECT value FROM meta WHERE key = ?').bind(k).first<{ value: string }>())
    ?.value ?? null;
const snapshot = async () =>
  JSON.parse(
    (await db.prepare('SELECT json FROM snapshot WHERE id = 1').first<{ json: string }>())!.json,
  ) as StatusSnapshot;
const count = async (t: string) =>
  (await db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).first<{ n: number }>())!.n;

describe('runTriggeredCheck', () => {
  it('turns an up sample into down for the current slot, opening an incident at the check time', async () => {
    await scheduled();
    const ts = S + 2 * MIN;
    await run(2, outcome(ts, 'down', 'up', ['photo']));
    const s = await sample();
    expect(s).toMatchObject({ site_state: 'down', api_state: 'up', retried: 1 });
    expect(JSON.parse(s!.checks)).toEqual([{ id: 'photo', status: 'fail', ms: 1 }]);
    expect(await count('samples')).toBe(1);
    expect(await incidents()).toEqual([
      { id: 1, component: 'site', started_at: ts, ended_at: null, failed_checks: 'photo' },
    ]);
    const snap = await snapshot();
    expect(snap.now.site.state).toBe('down');
    expect(snap.generated_at).toBe(ts);
    expect(logs.some((l) => l.includes('triggered check done') && l.includes('changed=site'))).toBe(
      true,
    );
  });

  it('can turn both components down', async () => {
    await scheduled();
    await run(2, outcome(S + 2 * MIN, 'down', 'down', ['photo'], ['api_recent']));
    expect(await sample()).toMatchObject({ site_state: 'down', api_state: 'down' });
    expect((await incidents()).map((i) => i.component)).toEqual(['site', 'api']);
  });

  it('a healthy probe changes nothing but still claims the cycle', async () => {
    await scheduled();
    const before = await snapshot();
    await run(2, outcome(S + 2 * MIN, 'up', 'up'));
    expect(await sample()).toMatchObject({ site_state: 'up', api_state: 'up', retried: 0 });
    expect(await incidents()).toEqual([]);
    const after = await snapshot();
    expect(after.now.site.checked_at).toBe(S + 2 * MIN);
    expect(after.now.api.checked_at).toBe(S + 2 * MIN);
    // nothing else moved
    after.now.site.checked_at = before.now.site.checked_at;
    after.now.api.checked_at = before.now.api.checked_at;
    expect(after).toEqual(before);
    expect(await meta('triggered_slot')).toBe(String(slotOf(S)));
    expect(await meta('triggered_at')).not.toBeNull();
  });

  it('does not touch the last-checked time of an unknown component', async () => {
    await scheduled();
    await run(2, outcome(S + 2 * MIN, 'up', 'unknown'));
    const snap = await snapshot();
    expect(snap.now.site.checked_at).toBe(S + 2 * MIN);
    expect(snap.now.api.checked_at).toBe(S + 30_000);
  });

  it('swallows and logs a failure while updating the last-checked time', async () => {
    await scheduled();
    await db.prepare("UPDATE snapshot SET json = 'not json' WHERE id = 1").run();
    await run(2, outcome(S + 2 * MIN, 'up', 'up'));
    expect(logs.some((l) => l.includes('could not update last-checked'))).toBe(true);
    expect(logs.some((l) => l.includes('triggered check done'))).toBe(true);
    expect(await meta('triggered_slot')).toBe(String(slotOf(S)));
  });

  it('never improves a state, and leaves down and unknown alone', async () => {
    await scheduled('down', 'unknown');
    await run(2, outcome(S + 2 * MIN, 'up', 'up'));
    expect(await sample()).toMatchObject({ site_state: 'down', api_state: 'unknown' });
    // a down result over an unknown sample is not an up -> down either
    await run(9, outcome(S + 9 * MIN, 'down', 'down', ['photo'], ['api_recent']));
    expect(await sample()).toMatchObject({ site_state: 'down', api_state: 'unknown' });
    expect(await incidents()).toHaveLength(1); // only the scheduled site one
  });

  it('is a no-op, claiming nothing, when the slot has no sample yet', async () => {
    let probed = false;
    await run(0.1, () => {
      probed = true;
      return Promise.resolve(outcome(S, 'down', 'down', ['photo']));
    });
    expect(probed).toBe(false);
    expect(await count('samples')).toBe(0);
    expect(await incidents()).toEqual([]);
    expect(await meta('triggered_slot')).toBeNull();
    expect(logs[0]).toContain('skipped');
  });

  it('does not duplicate an incident that is already open', async () => {
    await scheduled();
    // an incident left open from an earlier outage on the same component
    await db
      .prepare(
        "INSERT INTO incidents (component, started_at, ended_at, failed_checks) VALUES ('site', ?, NULL, 'website_browse')",
      )
      .bind(S - 2 * 60 * MIN)
      .run();
    await run(2, outcome(S + 2 * MIN, 'down', 'up', ['photo']));
    const inc = await incidents();
    expect(inc).toHaveLength(1);
    expect(inc[0]).toMatchObject({ started_at: S - 120 * MIN, ended_at: null });
  });

  it('keeps the visitor reports in the rebuilt snapshot', async () => {
    await scheduled();
    await db
      .prepare("INSERT INTO shares (ts, component, what, tags) VALUES (?, 'site', 'offline', '')")
      .bind(S + MIN)
      .run();
    await run(2, outcome(S + 2 * MIN, 'down', 'up', ['photo']));
    const snap = await snapshot();
    expect(snap.shares.hours.site).toEqual([[S, 1]]);
  });

  it('catches and logs a probe that throws, leaving the data alone', async () => {
    await scheduled();
    await run(2, () => Promise.reject(new Error('boom')));
    expect(await sample()).toMatchObject({ site_state: 'up' });
    expect(logs.at(-1)).toMatch(/triggered check failed.*boom/);
    expect(logs[0]).toContain('triggered check start');
  });

  it('ignores a result that landed in a later slot', async () => {
    await scheduled();
    await run(14, outcome(S + 15 * MIN + 1000, 'down', 'down', ['photo']));
    expect(await sample()).toMatchObject({ site_state: 'up' });
    expect(await incidents()).toEqual([]);
  });

  it('applies the rule across reports: first runs, near ones do not, a spaced one does', async () => {
    await scheduled();
    const probes: number[] = [];
    const p = (m: number) => () => {
      probes.push(m);
      return Promise.resolve(outcome(S + m * MIN, 'up', 'up'));
    };
    await run(1, p(1)); // first in cycle
    await run(3, p(3)); // 2 min after the last check
    await run(7, p(7)); // 6 min after, >5 min remaining
    await run(8, p(8)); // 1 min after
    await run(12.5, p(12.5)); // 5.5 min after, but only 3 min remain
    expect(probes).toEqual([1, 7]);
    await recordSample(db, outcome(S + 15 * MIN + 30_000, 'up', 'up')); // the next scheduled run
    await run(16, p(16)); // next cycle
    expect(probes).toEqual([1, 7, 16]);
  });
});

describe('with the real probe and a fake network', () => {
  it('a confirmed photo failure becomes a down sample and an incident', async () => {
    await scheduled();
    const bad = { ...healthy(), 'https://img.test/p.jpg': { status: 503 } };
    const t = S + 2 * MIN;
    await run(2, () =>
      runProbe(CFG, { fetch: fakeFetch(bad), now: () => t }, () => Promise.resolve(), 0),
    );
    expect((await sample())?.site_state).toBe('down');
    expect((await incidents())[0]).toMatchObject({ started_at: t, failed_checks: 'photo' });
  });
});

describe('handleShare', () => {
  const ENV = { TURNSTILE_SECRET_KEY: 's', SHARE_HASH_SALT: 'p' };
  const body = JSON.stringify({
    component: 'site',
    what: 'offline',
    tags: [],
    turnstileToken: 't',
  });
  const req = () =>
    new Request('https://b-status.test/v1/shares', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.9', Origin: 'https://b-oss.dev' },
      body,
    });
  const fetchOk = () => Promise.resolve(new Response(JSON.stringify({ success: true })));

  it('hands the re-check to waitUntil, and returns 201 even when it fails', async () => {
    const pending: Promise<unknown>[] = [];
    const res = await handleShare(req(), ENV, db, {
      fetch: fetchOk,
      now: () => S + MIN,
      waitUntil: (p) => pending.push(p),
      triggerCheck: () => Promise.reject(new Error('cut off')),
    });
    expect(res.status).toBe(201);
    expect(pending).toHaveLength(1);
    await expect(pending[0]).resolves.toBeUndefined();
  });

  it('does not trigger anything for a refused share', async () => {
    let triggered = 0;
    const res = await handleShare(
      new Request('https://b-status.test/v1/shares', { method: 'POST', body: '{}' }),
      ENV,
      db,
      {
        fetch: fetchOk,
        now: () => S,
        waitUntil: () => undefined,
        triggerCheck: () => {
          triggered++;
          return Promise.resolve();
        },
      },
    );
    expect(res.status).toBe(400);
    expect(triggered).toBe(0);
  });
});
