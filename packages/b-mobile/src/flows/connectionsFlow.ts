// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// FLW-09 (approve/refuse follow requests, restore access) and the SCR-19 "remove follower"
// operation. Follow/unfollow itself lives in reactionsFlow.ts (FLW-08) and is reused as-is by
// SCR-18 — these are the operations specific to the social-graph screens. Pure API wrappers, same
// split as every other flows/*.ts file: gating and optimistic updates are the screen's job.

import { getClient } from '../data/client.js';

export async function removeFollower(username: string): Promise<void> {
  const client = await getClient();
  await client.removeFollower([username]);
}

/** FLW-09 — approve a pending follow request; the requester becomes a follower. */
export async function approveRequest(username: string): Promise<void> {
  const client = await getClient();
  await client.approvePendingRequests([username]);
}

/** FLW-09 — refuse a pending follow request (caller confirms first, per the flow). */
export async function refuseRequest(username: string): Promise<void> {
  const client = await getClient();
  await client.rejectPendingRequests([username]);
}

/** FLW-09 — restore access for a previously-refused member (SCR-21's "Allow"). Does not make
 * them a follower again; they may send a fresh request. */
export async function restoreAccess(username: string): Promise<void> {
  const client = await getClient();
  await client.unblockUsers([username]);
}
