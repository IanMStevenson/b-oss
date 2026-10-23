// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// CORS for the page's own origins. A plain GET with no custom headers needs no preflight, and the
// share POST is sent as text/plain for the same reason (each preflight is another Worker invocation).

export const ALLOWED_ORIGINS = new Set([
  'https://b-oss.dev',
  'https://www.b-oss.dev',
  'http://localhost:4321', // astro dev
]);

export function jsonHeaders(origin: string | null, extra: Record<string, string> = {}): Headers {
  const h = new Headers({ 'Content-Type': 'application/json', Vary: 'Origin', ...extra });
  if (origin && ALLOWED_ORIGINS.has(origin)) h.set('Access-Control-Allow-Origin', origin);
  return h;
}

export function jsonResponse(
  body: unknown,
  status: number,
  origin: string | null,
  extra: Record<string, string> = {},
): Response {
  // 204 (and 304) responses must not carry a body.
  const payload = body === null || status === 204 ? null : JSON.stringify(body);
  return new Response(payload, { status, headers: jsonHeaders(origin, extra) });
}
