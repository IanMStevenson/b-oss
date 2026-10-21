-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Ian Stevenson

-- b-oss#244: drop the cache of Blipfoto's push.configured flag, which b-push no longer reads.
-- Run in the D1 console only AFTER the new Worker is deployed: the old Worker writes both columns
-- on every insert (and the hourly refresh updates them), so dropping them under it would break
-- registration. D1 is SQLite 3.35+, which supports DROP COLUMN; neither column is indexed
-- (idx_registrations_poll is on status, last_polled_at) or otherwise referenced, so SQLite allows
-- the drop.

ALTER TABLE registrations DROP COLUMN cached_push_prefs;
ALTER TABLE registrations DROP COLUMN prefs_fetched_at;
