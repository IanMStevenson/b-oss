// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — mapApiError is the single error mapper every call site uses (§7); explicitly
// named in §19's "this is where the density should be" list.

import { describe, it, expect } from 'vitest';
import { BlipfotoError, NetworkError } from '@b-oss/b-api';
import { describeError, mapApiError } from '../errors.js';
import { t } from '../../strings/index.js';

describe('mapApiError', () => {
  it('maps a NetworkError to transport, the only class the upload queue retries', () => {
    expect(mapApiError(new NetworkError('offline'))).toEqual({ kind: 'transport' });
  });

  it('maps an invalid-session BlipfotoError (code 50/51) to forced-logout', () => {
    expect(mapApiError(new BlipfotoError(50, 'invalid session'))).toEqual({
      kind: 'forced-logout',
    });
    expect(mapApiError(new BlipfotoError(51, 'invalid token'))).toEqual({
      kind: 'forced-logout',
    });
  });

  it('maps a rate-limit BlipfotoError (code 11) to rate-limited with the copy-deck message', () => {
    expect(mapApiError(new BlipfotoError(11, 'too many requests'))).toEqual({
      kind: 'rate-limited',
      message: t('ERR.11.rate_limited'),
    });
  });

  it('maps insufficient-scope (code 16) to upgrade-prompt — should be unreachable via the write gate', () => {
    expect(mapApiError(new BlipfotoError(16, 'insufficient scope'))).toEqual({
      kind: 'upgrade-prompt',
      message: t('UPGRADE.error.scope_16'),
    });
  });

  it('maps any other BlipfotoError to message, carrying the error’s own text', () => {
    expect(mapApiError(new BlipfotoError(999, 'an unmapped code')).kind).toBe('message');
    expect(mapApiError(new BlipfotoError(999, 'an unmapped code'))).toEqual({
      kind: 'message',
      message: 'an unmapped code',
    });
  });

  // error-codes.md's write/validation codes (TODO G's table) → TextStrings.csv's "validation"
  // category (TODO F's keys) — a sample across the distinct groups, not every code, since the
  // mapping itself is a flat table with no branching logic per entry.
  it.each([
    [101, 'ERR.101.username_invalid'],
    [104, 'ERR.104.protected'],
    [202, 'ERR.202.entry_unavailable'],
    [240, 'ERR.240.invalid_jpg'],
    [252, 'ERR.252.already_posted'],
    [303, 'ERR.303_304.comment_no_reply'],
    [304, 'ERR.303_304.comment_no_reply'],
    [516, 'ERR.516_517.journal_title'],
    [517, 'ERR.516_517.journal_title'],
    [527, 'ERR.527_528.tags'],
  ] as const)('maps code %i to validation outcome with copyKey %s', (code, copyKey) => {
    expect(mapApiError(new BlipfotoError(code, 'server message'))).toEqual({
      kind: 'validation',
      copyKey,
    });
  });

  it('maps a non-BlipfotoError, non-NetworkError value to a generic message', () => {
    expect(mapApiError(new Error('boom'))).toEqual({
      kind: 'message',
      message: 'Something went wrong. Please try again.',
    });
    expect(mapApiError('a plain string')).toEqual({
      kind: 'message',
      message: 'Something went wrong. Please try again.',
    });
    expect(mapApiError(undefined)).toEqual({
      kind: 'message',
      message: 'Something went wrong. Please try again.',
    });
  });

  it('checks isTokenInvalid/isRateLimited before falling through to a plain message for an unrelated code', () => {
    // Code 51 is also token-invalid — confirms the forced-logout branch, not code equality, is
    // what's actually driving the check.
    expect(mapApiError(new BlipfotoError(999, 'unmapped code')).kind).toBe('message');
  });
});

describe('describeError', () => {
  it('uses the outcome message for message/rate-limited/upgrade-prompt kinds', () => {
    expect(describeError({ kind: 'message', message: 'server said no' }, 'fallback')).toBe(
      'server said no',
    );
    expect(describeError({ kind: 'rate-limited', message: 'slow down' }, 'fallback')).toBe(
      'slow down',
    );
    expect(describeError({ kind: 'upgrade-prompt', message: 'read-only' }, 'fallback')).toBe(
      'read-only',
    );
  });

  it('looks up the copy-deck text for a validation outcome', () => {
    expect(describeError({ kind: 'validation', copyKey: 'ERR.240.invalid_jpg' }, 'fallback')).toBe(
      t('ERR.240.invalid_jpg'),
    );
  });

  it('falls back to the caller-supplied text for transport/forced-logout, which are handled as distinct states', () => {
    expect(describeError({ kind: 'transport' }, 'Could not save this.')).toBe(
      'Could not save this.',
    );
    expect(describeError({ kind: 'forced-logout' }, 'Could not save this.')).toBe(
      'Could not save this.',
    );
  });
});
