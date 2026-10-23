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
