// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

import type { AccountConfig, NetworkFailure, RagReason } from './backend.js';

/** What the user can do about a reason, from the amber banner. */
export type ReasonAction = 'sign_in' | 'retry' | 'dismiss' | 'backup_now' | 'status';

export interface DescribedReason {
  key: string;
  text: string;
  actions: ReasonAction[];
}

const GIVE_UP_DAYS = 14;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The wording for a run that stopped because Blipfoto could not be reached. */
function describeNetworkFailure(failure: NetworkFailure): DescribedReason {
  return failure === 'offline'
    ? {
        key: 'network',
        text: "You seem to be offline, so the last backup couldn't reach Blipfoto.",
        actions: ['backup_now'],
      }
    : {
        key: 'network',
        text: "Your connection looks fine, but Blipfoto isn't answering.",
        actions: ['backup_now', 'status'],
      };
}

function describe(reason: RagReason, networkFailure?: NetworkFailure | null): DescribedReason {
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
      if (networkFailure) return describeNetworkFailure(networkFailure);
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
  account: Pick<AccountConfig, 'rag_state' | 'rag_reasons' | 'error_message' | 'network_failure'>,
): DescribedReason[] {
  if (account.rag_state !== 'amber') return [];
  if (account.rag_reasons && account.rag_reasons.length > 0) {
    return account.rag_reasons.map((r) => describe(r, account.network_failure));
  }
  if (account.error_message) {
    return [
      describe(
        { code: 'last_run_failed', message: account.error_message },
        account.network_failure,
      ),
    ];
  }
  return [];
}
