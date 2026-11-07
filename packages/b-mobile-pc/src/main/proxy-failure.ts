// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What the API proxy records when a call fails (b-oss#728). The proxy answers every failure with the
// same 502, so without this nothing says whether it was DNS, TLS, a reset or a timeout. Only the
// method, the path (never the query string, which can carry a token) and the error's name and message
// are kept; headers are never read. The error log redacts again on write.

import type { ErrorEntry } from './error-log.js';

export const PROXY_SOURCE = 'api-proxy';
export const SITE_PROXY_SOURCE = 'site-proxy';

/** The request path with no query, fragment or credentials; "(unparseable url)" if it is not a URL. */
export function safePath(target: string): string {
  try {
    return new URL(target).pathname;
  } catch {
    return '(unparseable url)';
  }
}

/** The log entry for a call that threw (network failure before any response). */
export function proxyThrownEntry(
  method: string,
  target: string,
  err: unknown,
  source: string = PROXY_SOURCE,
): ErrorEntry {
  const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  return { source, message: `${method} ${safePath(target)} failed: ${detail}` };
}

/** The log entry for a server error (5xx) the API itself returned, or null for anything else. */
export function proxyStatusEntry(
  method: string,
  target: string,
  status: number,
  source: string = PROXY_SOURCE,
): ErrorEntry | null {
  if (status < 500) return null;
  return {
    source,
    message: `${method} ${safePath(target)} answered ${status}`,
  };
}
