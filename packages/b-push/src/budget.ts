// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The Workers Free plan allows 50 subrequests per invocation. Cloudflare's docs are ambiguous on
// whether D1 queries share that pool with `fetch` (the Workers limits page counts D1 as a
// subrequest; the D1 page lists its own 50), so one counter covers both: the conservative reading.

/** The plan's per-invocation cap. */
export const SUBREQUEST_LIMIT = 50;

/** Slack under the cap for anything the counter can't see (a redirect hop counts as a request). */
export const BUDGET_HEADROOM = 4;

/** What one run may spend. */
export const RUN_REQUEST_BUDGET = SUBREQUEST_LIMIT - BUDGET_HEADROOM;

/** The most one registration can cost on any path in poll.ts: the totals call, a token exchange,
 * two sends (comments and notifications), the write that stores its state, and (when the second
 * send reports the device gone) the delete. The reauth path is cheaper. BUDGET_HEADROOM still
 * covers anything the counter can't see, so this is a worst case for the code paths as written,
 * not a guarantee. */
export const WORST_CASE_REGISTRATION_COST = 6;

/** Kept back so the run can always write its pending quiet polls (poll.ts) at the end: a D1 batch
 * counts as one query however many statements it holds. */
export const FLUSH_RESERVE = 1;

export class RequestBudget {
  private used = 0;

  constructor(private readonly limit: number = RUN_REQUEST_BUDGET) {}

  /** Record `n` outbound requests or D1 queries about to be made. */
  spend(n: number = 1): void {
    this.used += n;
  }

  get remaining(): number {
    return this.limit - this.used;
  }

  /** Whether another registration can start without risking the cap, even if it turns out to be
   * the worst case, with the final batched write still affordable. */
  canStartRegistration(): boolean {
    return this.remaining >= WORST_CASE_REGISTRATION_COST + FLUSH_RESERVE;
  }
}
