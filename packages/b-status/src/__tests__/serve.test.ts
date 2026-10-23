// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import { beforeEach, describe, expect, it } from 'vitest';
import type { DbLike } from '../db.js';
import { handleStatus, resetServeCache } from '../serve.js';
import { storeSnapshot } from '../snapshot.js';
import { NOW, WEEK, simulate } from './sim.js';
import { createTestDb } from './testDb.js';

const req = (method = 'GET', origin?: string) =>
  new Request('https://b-status.test/v1/status', {
    method,
    headers: origin ? { Origin: origin } : {},
  });

/** Counts how many statements are prepared (≈ D1 round trips). */
function counted(db: DbLike): { db: DbLike; reads: () => number } {
  let n = 0;
  return {
    db: {
      prepare: (q) => {
        n++;
        return db.prepare(q);
      },
      batch: (s) => db.batch(s),
    },
    reads: () => n,
  };
}

async function seeded() {
  const db = createTestDb();
  await simulate(db, WEEK);
  const snap = await storeSnapshot(db, NOW);
  return { db, snap };
}

beforeEach(() => resetServeCache());

describe('GET /v1/status', () => {
  it('serves the stored snapshot with max-age set to the time remaining', async () => {
    const { db, snap } = await seeded();
    const res = await handleStatus(req(), db, NOW + 60_000);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(JSON.parse(JSON.stringify(snap)));
    const remaining = Math.floor((snap.next_refresh_at - (NOW + 60_000)) / 1000);
    expect(res.headers.get('Cache-Control')).toBe(`public, max-age=${remaining}`);
  });

  it('costs no D1 round trip after the first request, until the snapshot is due', async () => {
    const { db } = await seeded();
    const c = counted(db);
    await handleStatus(req(), c.db, NOW + 1000);
    expect(c.reads()).toBe(1);
    await handleStatus(req(), c.db, NOW + 2000);
    await handleStatus(req(), c.db, NOW + 600_000);
    expect(c.reads()).toBe(1);
  });

  it('when the cron is late, holds the old snapshot for a minute instead of reading D1 per request', async () => {
    const { db, snap } = await seeded();
    const c = counted(db);
    const late = snap.next_refresh_at + 5000;
    const res = await handleStatus(req(), c.db, late);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    await handleStatus(req(), c.db, late + 30_000);
    expect(c.reads()).toBe(1);
    await handleStatus(req(), c.db, late + 61_000);
    expect(c.reads()).toBe(2);
  });

  it('never advertises less than 15 seconds when the refresh is imminent', async () => {
    const { db, snap } = await seeded();
    const res = await handleStatus(req(), db, snap.next_refresh_at - 2000);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=15');
  });

  it('answers 503 before the first snapshot, and does not cache that', async () => {
    const db = createTestDb();
    const res = await handleStatus(req(), db, NOW);
    expect(res.status).toBe(503);
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60');
    await simulate(db, WEEK);
    await storeSnapshot(db, NOW);
    expect((await handleStatus(req(), db, NOW + 1000)).status).toBe(200);
  });

  it('allows the site origin, and no other, to read it (a plain GET: no preflight needed)', async () => {
    const { db } = await seeded();
    const ok = await handleStatus(req('GET', 'https://b-oss.dev'), db, NOW);
    expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://b-oss.dev');
    const other = await handleStatus(req('GET', 'https://evil.example'), db, NOW);
    expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(other.headers.get('Vary')).toBe('Origin');
  });

  it('handles OPTIONS and rejects other methods', async () => {
    const { db } = await seeded();
    expect((await handleStatus(req('OPTIONS', 'https://b-oss.dev'), db, NOW)).status).toBe(204);
    expect((await handleStatus(req('POST'), db, NOW)).status).toBe(405);
  });

  it('HEAD returns headers without a body', async () => {
    const { db } = await seeded();
    const res = await handleStatus(req('HEAD'), db, NOW);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });
});
