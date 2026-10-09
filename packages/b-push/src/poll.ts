// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The 1-minute activity-poll cron tick (ARCHITECTURE.md "Polling design"): for every due
// registration, one `messages/totals/unread` call, compare against the last-seen totals, push on
// a rise (for each stream the user has left switched on, b-oss#244), store the new totals either
// way. Also the reauth-required path ("System alert:
// reauth-required") — an auth failure marks the row dead and sends exactly one distinct push.

import type { DbLike } from './db.js';
import {
  deleteRegistration,
  listDueRegistrations,
  markPolled,
  markPolledBatch,
  markReauthRequired,
  type PolledState,
} from './db.js';
import { RequestBudget } from './budget.js';
import { decryptReadToken, importEncryptionKey } from './crypto.js';
import { fetchUnreadTotals, ReadTokenInvalidError } from './blipfoto.js';
import { DeviceUnregisteredError, sendFcmMessage } from './fcm.js';
import { describeError } from './log.js';
import type { Env, RegistrationRow } from './types.js';

/** Quiet polls (no push attempted) written per D1 batch. Re-polling a quiet row is harmless, so a
 * lost batch only wastes budget; a smaller number loses less per failure, a larger one spends
 * fewer queries. Tune from the `activity poll` log lines. */
export const MARK_POLLED_CHUNK = 5;

export interface PollSummary {
  /** Due registrations read this tick (capped at DUE_FETCH_LIMIT). */
  due: number;
  /** Due registrations left for a later tick because the request budget ran out. A lower bound
   * once `due` reaches DUE_FETCH_LIMIT. Anything above 0 means the service is at capacity. */
  deferred: number;
  /** Minutes since the longest-waiting deferred registration was last polled; null if none. */
  maxWaitMin: number | null;
  polled: number;
  pushed: number;
  reauthRequired: number;
  /** Registrations deleted because FCM says their device is gone (b-oss#265). */
  removed: number;
  errors: number;
}

interface PollContext {
  db: DbLike;
  env: Env;
  encryptionKey: CryptoKey;
  budget: RequestBudget;
  nowMs: number;
  /** Queue a quiet poll's state for the next batched write. */
  queueQuiet: (state: PolledState) => void;
}

interface PollOneOutcome {
  kind: 'reauth' | 'polled';
  pushed: number;
}

/** Marks the row dead and sends the one distinct reauth-required push. */
async function reauthRequired(ctx: PollContext, reg: RegistrationRow): Promise<void> {
  const { db, env, budget, nowMs } = ctx;
  budget.spend(1);
  await markReauthRequired(db, reg.id, nowMs);
  await sendFcmMessage(
    env,
    reg.device_token,
    {
      kind: 'reauth-required',
      accountId: reg.blipfoto_user_id,
    },
    budget,
  ).catch(async (sendErr: unknown) => {
    // The device is gone, so nobody can act on the reauth push: drop the row and its token.
    if (sendErr instanceof DeviceUnregisteredError) {
      budget.spend(1);
      await deleteRegistration(db, reg.id);
      console.log(`[b-push] removed ${reg.id}: device unregistered`);
      return;
    }
    console.error(`[b-push] reauth push failed for ${reg.id}: ${describeError(sendErr)}`);
    // Best-effort — the row's own status flag (not a resend) is what makes this idempotent;
    // a failed send here is retried next time something else marks the row for reauth, not
    // by this tick itself.
  });
}

async function pollOne(ctx: PollContext, reg: RegistrationRow): Promise<PollOneOutcome> {
  const { db, env, encryptionKey, budget, nowMs } = ctx;
  let readToken;
  try {
    readToken = await decryptReadToken(
      { ciphertext: reg.read_token_ciphertext, nonce: reg.read_token_nonce },
      encryptionKey,
    );
  } catch (err) {
    // Undecryptable under the current key (READ_TOKEN_ENCRYPTION_KEY rotated or lost): as dead as
    // a rejected token. Marking it reauth-required stops the every-minute retry, and the user's
    // "Sign in again" PATCHes a fresh token encrypted under the current key (b-oss#252).
    console.error(`[b-push] cannot decrypt read token for ${reg.id}: ${describeError(err)}`);
    await reauthRequired(ctx, reg);
    return { kind: 'reauth', pushed: 0 };
  }

  let totals;
  budget.spend(1);
  try {
    totals = await fetchUnreadTotals(readToken);
  } catch (err) {
    // Only 50/51 arrive as ReadTokenInvalidError. A code 52 is rethrown as a plain BlipfotoError
    // and lands in runActivityPoll's catch as an ordinary error, leaving the row active
    // (b-oss#238; see isBearerUnrecognised in blipfoto.ts for why).
    if (err instanceof ReadTokenInvalidError) {
      await reauthRequired(ctx, reg);
      return { kind: 'reauth', pushed: 0 };
    }
    throw err;
  }

  const commentsDelta = totals.comments - reg.last_seen_comments_total;
  const notificationsDelta = totals.notifications - reg.last_seen_notifications_total;

  // A stream's new total is stored only once its push (if any) has been sent. If a send fails,
  // that stream keeps its old total so the next poll pushes it again rather than losing it; a
  // stream whose push wasn't attempted after an earlier failure keeps its old total too.
  // A stream that's switched off still has its total stored, so one switched back on later
  // starts from the current count rather than firing a catch-up push for everything that arrived
  // while it was off (b-oss#244). With both toggles off the row still polls; the app DELETEs the
  // registration when the user turns the last one off, so that state is transient.
  let commentsSeen = totals.comments;
  let notificationsSeen = totals.notifications;
  let sendError: Error | null = null;
  let pushed = 0;
  let pushAttempted = false;
  if (reg.push_comments && commentsDelta > 0) {
    try {
      pushAttempted = true;
      await sendFcmMessage(
        env,
        reg.device_token,
        {
          kind: 'activity',
          stream: 'comments',
          accountId: reg.blipfoto_user_id,
          count: commentsDelta,
        },
        budget,
      );
      pushed++;
    } catch (err) {
      sendError = err instanceof Error ? err : new Error(String(err));
      commentsSeen = reg.last_seen_comments_total;
    }
  }
  if (reg.push_notifications && notificationsDelta > 0) {
    if (sendError === null) {
      try {
        pushAttempted = true;
        await sendFcmMessage(
          env,
          reg.device_token,
          {
            kind: 'activity',
            stream: 'notifications',
            accountId: reg.blipfoto_user_id,
            count: notificationsDelta,
          },
          budget,
        );
        pushed++;
      } catch (err) {
        sendError = err instanceof Error ? err : new Error(String(err));
        notificationsSeen = reg.last_seen_notifications_total;
      }
    } else {
      notificationsSeen = reg.last_seen_notifications_total;
    }
  }

  if (pushAttempted) {
    // Written on its own, straight away: if the run died before a batched write, the next tick
    // would send this push again, and again every minute for as long as the run kept dying.
    budget.spend(1);
    await markPolled(db, reg.id, nowMs, commentsSeen, notificationsSeen);
  } else {
    // Nothing was sent, so losing this write only means polling the row again.
    ctx.queueQuiet({
      id: reg.id,
      polledAt: nowMs,
      commentsTotal: commentsSeen,
      notificationsTotal: notificationsSeen,
    });
  }
  if (sendError !== null) throw sendError;

  return { kind: 'polled', pushed };
}

export async function runActivityPoll(
  db: DbLike,
  env: Env,
  now: () => number = Date.now,
  budget: RequestBudget = new RequestBudget(),
): Promise<PollSummary> {
  const nowMs = now();
  budget.spend(1);
  const due = await listDueRegistrations(db, nowMs);
  const encryptionKey = await importEncryptionKey(env.READ_TOKEN_ENCRYPTION_KEY);

  const summary: PollSummary = {
    due: due.length,
    deferred: 0,
    maxWaitMin: null,
    polled: 0,
    pushed: 0,
    reauthRequired: 0,
    removed: 0,
    errors: 0,
  };

  const pendingQuiet: PolledState[] = [];
  const flushQuiet = async (): Promise<void> => {
    if (pendingQuiet.length === 0) return;
    const batch = pendingQuiet.splice(0);
    // Charged per statement, not as one query. Cloudflare doesn't say a D1 batch counts as a
    // single subrequest (its limits apply to each statement in a batch), and under-counting could
    // let a "too many subrequests" error land on the write of a row that has already pushed. Cut
    // this to 1 only once a test deploy shows a batch really is one (b-oss#369).
    budget.spend(batch.length);
    try {
      await markPolledBatch(db, batch);
    } catch (err) {
      console.error(`[b-push] could not store ${batch.length} polls: ${describeError(err)}`);
      summary.errors++;
    }
  };

  const ctx: PollContext = {
    db,
    env,
    encryptionKey,
    budget,
    nowMs,
    queueQuiet: (state) => pendingQuiet.push(state),
  };

  let next = 0;
  for (; next < due.length; next++) {
    // Oldest-first, so stopping here defers the most recently polled rows, and over capacity every
    // registration's interval stretches about equally. A healthy registration is not starved; a
    // row whose poll keeps throwing writes nothing, so it stays at the head of the queue and costs
    // a request every tick, which only matters if such rows approach a run's capacity.
    if (!budget.canStartRegistration(pendingQuiet.length)) break;
    const reg = due[next];
    try {
      const outcome = await pollOne(ctx, reg);
      if (outcome.kind === 'reauth') summary.reauthRequired++;
      else summary.polled++;
      summary.pushed += outcome.pushed;
    } catch (err) {
      if (err instanceof DeviceUnregisteredError) {
        // Uninstalled, data cleared or phone replaced: the app lost the secret it would need to
        // DELETE this itself, so remove it here rather than poll with its read token forever.
        budget.spend(1);
        await deleteRegistration(db, reg.id);
        console.log(`[b-push] removed ${reg.id}: device unregistered`);
        summary.removed++;
        continue;
      }
      console.error(`[b-push] poll failed for ${reg.id}: ${describeError(err)}`);
      // One registration's failure (a transient Blipfoto/FCM error, not an auth failure — those
      // are handled inside pollOne) must not abort the rest of the tick's batch.
      summary.errors++;
    }
    if (pendingQuiet.length >= MARK_POLLED_CHUNK) await flushQuiet();
  }
  await flushQuiet();

  summary.deferred = due.length - next;
  if (summary.deferred > 0) {
    const oldest = due[next];
    summary.maxWaitMin = Math.round(
      (nowMs - (oldest.last_polled_at ?? oldest.created_at)) / 60_000,
    );
  }

  return summary;
}
