// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// All D1 access, behind a minimal structural interface (`DbLike`) rather than the full
// `D1Database` abstract class from @cloudflare/workers-types. Two things this buys:
//   - production code (src/index.ts) can pass the real `env.DB` straight in — a real D1Database
//     has strictly more methods than DbLike asks for, so it satisfies the interface structurally
//     with no cast;
//   - tests (src/__tests__/testDb.ts) can pass a small node:sqlite-backed fake that implements
//     only `prepare().bind().run()/.first()/.all()`, exercising the *real* SQL in schema.sql
//     against a real SQLite engine, without needing miniflare/wrangler's local-D1 emulation —
//     the project's established "mock at the boundary, test the real logic" approach,
//     applied to a database boundary instead of a Capacitor one.

import type { RegistrationRow, RegistrationStatus } from './types.js';

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
}

export interface DbLike {
  prepare(query: string): D1PreparedStatementLike;
}

export async function insertRegistration(db: DbLike, row: RegistrationRow): Promise<void> {
  await db
    .prepare(
      `INSERT INTO registrations
        (id, secret_hash, blipfoto_user_id, read_token_ciphertext, read_token_nonce,
         device_token, platform, poll_interval_minutes, last_polled_at,
         last_seen_comments_total, last_seen_notifications_total,
         push_comments, push_notifications, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.secret_hash,
      row.blipfoto_user_id,
      row.read_token_ciphertext,
      row.read_token_nonce,
      row.device_token,
      row.platform,
      row.poll_interval_minutes,
      row.last_polled_at,
      row.last_seen_comments_total,
      row.last_seen_notifications_total,
      row.push_comments,
      row.push_notifications,
      row.status,
      row.created_at,
    )
    .run();
}

export async function getRegistrationById(db: DbLike, id: string): Promise<RegistrationRow | null> {
  const row = await db
    .prepare('SELECT * FROM registrations WHERE id = ?')
    .bind(id)
    .first<RegistrationRow>();
  return row ?? null;
}

export async function deleteRegistration(db: DbLike, id: string): Promise<void> {
  await db.prepare('DELETE FROM registrations WHERE id = ?').bind(id).run();
}

export async function updateReadToken(
  db: DbLike,
  id: string,
  ciphertext: string,
  nonce: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE registrations SET read_token_ciphertext = ?, read_token_nonce = ?, status = 'active'
       WHERE id = ?`,
    )
    .bind(ciphertext, nonce, id)
    .run();
}

export async function updateDeviceToken(
  db: DbLike,
  id: string,
  deviceToken: string,
): Promise<void> {
  await db
    .prepare('UPDATE registrations SET device_token = ? WHERE id = ?')
    .bind(deviceToken, id)
    .run();
}

/** Server floor of 5 minutes is enforced here, unconditionally — "regardless of what the UI
 * sends" (notification-service.md's PATCH contract). */
export async function updatePollInterval(db: DbLike, id: string, minutes: number): Promise<void> {
  const floored = Math.max(5, Math.round(minutes));
  await db
    .prepare('UPDATE registrations SET poll_interval_minutes = ? WHERE id = ?')
    .bind(floored, id)
    .run();
}

export async function markPolled(
  db: DbLike,
  id: string,
  polledAt: number,
  commentsTotal: number,
  notificationsTotal: number,
): Promise<void> {
  await db
    .prepare(
      `UPDATE registrations
       SET last_polled_at = ?, last_seen_comments_total = ?, last_seen_notifications_total = ?
       WHERE id = ?`,
    )
    .bind(polledAt, commentsTotal, notificationsTotal, id)
    .run();
}

/** "Marks that registration's status read-token-invalid and stops polling it" (notification-
 * service.md, "System alert: reauth-required") — `last_polled_at` is still bumped so the row
 * doesn't sit permanently "most overdue" and get picked first by listDueRegistrations if it were
 * ever reactivated by a bug; it's excluded from that query by status regardless. */
export async function markReauthRequired(db: DbLike, id: string, polledAt: number): Promise<void> {
  await db
    .prepare(
      `UPDATE registrations SET status = 'read-token-invalid', last_polled_at = ? WHERE id = ?`,
    )
    .bind(polledAt, id)
    .run();
}

/** The app's per-stream push toggles (b-oss#244). Each is optional so a PATCH that only touches
 * one leaves the other as it was; a call with neither is a no-op. */
export async function updateStreamToggles(
  db: DbLike,
  id: string,
  toggles: { pushComments?: boolean; pushNotifications?: boolean },
): Promise<void> {
  if (toggles.pushComments !== undefined) {
    await db
      .prepare('UPDATE registrations SET push_comments = ? WHERE id = ?')
      .bind(toggles.pushComments ? 1 : 0, id)
      .run();
  }
  if (toggles.pushNotifications !== undefined) {
    await db
      .prepare('UPDATE registrations SET push_notifications = ? WHERE id = ?')
      .bind(toggles.pushNotifications ? 1 : 0, id)
      .run();
  }
}

/** Most registrations one tick polls. A registration costs at most five outbound requests (one
 * totals call, then a token exchange and a send for each of two pushes), so nine stays inside the
 * Workers free plan's 50 per run. The rest are picked up oldest-first on the next tick. */
export const POLL_BATCH_LIMIT = 9;

/** The 1-minute activity-poll tick's selection: active registrations whose interval has elapsed.
 * `poll_interval_minutes` is stored in minutes; comparison is done in the same unit as
 * `last_polled_at`/`nowMs` (epoch milliseconds) by converting the interval once per row via SQL,
 * rather than pulling every active row into JS to filter — this is exactly the query the
 * `idx_registrations_poll` index (schema.sql) exists for. A never-polled row (`last_polled_at`
 * IS NULL) is always due. Longest-waiting first (SQLite sorts NULL first), capped at `limit`, so
 * the same rows can't starve when more are due than one tick can poll. */
export async function listDueRegistrations(
  db: DbLike,
  nowMs: number,
  limit: number = POLL_BATCH_LIMIT,
): Promise<RegistrationRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM registrations
       WHERE status = 'active'
         AND (last_polled_at IS NULL OR ? - last_polled_at >= poll_interval_minutes * 60000)
       ORDER BY last_polled_at ASC
       LIMIT ?`,
    )
    .bind(nowMs, limit)
    .all<RegistrationRow>();
  return result.results;
}

export function isKnownStatus(value: string): value is RegistrationStatus {
  return value === 'active' || value === 'read-token-invalid';
}
