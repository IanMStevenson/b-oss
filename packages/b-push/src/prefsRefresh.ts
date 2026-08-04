// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The hourly cron tick (notification-service.md "Preference freshness" — the "everywhere-else
// changes" path). Refetches every active registration's push-configured flag and caches it,
// independent of the 1-minute activity poll, so a change made on blipfoto.com itself (not through
// FLW-17's refresh-preferences ping) is picked up within the hour rather than never.

import type { DbLike } from './db.js';
import { listActiveRegistrations, updateCachedPrefs } from './db.js';
import { decryptReadToken, importEncryptionKey } from './crypto.js';
import { fetchPushConfigured, ReadTokenInvalidError } from './blipfoto.js';
import type { Env, RegistrationRow } from './types.js';

export interface PrefsRefreshSummary {
  refreshed: number;
  /** A dead token found here is *not* marked/pushed from this tick — see the note below. */
  skippedReadTokenInvalid: number;
  errors: number;
}

async function refreshOne(
  db: DbLike,
  encryptionKey: CryptoKey,
  reg: RegistrationRow,
  nowMs: number,
): Promise<'refreshed' | 'reauth'> {
  const readToken = await decryptReadToken(
    { ciphertext: reg.read_token_ciphertext, nonce: reg.read_token_nonce },
    encryptionKey,
  );
  try {
    const configured = await fetchPushConfigured(readToken);
    await updateCachedPrefs(db, reg.id, JSON.stringify({ configured }), nowMs);
    return 'refreshed';
  } catch (err) {
    if (err instanceof ReadTokenInvalidError) {
      return 'reauth';
    }
    throw err;
  }
}

/** Deliberately does **not** call `markReauthRequired`/send the reauth-required push itself on a
 * dead token — that is the 1-minute activity poll's job alone (notification-service.md, "System
 * alert: reauth-required" ties the alert to *the activity poll* finding the auth failure). This
 * tick runs once an hour; if it were the one to flip a registration to `read-token-invalid`, the
 * next activity-poll tick's `listDueRegistrations` (which only selects `status = 'active'` rows)
 * would skip the row entirely — so the row would go dead with **no reauth-required push ever
 * sent** until something else happened to re-trigger detection. Skipping here and letting the
 * activity poll (which runs every 1 minute, not every 60) find and announce the same failure on
 * its own next tick avoids that gap. */
export async function runPrefsRefresh(
  db: DbLike,
  env: Env,
  now: () => number = Date.now,
): Promise<PrefsRefreshSummary> {
  const nowMs = now();
  const registrations = await listActiveRegistrations(db);
  const encryptionKey = await importEncryptionKey(env.READ_TOKEN_ENCRYPTION_KEY);

  const summary: PrefsRefreshSummary = { refreshed: 0, skippedReadTokenInvalid: 0, errors: 0 };
  for (const reg of registrations) {
    try {
      const outcome = await refreshOne(db, encryptionKey, reg, nowMs);
      if (outcome === 'reauth') summary.skippedReadTokenInvalid++;
      else summary.refreshed++;
    } catch {
      summary.errors++;
    }
  }
  return summary;
}
