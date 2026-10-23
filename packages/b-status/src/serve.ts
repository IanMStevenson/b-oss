// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// GET /v1/status: serve the stored snapshot. Free-tier discipline (b-oss#476): the Worker keeps the
// snapshot in isolate memory until it is due to be replaced, so a page view normally costs ZERO D1
// reads. If the cron is late (the snapshot is past its `next_refresh_at`) it still holds the old one
// for a minute before looking again, so a late cron can't turn a traffic spike into a D1 read per
// request. `Cache-Control: max-age` is the time remaining, so browsers don't ask again either.

import { jsonHeaders as headers } from './cors.js';
import type { DbLike } from './db.js';

const MIN_MAX_AGE_S = 15;
const LATE_HOLD_MS = 60_000;

interface Cached {
  json: string;
  generatedAt: number;
  nextRefreshAt: number;
  /** When to look in D1 again. */
  recheckAt: number;
}

let cached: Cached | null = null;

/** Test hook: forget the isolate-memory copy. */
export function resetServeCache(): void {
  cached = null;
}

export async function handleStatus(request: Request, db: DbLike, now: number): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    const h = headers(origin, { 'Access-Control-Allow-Methods': 'GET, HEAD' });
    return new Response(null, { status: 204, headers: h });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: headers(origin, { Allow: 'GET, HEAD' }),
    });
  }

  if (!cached || now >= cached.recheckAt) {
    const row = await db
      .prepare('SELECT json, generated_at, next_refresh_at FROM snapshot WHERE id = 1')
      .first<{ json: string; generated_at: number; next_refresh_at: number }>();
    if (!row) {
      return new Response(JSON.stringify({ error: 'No status data yet' }), {
        status: 503,
        headers: headers(origin, { 'Cache-Control': 'public, max-age=60' }),
      });
    }
    cached = {
      json: row.json,
      generatedAt: row.generated_at,
      nextRefreshAt: row.next_refresh_at,
      recheckAt: Math.max(row.next_refresh_at, now + LATE_HOLD_MS),
    };
  }

  const remainingS = Math.floor((cached.nextRefreshAt - now) / 1000);
  // Past due (cron late): ask again in a minute, not in a tight loop.
  const maxAge = remainingS >= MIN_MAX_AGE_S ? remainingS : remainingS > 0 ? MIN_MAX_AGE_S : 60;
  return new Response(request.method === 'HEAD' ? null : cached.json, {
    status: 200,
    headers: headers(origin, { 'Cache-Control': `public, max-age=${maxAge}` }),
  });
}
