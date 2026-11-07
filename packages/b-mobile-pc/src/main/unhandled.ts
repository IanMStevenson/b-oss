// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What the main process does with an unhandled promise rejection. The console line scrubs
// credential-looking text first (a rejection message can carry a URL or header). The error log
// (b-oss#639) is the durable record, since the console is invisible on a user's PC (b-oss#687): it
// redacts again on write, and a rate cap stops a rejection loop flooding the log.

import type { ErrorEntry } from './error-log.js';

const MAX = 2_000;

const SCRUBBERS: readonly [RegExp, string][] = [
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, '$1 [redacted]'],
  [
    /\b((?:access|refresh|id|app|auth)[_-]?token|token|secret|password|api[_-]?key|authorization)(["']?\s*[:=]\s*["']?)[^\s&"',;}]+/gi,
    '$1$2[redacted]',
  ],
  [/\b[A-Za-z0-9_-]{32,}\b/g, '[redacted]'],
];

export function describeRejection(reason: unknown): string {
  const text =
    reason instanceof Error
      ? (reason.stack ?? `${reason.name}: ${reason.message}`)
      : String(reason);
  const scrubbed = SCRUBBERS.reduce((out, [re, to]) => out.replace(re, to), text);
  return scrubbed.length > MAX ? `${scrubbed.slice(0, MAX)}...[truncated]` : scrubbed;
}

export const REJECTION_SOURCE = 'main-unhandled-rejection';
const MAX_STACK_LINES = 12;

/** The error-log entry for a rejection: its name and message, and a trimmed stack. The log redacts
 * and length-caps it on write. */
export function rejectionEntry(reason: unknown): ErrorEntry {
  if (reason instanceof Error) {
    const stack = reason.stack?.split('\n').slice(0, MAX_STACK_LINES).join('\n');
    return {
      source: REJECTION_SOURCE,
      message: `${reason.name}: ${reason.message}`,
      ...(stack ? { stack } : {}),
    };
  }
  return { source: REJECTION_SOURCE, message: `non-error rejection: ${String(reason)}` };
}

/** Writes at most `max` rejections per `windowMs`; the ones over the cap are counted and reported
 * as a single line when the next window opens, so a loop leaves a trace but not a flood. */
export function createRejectionReporter(
  write: (entry: ErrorEntry) => void,
  now: () => number = Date.now,
  max = 5,
  windowMs = 60_000,
): (reason: unknown) => void {
  let windowStart = -Infinity;
  let written = 0;
  let suppressed = 0;
  return (reason) => {
    const t = now();
    if (t - windowStart >= windowMs) {
      if (suppressed > 0) {
        write({
          source: REJECTION_SOURCE,
          message: `${suppressed} further unhandled rejection(s) were not logged (rate cap: ${max} per ${windowMs / 1000}s)`,
        });
      }
      windowStart = t;
      written = 0;
      suppressed = 0;
    }
    if (written < max) {
      written++;
      write(rejectionEntry(reason));
    } else {
      suppressed++;
    }
  };
}
