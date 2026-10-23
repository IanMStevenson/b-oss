// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Visitor-shared problems (b-oss#486). Anonymous: no account, no email, no free text. A share is
// "which part (Site/API)", "what's happening (offline / not working right)" and optional tags.
// It is shown only as an aggregate, unverified signal and NEVER changes probe state or uptime.
//
// POST /v1/shares, in this order, cheapest first, so bots never reach the store:
//   1. origin + size + shape validation (no I/O)
//   2. Cloudflare Turnstile verification (one subrequest; free)
//   3. the 30-minute limiter (one D1 read) and a global hourly circuit breaker (one D1 read)
//   4. one D1 batch: the share row, the limiter row, and a purge of expired limiter rows
// The limiter keeps only a salted hash of the IP, checked inline against its expiry. A repeat
// attempt is told only that they have shared recently: never when they can share again (we don't
// want to encourage repeats).

import { ALLOWED_ORIGINS, jsonResponse } from './cors.js';
import type { DbLike } from './db.js';
import { DAY_MS, dayOf, startOfUtcDay } from './time.js';
import type { Component, Env } from './types.js';

export const SHARE_INTERVAL_MS = 30 * 60 * 1000;
/** Circuit breaker: more than this many shares in an hour and new ones are refused ("busy"). */
export const MAX_SHARES_PER_HOUR = 200;
const MAX_BODY_BYTES = 2048;
const TURNSTILE_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export const SHARE_TAGS = ['login', 'uploads', 'slow', 'unreliable'] as const;
export type ShareTag = (typeof SHARE_TAGS)[number];
export type ShareWhat = 'offline' | 'degraded';

export interface ShareInput {
  component: Component;
  what: ShareWhat;
  tags: ShareTag[];
  turnstileToken: string;
}

export interface ShareDeps {
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  now: () => number;
}

/** A validated share, or null if the body isn't one. Unknown tags are rejected, not dropped. */
export function parseShare(text: string): ShareInput | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o = v as Record<string, unknown>;
  if (o.component !== 'site' && o.component !== 'api') return null;
  if (o.what !== 'offline' && o.what !== 'degraded') return null;
  if (
    typeof o.turnstileToken !== 'string' ||
    o.turnstileToken === '' ||
    o.turnstileToken.length > 2048
  )
    return null;
  const rawTags = o.tags === undefined ? [] : o.tags;
  if (!Array.isArray(rawTags) || rawTags.length > SHARE_TAGS.length) return null;
  const tags: ShareTag[] = [];
  for (const t of rawTags) {
    if (typeof t !== 'string' || !(SHARE_TAGS as readonly string[]).includes(t)) return null;
    if (!tags.includes(t as ShareTag)) tags.push(t as ShareTag);
  }
  return { component: o.component, what: o.what, tags, turnstileToken: o.turnstileToken };
}

/** SHA-256 (hex) of salt + ip. The raw IP is never stored or logged. */
export async function hashIp(salt: string, ip: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${salt}:${ip}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function verifyTurnstile(
  secret: string,
  token: string,
  ip: string,
  deps: ShareDeps,
): Promise<'ok' | 'failed' | 'unavailable'> {
  try {
    const res = await deps.fetch(TURNSTILE_URL, {
      method: 'POST',
      body: new URLSearchParams({ secret, response: token, remoteip: ip }),
    });
    if (!res.ok) return 'unavailable';
    const body = await res.json<{ success?: boolean }>();
    return body.success === true ? 'ok' : 'failed';
  } catch {
    return 'unavailable';
  }
}

export async function handleShare(
  request: Request,
  env: Pick<Env, 'TURNSTILE_SECRET_KEY' | 'SHARE_HASH_SALT'>,
  db: DbLike,
  deps: ShareDeps,
): Promise<Response> {
  const origin = request.headers.get('Origin');
  if (request.method === 'OPTIONS') {
    return jsonResponse(null, 204, origin, {
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '7200',
    });
  }
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405, origin, { Allow: 'POST, OPTIONS' });
  }
  // A browser always sends Origin on a cross-site POST: refuse other sites. (Not a security
  // boundary on its own: Turnstile is; this just stops casual cross-site use of a visitor's browser.)
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse({ error: 'forbidden' }, 403, origin);
  }

  // 1. Validation (no I/O).
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return jsonResponse({ error: 'invalid' }, 400, origin);
  const share = parseShare(text);
  const ip = request.headers.get('CF-Connecting-IP');
  if (!share || !ip) return jsonResponse({ error: 'invalid' }, 400, origin);
  if (!env.TURNSTILE_SECRET_KEY || !env.SHARE_HASH_SALT) {
    return jsonResponse({ error: 'unavailable' }, 503, origin);
  }

  // 2. Turnstile, before any store access.
  const human = await verifyTurnstile(env.TURNSTILE_SECRET_KEY, share.turnstileToken, ip, deps);
  if (human === 'unavailable') return jsonResponse({ error: 'unavailable' }, 503, origin);
  if (human === 'failed') return jsonResponse({ error: 'turnstile_failed' }, 403, origin);

  // 3. Limiter and circuit breaker.
  const now = deps.now();
  const hash = await hashIp(env.SHARE_HASH_SALT, ip);
  const recent = await db
    .prepare('SELECT expires_at FROM share_limit WHERE hash = ? AND expires_at > ?')
    .bind(hash, now)
    .first<{ expires_at: number }>();
  if (recent) return jsonResponse({ error: 'already_shared' }, 429, origin);
  const lastHour = await db
    .prepare('SELECT COUNT(*) AS n FROM shares WHERE ts >= ?')
    .bind(now - 60 * 60 * 1000)
    .first<{ n: number }>();
  if ((lastHour?.n ?? 0) >= MAX_SHARES_PER_HOUR) {
    return jsonResponse({ error: 'busy' }, 503, origin);
  }

  // 4. Store.
  await db.batch([
    db
      .prepare('INSERT INTO shares (ts, component, what, tags) VALUES (?, ?, ?, ?)')
      .bind(now, share.component, share.what, share.tags.join(',')),
    db
      .prepare('INSERT OR REPLACE INTO share_limit (hash, expires_at) VALUES (?, ?)')
      .bind(hash, now + SHARE_INTERVAL_MS),
    db.prepare('DELETE FROM share_limit WHERE expires_at <= ?').bind(now),
  ]);
  return jsonResponse({ ok: true }, 201, origin);
}

/** Cron: drop limiter rows that have expired (the handler also purges when it writes). */
export async function purgeShareLimit(db: DbLike, now: number): Promise<void> {
  await db.prepare('DELETE FROM share_limit WHERE expires_at <= ?').bind(now).run();
}

/** Cron: fold whole UTC days older than 48 hours into `share_days` and delete those rows, in one
 * batch, so only counts (no tags) are kept. Returns the number of days folded. */
export async function foldShares(db: DbLike, now: number): Promise<number> {
  const before = startOfUtcDay(now - 2 * DAY_MS);
  const old = (
    await db
      .prepare('SELECT ts, component FROM shares WHERE ts < ?')
      .bind(before)
      .all<{ ts: number; component: Component }>()
  ).results;
  if (old.length === 0) return 0;
  const counts = new Map<string, { day: string; component: Component; n: number }>();
  for (const s of old) {
    const day = dayOf(s.ts);
    const key = `${day}|${s.component}`;
    const c = counts.get(key) ?? { day, component: s.component, n: 0 };
    c.n++;
    counts.set(key, c);
  }
  const stmts = [...counts.values()].map((c) =>
    // Whole days are folded at once, so a day is only ever written here once; ADD in case a late
    // row for an already-folded day ever appears (a clock skew edge).
    db
      .prepare(
        'INSERT INTO share_days (day, component, count) VALUES (?, ?, ?) ON CONFLICT (day, component) DO UPDATE SET count = count + excluded.count',
      )
      .bind(c.day, c.component, c.n),
  );
  stmts.push(db.prepare('DELETE FROM shares WHERE ts < ?').bind(before));
  await db.batch(stmts);
  return new Set(old.map((s) => dayOf(s.ts))).size;
}
