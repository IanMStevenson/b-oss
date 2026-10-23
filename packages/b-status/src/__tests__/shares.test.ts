// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MAX_SHARES_PER_HOUR,
  SHARE_INTERVAL_MS,
  foldShares,
  handleShare,
  hashIp,
  parseShare,
  purgeShareLimit,
} from '../shares.js';
import { storeSnapshot } from '../snapshot.js';
import { runMaintenance } from '../maintain.js';
import { NOW, WEEK, at, simulate } from './sim.js';
import { createTestDb, type TestDb } from './testDb.js';

const ENV = { TURNSTILE_SECRET_KEY: 'ts-secret', SHARE_HASH_SALT: 'pepper' };
const GOOD = { component: 'api', what: 'degraded', tags: ['login'], turnstileToken: 'tok' };

let db: TestDb;
let turnstile: 'ok' | 'fail' | 'down';
let fetched: string[];
beforeEach(() => {
  db = createTestDb();
  turnstile = 'ok';
  fetched = [];
});
afterEach(() => db.close());

const deps = (now = NOW) => ({
  now: () => now,
  fetch: (input: string) => {
    fetched.push(input);
    if (turnstile === 'down') return Promise.reject(new Error('net'));
    return Promise.resolve(
      new Response(JSON.stringify({ success: turnstile === 'ok' }), { status: 200 }),
    );
  },
});

function post(body: unknown, ip: string | null = '203.0.113.7', origin = 'https://b-oss.dev') {
  const headers: Record<string, string> = { 'Content-Type': 'text/plain;charset=UTF-8' };
  if (ip) headers['CF-Connecting-IP'] = ip;
  if (origin) headers.Origin = origin;
  return new Request('https://b-status.test/v1/shares', {
    method: 'POST',
    headers,
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

const count = async (table: string): Promise<number> =>
  (await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n ?? -1;

describe('parseShare', () => {
  it('accepts a valid share and de-duplicates tags', () => {
    expect(parseShare(JSON.stringify({ ...GOOD, tags: ['login', 'login', 'slow'] }))).toEqual({
      component: 'api',
      what: 'degraded',
      tags: ['login', 'slow'],
      turnstileToken: 'tok',
    });
  });
  it('treats missing tags as none', () => {
    expect(parseShare(JSON.stringify({ ...GOOD, tags: undefined }))?.tags).toEqual([]);
  });
  it.each([
    ['not json', 'nope'],
    ['bad component', { ...GOOD, component: 'photos' }],
    ['bad what', { ...GOOD, what: 'slow' }],
    ['unknown tag', { ...GOOD, tags: ['free text here'] }],
    ['tags not an array', { ...GOOD, tags: 'login' }],
    ['no token', { ...GOOD, turnstileToken: '' }],
    ['huge token', { ...GOOD, turnstileToken: 'x'.repeat(3000) }],
    ['an array', [1]],
  ])('rejects %s', (_n, body) => {
    expect(parseShare(typeof body === 'string' ? body : JSON.stringify(body))).toBeNull();
  });
});

describe('hashIp', () => {
  it('is salted, deterministic and never contains the IP', async () => {
    const a = await hashIp('pepper', '203.0.113.7');
    expect(a).toBe(await hashIp('pepper', '203.0.113.7'));
    expect(a).not.toBe(await hashIp('other', '203.0.113.7'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('203');
  });
});

describe('POST /v1/shares', () => {
  it('stores a share and a limiter row (a hash, never the IP)', async () => {
    const res = await handleShare(post(GOOD), ENV, db, deps());
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    const share = await db.prepare('SELECT * FROM shares').first<Record<string, unknown>>();
    expect(share).toMatchObject({ ts: NOW, component: 'api', what: 'degraded', tags: 'login' });
    const lim = await db.prepare('SELECT * FROM share_limit').first<{
      hash: string;
      expires_at: number;
    }>();
    expect(lim?.expires_at).toBe(NOW + SHARE_INTERVAL_MS);
    const dump = JSON.stringify([
      (await db.prepare('SELECT * FROM shares').all()).results,
      (await db.prepare('SELECT * FROM share_limit').all()).results,
    ]);
    expect(dump).not.toContain('203.0.113.7');
  });

  it('allows one share per 30 minutes per client, and does not say when the next is allowed', async () => {
    await handleShare(post(GOOD), ENV, db, deps());
    const again = await handleShare(post(GOOD), ENV, db, deps(NOW + 60_000));
    expect(again.status).toBe(429);
    const body = await again.text();
    expect(JSON.parse(body)).toEqual({ error: 'already_shared' });
    expect(again.headers.get('Retry-After')).toBeNull();
    expect(await count('shares')).toBe(1);
    // A different client is unaffected.
    expect((await handleShare(post(GOOD, '198.51.100.9'), ENV, db, deps(NOW + 1000))).status).toBe(
      201,
    );
    // After 30 minutes the original client can share again.
    expect((await handleShare(post(GOOD), ENV, db, deps(NOW + SHARE_INTERVAL_MS + 1))).status).toBe(
      201,
    );
  });

  it('rejects invalid bodies before any verification or storage', async () => {
    const res = await handleShare(post({ ...GOOD, what: 'x' }), ENV, db, deps());
    expect(res.status).toBe(400);
    expect(fetched).toEqual([]);
    expect(await count('shares')).toBe(0);
  });

  it('rejects oversized bodies and requests with no client address', async () => {
    expect((await handleShare(post('x'.repeat(5000)), ENV, db, deps())).status).toBe(400);
    expect((await handleShare(post(GOOD, null), ENV, db, deps())).status).toBe(400);
    expect(fetched).toEqual([]);
  });

  it('refuses a failed Turnstile check without touching the store', async () => {
    turnstile = 'fail';
    const res = await handleShare(post(GOOD), ENV, db, deps());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'turnstile_failed' });
    expect(await count('shares')).toBe(0);
    expect(await count('share_limit')).toBe(0);
  });

  it('answers 503 when Turnstile cannot be reached, and when its secrets are missing', async () => {
    turnstile = 'down';
    expect((await handleShare(post(GOOD), ENV, db, deps())).status).toBe(503);
    expect((await handleShare(post(GOOD), {}, db, deps())).status).toBe(503);
    expect(await count('shares')).toBe(0);
  });

  it('only accepts the page’s own origins', async () => {
    const res = await handleShare(
      post(GOOD, '203.0.113.7', 'https://evil.example'),
      ENV,
      db,
      deps(),
    );
    expect(res.status).toBe(403);
    const ok = await handleShare(post(GOOD, '203.0.113.8'), ENV, db, deps());
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://b-oss.dev');
  });

  it('trips the hourly circuit breaker', async () => {
    const stmts = [];
    for (let i = 0; i < MAX_SHARES_PER_HOUR; i++) {
      stmts.push(
        db
          .prepare(
            "INSERT INTO shares (ts, component, what, tags) VALUES (?, 'site', 'offline', '')",
          )
          .bind(NOW - 1000 - i),
      );
    }
    await db.batch(stmts);
    const res = await handleShare(post(GOOD), ENV, db, deps());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'busy' });
    expect(await count('shares')).toBe(MAX_SHARES_PER_HOUR);
  });

  it('purges expired limiter rows when it writes and from the cron', async () => {
    await handleShare(post(GOOD, '10.0.0.1'), ENV, db, deps());
    await handleShare(post(GOOD, '10.0.0.2'), ENV, db, deps(NOW + SHARE_INTERVAL_MS + 5));
    expect(await count('share_limit')).toBe(1); // the first expired and was purged by the second write
    await purgeShareLimit(db, NOW + 2 * SHARE_INTERVAL_MS + 10);
    expect(await count('share_limit')).toBe(0);
  });

  it('answers OPTIONS and rejects other methods', async () => {
    const opt = new Request('https://b-status.test/v1/shares', {
      method: 'OPTIONS',
      headers: { Origin: 'https://b-oss.dev' },
    });
    const res = await handleShare(opt, ENV, db, deps());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
    const get = new Request('https://b-status.test/v1/shares');
    expect((await handleShare(get, ENV, db, deps())).status).toBe(405);
  });
});

describe('foldShares', () => {
  async function addShare(ts: number, component: 'site' | 'api', tags = 'slow') {
    await db
      .prepare("INSERT INTO shares (ts, component, what, tags) VALUES (?, ?, 'degraded', ?)")
      .bind(ts, component, tags)
      .run();
  }

  it('keeps only counts for days older than 48 hours, dropping tags', async () => {
    await addShare(at(19, 10), 'site');
    await addShare(at(19, 11), 'site', 'login,slow');
    await addShare(at(20, 9), 'api');
    await addShare(at(22, 9), 'site'); // recent: stays raw
    expect(await foldShares(db, NOW)).toBe(2);
    const days = (await db.prepare('SELECT * FROM share_days ORDER BY day, component').all())
      .results;
    expect(days).toEqual([
      { day: '2026-10-19', component: 'site', count: 2 },
      { day: '2026-10-20', component: 'api', count: 1 },
    ]);
    expect(await count('shares')).toBe(1);
    expect(await foldShares(db, NOW)).toBe(0); // idempotent
  });
});

describe('shares in the snapshot', () => {
  it('reports hourly, daily and weekly counts, folded and live, and never touches uptime', async () => {
    await simulate(db, WEEK);
    await runMaintenance(db, NOW);
    const withoutShares = await storeSnapshot(db, NOW);
    const add = (ts: number, c: string) =>
      db
        .prepare("INSERT INTO shares (ts, component, what, tags) VALUES (?, ?, 'offline', '')")
        .bind(ts, c)
        .run();
    await add(at(19, 10), 'site'); // folded
    await add(at(19, 11), 'site');
    await add(at(22, 9, 10), 'site'); // live, in the 48-hour window
    await add(at(22, 9, 40), 'site');
    await add(at(23, 11, 50), 'api');
    await runMaintenance(db, NOW);
    const s = await storeSnapshot(db, NOW);
    expect(s.shares.hours.site).toEqual([[at(22, 9), 2]]);
    expect(s.shares.hours.api).toEqual([[at(23, 11), 1]]);
    expect(s.shares.days.site).toEqual([
      ['2026-10-19', 2],
      ['2026-10-22', 2],
    ]);
    expect(s.shares.days.api).toEqual([['2026-10-23', 1]]);
    expect(s.shares.weeks.site).toEqual([['2026-10-19', 4]]);
    expect(s.uptime).toEqual(withoutShares.uptime);
    expect(s.now).toEqual(withoutShares.now);
  });
});
