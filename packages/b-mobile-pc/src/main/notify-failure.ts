// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Turns whatever a poll threw into a result the settings screen and the log can both use
// (b-oss#677). Classified by error name and code rather than `instanceof`, so it needs no import of
// b-api's classes and behaves the same on errors that crossed a module boundary. Never includes a
// token: only the error's name, the API's own error code and the HTTP status.

import type { CheckResult } from '../shared/notify.js';

interface Failure {
  result: CheckResult;
  /** One line for the log: more detail than `result.text`, still no secrets. */
  logText: string;
}

export function describeFailure(err: unknown): Failure {
  const name = err instanceof Error ? err.name : 'error';
  const message = err instanceof Error ? err.message : String(err);
  const record = err as { code?: unknown; status?: unknown } | null;
  const code = typeof record?.code === 'number' ? record.code : null;
  const status = typeof record?.status === 'number' ? record.status : null;

  if (name === 'TokenInvalidError') {
    return {
      result: {
        kind: 'sign-in-needed',
        text: 'Sign-in needed: Blipfoto rejected the saved sign-in',
      },
      logText: 'sign-in rejected by Blipfoto',
    };
  }
  if (name === 'BlipfotoError' && code === 11) {
    return {
      result: { kind: 'rate-limited', text: 'Blipfoto asked us to slow down; will retry' },
      logText: 'rate limited (API error 11)',
    };
  }
  if (name === 'BlipfotoError') {
    return {
      result: { kind: 'error', text: `Blipfoto returned an error (code ${code ?? '?'})` },
      logText: `BlipfotoError code=${code ?? '?'} message=${message}`,
    };
  }
  if (name === 'HttpError') {
    return {
      result: { kind: 'error', text: `Blipfoto answered with HTTP ${status ?? '?'}` },
      logText: `HttpError status=${status ?? '?'}`,
    };
  }
  if (name === 'NetworkError') {
    const cause = (err as { cause?: unknown }).cause;
    const causeText = cause instanceof Error ? `${cause.name}: ${cause.message}` : 'unknown cause';
    return {
      result: { kind: 'offline', text: 'Could not reach Blipfoto (network error)' },
      logText: `NetworkError cause=${causeText}`,
    };
  }
  if (name === 'SecureStorageUnavailableError') {
    return {
      result: { kind: 'error', text: 'The secure store did not give up the sign-in' },
      logText: `SecureStorageUnavailableError message=${message}`,
    };
  }
  // An unrecognised error: its name only, since its message could carry anything.
  return { result: { kind: 'error', text: 'Unexpected error' }, logText: name };
}
