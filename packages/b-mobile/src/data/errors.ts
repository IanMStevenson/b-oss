// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Single error mapper every call site uses (§7). Turns a b-api BlipfotoError/NetworkError into
// one of a small set of outcomes. The code->outcome table is TODO G's output and the copy-deck
// keys are TODO F's per app-architecture.md — until those land, this implements the mapper with
// the codes api-appendix/error-codes.md already defines and a clearly-marked default branch, so
// gaps are visible rather than silently swallowed.
//
// `validation` is not yet produced by anything below: classifying error-codes.md's write/
// validation codes (e.g. 240, 250-252, 516-528) into copy-deck keys is per-flow work that lands
// with the screen that triggers each one (compose in Phase 7, settings in Phase 8, etc.), not
// something this generic mapper can do correctly in isolation.

import { BlipfotoError, NetworkError } from '@b-oss/b-api';

export type ApiErrorOutcome =
  | { kind: 'forced-logout' }
  | { kind: 'upgrade-prompt'; message: string }
  | { kind: 'rate-limited'; message: string }
  | { kind: 'validation'; copyKey: string }
  | { kind: 'transport' }
  | { kind: 'message'; message: string };

export function mapApiError(error: unknown): ApiErrorOutcome {
  if (error instanceof NetworkError) {
    return { kind: 'transport' };
  }
  if (error instanceof BlipfotoError) {
    if (error.isTokenInvalid) {
      return { kind: 'forced-logout' };
    }
    if (error.isRateLimited) {
      return { kind: 'rate-limited', message: 'Please wait a moment and try again.' };
    }
    if (error.code === 16) {
      // Should be unreachable — a read-only account must never be offered a write affordance.
      // Reaching this means the write gate has a bug, not a normal path (rules.md).
      return { kind: 'upgrade-prompt', message: 'This account is signed in read-only.' };
    }
    return { kind: 'message', message: error.message };
  }
  return { kind: 'message', message: 'Something went wrong. Please try again.' };
}
