// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-06 (star/favourite), FLW-08 (follow/unfollow), FLW-11 (report). Pure API wrappers only —
// the optimistic update, the rollback-on-failure, and the account/write gating all live in the
// calling screen (SCR-06), same split as accountsFlow.ts vs. its screens. The one thing that does
// belong here: interpreting error-codes.md's "not actually a failure" codes (221/222) and the
// favourite-quota code (223) — that's call-specific API knowledge, not UI policy.

import { BlipfotoError } from '@b-oss/b-api';
import type { BlipFriendship, ReportReasons } from '@b-oss/b-api';
import { getClient } from '../data/client.js';
import { t } from '../strings/index.js';

/** error-codes.md 223 — daily favourite quota reached. Distinct from a generic failure so the
 * caller can show the quota-specific message FLW-06 requires. */
export class FavoriteQuotaError extends Error {}

/** error-codes.md 221 — "already starred" is not a failure; the optimistic state already matches
 * reality, so this resolves normally rather than throwing. */
export async function starEntry(entryId: string): Promise<void> {
  const client = await getClient();
  try {
    await client.starEntry(entryId);
  } catch (err) {
    if (err instanceof BlipfotoError && err.code === 221) return;
    throw err;
  }
}

/** error-codes.md 222 — "already favourited," same non-failure treatment as 221. 223 is a real
 * refusal and surfaces as FavoriteQuotaError for the caller to show its specific message and
 * roll back. */
export async function favoriteEntry(entryId: string): Promise<void> {
  const client = await getClient();
  try {
    await client.favoriteEntry(entryId);
  } catch (err) {
    if (err instanceof BlipfotoError) {
      if (err.code === 222) return;
      if (err.code === 223) throw new FavoriteQuotaError(t('ERR.223.favourite_quota'));
    }
    throw err;
  }
}

async function friendshipOrThrow(
  promise: Promise<{ friendships: BlipFriendship[] }>,
): Promise<BlipFriendship> {
  const res = await promise;
  const friendship = res.friendships[0];
  if (!friendship) throw new Error('No friendship state returned.');
  return friendship;
}

/** FLW-08 — follow. A protected target's real resulting state (following vs. pending) is only
 * known once the server responds; the caller shows an immediate optimistic "following" and
 * corrects it from this return value, rather than needing to predict protection status
 * client-side. */
export async function followUser(username: string): Promise<BlipFriendship> {
  const client = await getClient();
  return friendshipOrThrow(client.follow([username]));
}

/** FLW-08 — unfollow (caller confirms first, per the flow). */
export async function unfollowUser(username: string): Promise<BlipFriendship> {
  const client = await getClient();
  return friendshipOrThrow(client.unfollow([username]));
}

/** FLW-11 — report an entry, or (via the same endpoint) a comment identified in `note`. */
export async function reportEntry(
  entryId: string,
  reasons: ReportReasons,
  note?: string,
): Promise<void> {
  const client = await getClient();
  await client.reportEntry(entryId, reasons, note);
}
