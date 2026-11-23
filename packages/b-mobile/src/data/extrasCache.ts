// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The in-memory cache of what an entry's extras were last read as (data/entryExtras.ts), in its own
// module so the flows that change them (adding or removing extras, signing in to or out of the
// website session) can drop it without importing the loader, which imports them. Keyed by account
// and entry: what one member's session could read must never be served to another.

import { resumeClear } from './resumeCache.js';

const PREFIX = 'extras:';

/** The cache key for an entry's extras as read for an account (none: the public view). */
export function extrasKey(entryId: string, accountId: string | null): string {
  return `${PREFIX}${accountId ?? ''}:${entryId}`;
}

/** Drops every remembered extras result. Called whenever what a read would return could have
 * changed: after extras are added or removed, and when the website session changes (a sign-in, a
 * switch of account, a removal), so the next look re-reads instead of showing a stale list or a
 * stale "web sign-in needed". Cheap: the next entry view reads again. */
export function forgetEntryExtras(): void {
  resumeClear(PREFIX);
}
