// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The 1-minute activity-poll cron tick (notification-service.md "Polling design"): for every due
// registration, one `messages/totals/unread` call, compare against the last-seen totals, push on
// a rise, store the new totals either way. Also the reauth-required path ("System alert:
// reauth-required") — an auth failure marks the row dead and sends exactly one distinct push.

import type { DbLike } from './db.js';
import { listDueRegistrations, markPolled, markReauthRequired } from './db.js';
import { decryptReadToken, importEncryptionKey } from './crypto.js';
import { fetchUnreadTotals, ReadTokenInvalidError } from './blipfoto.js';
import { sendFcmMessage } from './fcm.js';
import type { Env, RegistrationRow } from './types.js';

export interface PollSummary {
  due: number;
  polled: number;
  pushed: number;
  reauthRequired: number;
  errors: number;
}

interface CachedPrefs {
  configured: boolean;
}

function parseCachedPrefs(json: string | null): CachedPrefs {
  if (!json) return { configured: true }; // never fetched yet — see fetchPushConfigured's own note
  try {
    const parsed = JSON.parse(json) as Partial<CachedPrefs>;
    return { configured: parsed.configured !== false };
  } catch {
    return { configured: true };
  }
}

interface PollOneOutcome {
  kind: 'reauth' | 'polled';
  pushed: number;
}

async function pollOne(
  db: DbLike,
  env: Env,
  encryptionKey: CryptoKey,
  reg: RegistrationRow,
  nowMs: number,
): Promise<PollOneOutcome> {
  const readToken = await decryptReadToken(
    { ciphertext: reg.read_token_ciphertext, nonce: reg.read_token_nonce },
    encryptionKey,
  );

  let totals;
  try {
    totals = await fetchUnreadTotals(readToken);
  } catch (err) {
    if (err instanceof ReadTokenInvalidError) {
      await markReauthRequired(db, reg.id, nowMs);
      await sendFcmMessage(env, reg.device_token, {
        kind: 'reauth-required',
        accountId: reg.blipfoto_user_id,
      }).catch(() => {
        // Best-effort — the row's own status flag (not a resend) is what makes this idempotent;
        // a failed send here is retried next time something else marks the row for reauth, not
        // by this tick itself.
      });
      return { kind: 'reauth', pushed: 0 };
    }
    throw err;
  }

  const commentsDelta = totals.comments - reg.last_seen_comments_total;
  const notificationsDelta = totals.notifications - reg.last_seen_notifications_total;
  await markPolled(db, reg.id, nowMs, totals.comments, totals.notifications);

  let pushed = 0;
  const prefs = parseCachedPrefs(reg.cached_push_prefs);
  if (prefs.configured) {
    if (commentsDelta > 0) {
      await sendFcmMessage(env, reg.device_token, {
        kind: 'activity',
        stream: 'comments',
        accountId: reg.blipfoto_user_id,
        count: commentsDelta,
      });
      pushed++;
    }
    if (notificationsDelta > 0) {
      await sendFcmMessage(env, reg.device_token, {
        kind: 'activity',
        stream: 'notifications',
        accountId: reg.blipfoto_user_id,
        count: notificationsDelta,
      });
      pushed++;
    }
  }

  return { kind: 'polled', pushed };
}

export async function runActivityPoll(
  db: DbLike,
  env: Env,
  now: () => number = Date.now,
): Promise<PollSummary> {
  const nowMs = now();
  const due = await listDueRegistrations(db, nowMs);
  const encryptionKey = await importEncryptionKey(env.READ_TOKEN_ENCRYPTION_KEY);

  const summary: PollSummary = {
    due: due.length,
    polled: 0,
    pushed: 0,
    reauthRequired: 0,
    errors: 0,
  };

  for (const reg of due) {
    try {
      const outcome = await pollOne(db, env, encryptionKey, reg, nowMs);
      if (outcome.kind === 'reauth') summary.reauthRequired++;
      else summary.polled++;
      summary.pushed += outcome.pushed;
    } catch {
      // One registration's failure (a transient Blipfoto/FCM error, not an auth failure — those
      // are handled inside pollOne) must not abort the rest of the tick's batch.
      summary.errors++;
    }
  }

  return summary;
}
