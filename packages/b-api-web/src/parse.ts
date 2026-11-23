// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What a link to the Blipfoto website points at: the site's URL grammar, once. Apps map the result
// to their own routes; this only says what the link is.

import { SITE_ORIGIN } from './urls.js';

/** First path segments that are site sections, not member names. */
export const RESERVED_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  'entry',
  'me',
  'store',
  '_assets',
]);

/** The follow-requests page (path form, as `pathOf` returns it). */
export const FOLLOW_REQUEST_PATH = 'me/followers/requests';

export type SiteTarget =
  | { kind: 'entry'; entryId: string }
  | { kind: 'profile'; username: string }
  | { kind: 'follow-request' };

/** Whether `href` is a link to the site: a root-relative path (the site's own pages link that way)
 * or an http(s) URL on the site's host (www or bare). */
export function isSiteLink(href: string): boolean {
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  try {
    const { protocol, hostname } = new URL(href);
    const host = hostname.toLowerCase();
    return (
      (protocol === 'https:' || protocol === 'http:') &&
      (host === 'www.blipfoto.com' || host === 'blipfoto.com')
    );
  } catch {
    return false;
  }
}

/** The path after the host, lowercased, without leading or trailing slashes. Works for an absolute
 * site URL and a bare relative path, since links in site content are one shape or the other. */
export function pathOf(href: string): string {
  try {
    const url = new URL(href, SITE_ORIGIN);
    return url.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  } catch {
    return href.replace(/^\/+|\/+$/g, '').toLowerCase();
  }
}

/** What an already-normalised path (see `pathOf`) points at, or null for anything else. A single
 * segment that is not a site section is taken to be a member's journal (best effort: the site
 * reserves more names than are listed). */
export function targetOfPath(path: string): SiteTarget | null {
  if (path === FOLLOW_REQUEST_PATH) return { kind: 'follow-request' };
  const entry = /^entry\/([^/]+)/.exec(path);
  if (entry?.[1] !== undefined) return { kind: 'entry', entryId: entry[1] };
  if (path && !path.includes('/') && !RESERVED_PATH_SEGMENTS.has(path)) {
    return { kind: 'profile', username: path };
  }
  return null;
}

/** What a link to the site points at; null if it is not a site link or points at something else. */
export function parseSiteUrl(href: string): SiteTarget | null {
  return isSiteLink(href) ? targetOfPath(pathOf(href)) : null;
}
