// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Keeps the full account of the last HTTP failure, for diagnosing an endpoint we can't see the
// server side of (b-oss#245). It can't go to logcat: capacitor.config.ts sets loggingBehavior
// 'none' (b-oss#241), because the bridge logging that carries console output also carries tokens.
// So it's one preference, read back with
//   adb shell run-as <package> cat shared_prefs/CapacitorStorage.xml
// (the same route diagnostics/feedProbe.ts uses). Holds method, URL, request body, response
// status, headers and body start — never the Authorization header, which b-api's HttpError never
// carries. Only the most recent failure is kept.

import { BlipfotoError, HttpError, NetworkError } from '@b-oss/b-api';
import { causeMessage } from './errors.js';
import { setPref } from '../platform/prefs.js';

export const HTTP_FAILURE_KEY = 'b-mobile:last-http-failure';

/** `context` is anything else worth having beside the exchange, e.g. what the screen last read. */
export async function recordHttpFailure(err: unknown, context?: unknown): Promise<void> {
  if (!(err instanceof HttpError)) return;
  try {
    await setPref(
      HTTP_FAILURE_KEY,
      JSON.stringify({ at: new Date().toISOString(), ...err.exchange, context }),
    );
  } catch {
    // Diagnostics must never turn one failure into two.
  }
}

/** What to keep of a failure that isn't (only) an HttpError — an upload can also fail with a
 * Blipfoto error envelope, a transport error, or an error from our own code (e.g. the native
 * multipart seam) that the generic message would otherwise swallow (b-oss#318). Never includes
 * request bodies or file bytes, only the error's own description. */
export function describeFailure(err: unknown): Record<string, unknown> {
  if (err instanceof HttpError) return { ...err.exchange };
  if (err instanceof BlipfotoError)
    return { kind: 'blipfoto', code: err.code, message: err.message };
  if (err instanceof NetworkError) {
    return {
      kind: 'network',
      message: err.message,
      cause: causeMessage(err.cause),
    };
  }
  if (err instanceof Error) return { kind: 'error', name: err.name, message: err.message };
  return { kind: 'unknown', message: String(err) };
}

/** Like recordHttpFailure, but for any failure; same key and read-back route. */
export async function recordFailure(err: unknown, context?: unknown): Promise<void> {
  try {
    await setPref(
      HTTP_FAILURE_KEY,
      JSON.stringify({ at: new Date().toISOString(), ...describeFailure(err), context }),
    );
  } catch {
    // Diagnostics must never turn one failure into two.
  }
}
