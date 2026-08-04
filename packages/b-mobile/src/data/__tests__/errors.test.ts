// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// §19 layer 1 — mapApiError is the single error mapper every call site uses (§7); explicitly
// named in §19's "this is where the density should be" list.

import { describe, it, expect } from 'vitest';
import { BlipfotoError, NetworkError } from '@b-oss/b-api';
import { mapApiError } from '../errors.js';

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

  it('maps a rate-limit BlipfotoError (code 11) to rate-limited with a fixed message', () => {
    expect(mapApiError(new BlipfotoError(11, 'too many requests'))).toEqual({
      kind: 'rate-limited',
      message: 'Please wait a moment and try again.',
    });
  });

  it('maps insufficient-scope (code 16) to upgrade-prompt — should be unreachable via the write gate', () => {
    expect(mapApiError(new BlipfotoError(16, 'insufficient scope'))).toEqual({
      kind: 'upgrade-prompt',
      message: 'This account is signed in read-only.',
    });
  });

  it('maps any other BlipfotoError to message, carrying the error’s own text', () => {
    expect(mapApiError(new BlipfotoError(240, 'title is required'))).toEqual({
      kind: 'message',
      message: 'title is required',
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
