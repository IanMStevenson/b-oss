-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Ian Stevenson

-- b-push D1 schema (notification-service.md "Data model (D1)"). One table, one row per
-- (account, device) registration. Applied manually via `wrangler d1 execute` (see wrangler.toml)
-- — never run automatically. Mirrored by packages/b-push/src/__tests__/testDb.ts for tests
-- (loaded into an in-memory node:sqlite database so the real SQL is what gets exercised, not a
-- hand-rolled re-implementation of it).
--
-- Column notes, where they diverge from the spec doc's own prose table:
--   - `last_seen_unread_totals` is split into two integer columns (comments/notifications)
--     rather than kept as one JSON blob — same information, directly comparable/queryable, no
--     JSON parse on every poll tick.
--   - `read_token` is split into `read_token_ciphertext` + `read_token_nonce` (AES-256-GCM,
--     random nonce per row, per the doc's Security notes) rather than a single combined column,
--     so the nonce is never accidentally treated as part of the ciphertext.
--   - `status` holds the `active` / `read-token-invalid` state from the "System alert:
--     reauth-required" section directly, rather than a separate boolean, since the two exhaust
--     the header's only outcomes today the app doesn't switch a registration itself.

CREATE TABLE IF NOT EXISTS registrations (
  id                          TEXT PRIMARY KEY,
  secret_hash                 TEXT NOT NULL,
  blipfoto_user_id            TEXT NOT NULL,
  read_token_ciphertext       TEXT NOT NULL,
  read_token_nonce            TEXT NOT NULL,
  device_token                TEXT NOT NULL,
  platform                    TEXT NOT NULL,
  poll_interval_minutes       INTEGER NOT NULL DEFAULT 5,
  last_polled_at              INTEGER,
  last_seen_comments_total       INTEGER NOT NULL DEFAULT 0,
  last_seen_notifications_total  INTEGER NOT NULL DEFAULT 0,
  cached_push_prefs           TEXT,
  prefs_fetched_at            INTEGER,
  status                      TEXT NOT NULL DEFAULT 'active',
  created_at                  INTEGER NOT NULL
);

-- Drives "selects registrations where now - last_polled_at >= poll_interval_minutes" (the
-- 1-minute activity-poll tick) — only ever scans `active` rows, since a `read-token-invalid`
-- registration is deliberately excluded from further polling until re-registered.
CREATE INDEX IF NOT EXISTS idx_registrations_poll ON registrations (status, last_polled_at);
