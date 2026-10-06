-- SPDX-License-Identifier: GPL-3.0-or-later
-- Copyright (C) 2026 Ian Stevenson

-- b-oss#244: the app's own per-stream push toggles, default on. Run in the D1 console BEFORE
-- deploying the Worker that reads them. The Worker already running ignores these columns, and its
-- inserts get the defaults, so this is safe to run while it's live. Existing rows come out with
-- both streams on, matching what they get today.

ALTER TABLE registrations ADD COLUMN push_comments INTEGER NOT NULL DEFAULT 1;
ALTER TABLE registrations ADD COLUMN push_notifications INTEGER NOT NULL DEFAULT 1;
