// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { AccountConfig, RagReason } from './backend.js';

/** What the user can do about a reason, from the amber banner. */
export type ReasonAction = 'sign_in' | 'retry' | 'dismiss';

export interface DescribedReason {
  key: string;
  text: string;
  actions: ReasonAction[];
}

const GIVE_UP_DAYS = 14;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function describe(reason: RagReason): DescribedReason {
  switch (reason.code) {
    case 'incomplete':
      return {
        key: 'incomplete',
        text: "The last backup didn't finish. Backup now will resume it.",
        actions: [],
      };
    case 'web_signin_missing':
      return {
        key: 'web_signin_missing',
        text: 'Sign in to the Blipfoto website to back up full-resolution and extra images.',
        actions: ['sign_in'],
      };
    case 'last_run_failed':
      return { key: 'last_run_failed', text: reason.message, actions: [] };
    case 'outstanding': {
      const parts: string[] = [];
      if (reason.retrying > 0) {
        parts.push(`${plural(reason.retrying, 'entry', 'entries')} not archived yet — will retry`);
      }
      if (reason.unavailable > 0) {
        parts.push(
          `${plural(reason.unavailable, 'entry is', 'entries are')} suspended or unavailable on Blipfoto`,
        );
      }
      if (reason.other > 0) {
        parts.push(
          `${plural(reason.other, 'entry', 'entries')} could not be fetched after ${GIVE_UP_DAYS} days of trying`,
        );
      }
      return {
        key: 'outstanding',
        text: parts.join('. '),
        actions: reason.unavailable + reason.other > 0 ? ['retry', 'dismiss'] : [],
      };
    }
  }
}

/**
 * The reasons to show for an account. Status written before reasons existed has only an
 * `error_message`, which is shown as a failed-run reason until the next run replaces it.
 */
export function describeReasons(
  account: Pick<AccountConfig, 'rag_state' | 'rag_reasons' | 'error_message'>,
): DescribedReason[] {
  if (account.rag_state !== 'amber') return [];
  if (account.rag_reasons && account.rag_reasons.length > 0) {
    return account.rag_reasons.map(describe);
  }
  if (account.error_message) {
    return [describe({ code: 'last_run_failed', message: account.error_message })];
  }
  return [];
}
