-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Ian Stevenson

-- b-status D1 schema (ARCHITECTURE.md). This file is always the *current* full schema; the live
-- database is brought up to it by hand in the D1 console, and later changes are numbered files in
-- ../migrations/. Mirrored by src/__tests__/testDb.ts (loaded into in-memory node:sqlite).
--
-- Free-tier discipline (b-oss#476 "Cloudflare budget"): one row per probe run, indexes only
-- where a query needs them (each index costs an extra row write per insert).

-- One row per 15-minute slot. `slot` = floor(unix ms / 900000), so a duplicated cron invocation
-- is a no-op (INSERT OR IGNORE) and a missing slot means "no data" (Unknown), never up or down.
CREATE TABLE IF NOT EXISTS samples (
  slot        INTEGER PRIMARY KEY,
  ts          INTEGER NOT NULL,          -- when the run started, epoch ms
  site_state  TEXT NOT NULL,             -- 'up' | 'down' | 'unknown'
  api_state   TEXT NOT NULL,             -- 'up' | 'down' | 'unknown'
  retried     INTEGER NOT NULL DEFAULT 0,
  checks      TEXT NOT NULL              -- JSON: [{id, status, ms, detail?}, ...] of the final run
);

-- A run of consecutive down samples for one component. ended_at NULL = ongoing.
-- `failed_checks` is the union of failing check ids over the incident.
CREATE TABLE IF NOT EXISTS incidents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  component     TEXT NOT NULL,           -- 'site' | 'api'
  started_at    INTEGER NOT NULL,        -- ts of the first confirmed-down sample
  ended_at      INTEGER,                 -- ts of the first passing sample after it; NULL = ongoing
  failed_checks TEXT NOT NULL            -- comma-separated check ids
);
CREATE INDEX IF NOT EXISTS idx_incidents_open ON incidents (component) WHERE ended_at IS NULL;

-- The page's whole data bundle, rebuilt each run (b-oss#484). A single row (id = 1).
CREATE TABLE IF NOT EXISTS snapshot (
  id               INTEGER PRIMARY KEY CHECK (id = 1),
  json             TEXT NOT NULL,
  generated_at     INTEGER NOT NULL,
  next_refresh_at  INTEGER NOT NULL
);

-- Small key/value store: 'first_ts' (when monitoring began, set once), 'folded_through' (the last
-- UTC day folded into day_exceptions) and 'history' (the cached, rebuilt-once-a-day summary of
-- folded days, see history.ts).
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Long-term history is SPARSE: a row exists only for a UTC day that had something to record. Every
-- day has 96 slots, so "up" is derived (96 - down - unknown, or fewer on the first day) and a day
-- with no row was a perfect day. `unknown_samples` counts slots the monitor didn't run (or couldn't
-- judge), kept so uptime never counts unchecked time as up. Per-day incident counts and what failed
-- are NOT stored here: `incidents` is kept for good and has them.
CREATE TABLE IF NOT EXISTS day_exceptions (
  day              TEXT NOT NULL,   -- YYYY-MM-DD (UTC)
  component        TEXT NOT NULL,   -- 'site' | 'api'
  down_samples     INTEGER NOT NULL,
  unknown_samples  INTEGER NOT NULL,
  PRIMARY KEY (day, component)
) WITHOUT ROWID;

-- Visitor-shared problems (b-oss#486). No personal data: a time, which part, what was happening and
-- optional tags. Rows are kept only until their day is folded into `share_days` (shares.ts), after
-- which only counts remain. They never affect probe state or uptime.
CREATE TABLE IF NOT EXISTS shares (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  component  TEXT NOT NULL,   -- 'site' | 'api'
  what       TEXT NOT NULL,   -- 'offline' | 'degraded'
  tags       TEXT NOT NULL    -- comma-separated subset of: login, uploads, slow, unreliable
);
CREATE INDEX IF NOT EXISTS idx_shares_ts ON shares (ts);

-- Daily share counts per component, folded from `shares` (same 48-hour boundary as day_exceptions).
-- Already sparse: a row only for a day that had shares.
CREATE TABLE IF NOT EXISTS share_days (
  day        TEXT NOT NULL,
  component  TEXT NOT NULL,
  count      INTEGER NOT NULL,
  PRIMARY KEY (day, component)
) WITHOUT ROWID;

-- The 30-minute share limiter: a SALTED HASH of the client IP and when it stops counting. Never the
-- raw IP. Checked inline against expires_at (so 30 minutes is exact) and purged by the cron.
CREATE TABLE IF NOT EXISTS share_limit (
  hash        TEXT PRIMARY KEY,
  expires_at  INTEGER NOT NULL
) WITHOUT ROWID;
