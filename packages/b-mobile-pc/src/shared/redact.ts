// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Removes anything that looks like a credential from text bound for the error log or the copyable
// error details (b-oss#639). Deliberately greedy: a log line that loses a harmless long identifier is
// better than one that keeps an access token. b-mobile keeps a copy in platform/diagnostics.ts (it
// must not depend on this package); keep the two in step, their tests share the same cases.

export const REDACTED = '[redacted]';

const RULES: readonly [RegExp, string][] = [
  // Authorization: Bearer abc / "authorization":"abc"
  [
    /(authorization\b["']?\s*[:=]\s*["']?)(?:(?:bearer|basic|token)\s+)?[^\s,;"'}&]+/gi,
    `$1${REDACTED}`,
  ],
  [/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+/gi, `$1 ${REDACTED}`],
  // key=value, key: value, "key":"value" for credential-looking keys (query, fragment, JSON, headers)
  [
    /\b((?:access|refresh|id|app|auth)[_-]?token|token|client[_-]?secret|secret|password|passwd|api[_-]?key|apikey|session(?:id)?|cookie|set-cookie)(["']?\s*[:=]\s*["']?)[^\s&"',;}]+/gi,
    `$1$2${REDACTED}`,
  ],
  // An OAuth code in a URL
  [/([?&#]code=)[^\s&"']+/gi, `$1${REDACTED}`],
  // Any long opaque run (tokens, keys, long hashes)
  [/\b[A-Za-z0-9_-]{32,}\b/g, REDACTED],
];

export function redact(text: string): string {
  return RULES.reduce((out, [pattern, replacement]) => out.replace(pattern, replacement), text);
}
