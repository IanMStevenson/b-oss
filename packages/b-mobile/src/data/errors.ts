// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Single error mapper every call site uses (§7). Turns a b-api BlipfotoError/NetworkError into
// one of a small set of outcomes. The code->outcome table is TODO G's output
// (api-appendix/error-codes.md's "write/validation codes" row) and the copy-deck keys it returns
// are TODO F's (docs/AppSpec/TextStrings.csv's "validation" category, whose keys are exactly
// `ERR.<code>.<name>`) — both now wired via strings/index.ts's `t()`.
//
// Deliberately excluded from VALIDATION_CODES: 221/222 ("already starred/favourited" — not a
// failure at all, resolved without throwing by flows/reactionsFlow.ts) and 223 (the favourite
// quota — thrown as its own FavoriteQuotaError by that same module, since the caller needs to
// roll back the optimistic +1 specifically for that case, not generically for any validation
// outcome). Both are handled before an error ever reaches mapApiError.

import { BlipfotoError, NetworkError } from '@b-oss/b-api';
import type { StringKey } from '../strings/index.js';
import { t } from '../strings/index.js';

export type ApiErrorOutcome =
  | { kind: 'forced-logout' }
  | { kind: 'upgrade-prompt'; message: string }
  | { kind: 'rate-limited'; message: string }
  | { kind: 'validation'; copyKey: StringKey }
  | { kind: 'transport' }
  | { kind: 'message'; message: string };

/** api-appendix/error-codes.md's write/validation codes, mapped to their TextStrings.csv key.
 * 303/304 and the two length-limit pairs (516/517, 525/526, 527/528) share one message each,
 * per the table's own "the message text, not the code, distinguishes the cases" note. */
const VALIDATION_CODES: Record<number, StringKey> = {
  101: 'ERR.101.username_invalid',
  102: 'ERR.102.username_taken',
  104: 'ERR.104.protected',
  202: 'ERR.202.entry_unavailable',
  205: 'ERR.205.comments_disabled',
  240: 'ERR.240.invalid_jpg',
  250: 'ERR.250.publish_too_old',
  251: 'ERR.251.publish_future',
  252: 'ERR.252.already_posted',
  303: 'ERR.303_304.comment_no_reply',
  304: 'ERR.303_304.comment_no_reply',
  305: 'ERR.305.comment_no_delete',
  306: 'ERR.306.comment_no_edit',
  516: 'ERR.516_517.journal_title',
  517: 'ERR.516_517.journal_title',
  525: 'ERR.525_526.entry_title',
  526: 'ERR.525_526.entry_title',
  527: 'ERR.527_528.tags',
  528: 'ERR.527_528.tags',
};

export function mapApiError(error: unknown): ApiErrorOutcome {
  if (error instanceof NetworkError) {
    return { kind: 'transport' };
  }
  if (error instanceof BlipfotoError) {
    if (error.isTokenInvalid) {
      return { kind: 'forced-logout' };
    }
    if (error.isRateLimited) {
      return { kind: 'rate-limited', message: t('ERR.11.rate_limited') };
    }
    if (error.code === 16) {
      // Should be unreachable — a read-only account must never be offered a write affordance.
      // Reaching this means the write gate has a bug, not a normal path (rules.md).
      return { kind: 'upgrade-prompt', message: t('UPGRADE.error.scope_16') };
    }
    const copyKey = VALIDATION_CODES[error.code];
    if (copyKey) {
      return { kind: 'validation', copyKey };
    }
    return { kind: 'message', message: error.message };
  }
  return { kind: 'message', message: 'Something went wrong. Please try again.' };
}

/** The uniform `outcome.kind === 'message' ? outcome.message : '<fallback>'` shape every call
 * site used before `validation` existed — extended to render a validation outcome's copyKey and
 * to stop discarding `rate-limited`/`upgrade-prompt`'s own message (both already carry one; they
 * just aren't `kind: 'message'`). `transport`/`forced-logout` still fall through to the caller's
 * own fallback, since both are handled as distinct states by their callers, not as inline text. */
export function describeError(outcome: ApiErrorOutcome, fallback: string): string {
  switch (outcome.kind) {
    case 'message':
    case 'rate-limited':
    case 'upgrade-prompt':
      return outcome.message;
    case 'validation':
      return t(outcome.copyKey);
    case 'transport':
    case 'forced-logout':
      return fallback;
  }
}
