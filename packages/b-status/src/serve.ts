// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// GET /v1/status: serve the stored snapshot. Free-tier discipline (b-oss#476): the Worker keeps the
// snapshot in isolate memory and looks in D1 at most once a minute, so a page view normally costs
// ZERO D1 reads however busy the page is. The minute is also how quickly a visitor's shared problem
// (patched into the stored snapshot the moment it is accepted, see shares.ts) reaches everyone else,
// and `Cache-Control: max-age` is capped at the same minute so browsers don't hold a stale copy
// longer than that.

import { jsonHeaders as headers } from './cors.js';
import type { DbLike } from './db.js';

/** How long a Worker instance trusts its in-memory snapshot, and the cap on browser caching. */
const RECHECK_MS = 60_000;
const MAX_MAX_AGE_S = 60;
const MIN_MAX_AGE_S = 15;

interface Cached {
  json: string;
  generatedAt: number;
  nextRefreshAt: number;
  /** When to look in D1 again. */
  recheckAt: number;
}

let cached: Cached | null = null;

/** Forget this Worker instance's in-memory copy, so its next request reads the stored snapshot. Called
 * after a share is patched into it, so a visitor on the same instance sees the share at once. */
export function invalidateStatusCache(): void {
  cached = null;
}

/** Test hook (same as invalidateStatusCache). */
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
      recheckAt: now + RECHECK_MS,
    };
  }

  const remainingS = Math.floor((cached.nextRefreshAt - now) / 1000);
  // Never longer than a minute (shares can change the data between probes); past due (cron late):
  // ask again in a minute, not in a tight loop.
  const maxAge =
    remainingS <= 0 ? MAX_MAX_AGE_S : Math.min(MAX_MAX_AGE_S, Math.max(MIN_MAX_AGE_S, remainingS));
  return new Response(request.method === 'HEAD' ? null : cached.json, {
    status: 200,
    headers: headers(origin, { 'Cache-Control': `public, max-age=${maxAge}` }),
  });
}
