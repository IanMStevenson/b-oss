// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What the main process logs for an unhandled promise rejection. Credential-looking text is scrubbed
// first (a rejection message can carry a URL or header). Deliberately small and local: the shared
// redaction and the error log arrive with b-oss#639, after which this should use them.

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
