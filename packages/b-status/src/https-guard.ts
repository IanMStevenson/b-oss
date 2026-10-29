// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

/**
 * Plain-HTTP guard. Cloudflare answers `http://` requests to a workers.dev Worker itself (there is
 * no 'Always Use HTTPS' setting there), so the Worker has to refuse them. Call it first in `fetch`;
 * a non-null result is the response to return, null means the request arrived over HTTPS.
 *
 *  - GET/HEAD: 301 to the same URL (path and query kept) on https://.
 *  - anything else: 403 "HTTPS required", nothing processed. Not redirected, because a redirect
 *    would not stop a client re-sending the body or credential it has already put on the wire in
 *    clear.
 *
 * The same helper (same behaviour, same text) is used by every Worker in the b-oss, email-workers
 * and VHA repos. A copy per Worker, not a shared package: b-status and b-push depend on nothing
 * else in the repo (CLAUDE.md).
 */
export function refuseInsecure(request: Request): Response | null {
  const url = new URL(request.url);
  if (url.protocol !== 'http:') return null;
  if (request.method === 'GET' || request.method === 'HEAD') {
    url.protocol = 'https:';
    return new Response(null, { status: 301, headers: { Location: url.toString() } });
  }
  return new Response('HTTPS required\n', {
    status: 403,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
