// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Text fetch for the public pages on https://www.blipfoto.com (b-oss#941, epic b-oss#149). It is
// the TextFetcher b-api's fetchEntryExtras() takes. The site serves no CORS headers, so, like the
// API (platform/http.ts), it is reached by CapacitorHttp on device and through a same-origin
// proxy elsewhere: the vite dev proxy on web, the desktop shell's own route on desktop
// (b-oss#942). Both use the SITE_PROXY_PREFIX path below. Logged-out: no credentials are sent.

import { capabilities } from './capabilities.js';
import { platformFetch } from './http.js';

const SITE_ORIGIN = 'https://www.blipfoto.com';

/** Same-origin path that proxies to https://www.blipfoto.com (strips the prefix), mirroring
 * `/api/blipfoto/`. Defined here, in vite.config.ts and in the desktop shell's proxy. */
export const SITE_PROXY_PREFIX = '/site/blipfoto/';

export function siteUrlFor(url: string): string {
  if (capabilities().api.access === 'direct') return url;
  if (!url.startsWith(`${SITE_ORIGIN}/`)) throw new Error(`not a blipfoto.com page: ${url}`);
  return `${window.location.origin}${SITE_PROXY_PREFIX}${url.slice(SITE_ORIGIN.length + 1)}`;
}

/** GET a blipfoto.com page as text. Throws on a transport failure or a non-2xx status. */
export async function fetchSiteText(url: string): Promise<string> {
  const response = await platformFetch(siteUrlFor(url), { headers: { Accept: 'text/html' } });
  if (!response.ok) throw new Error(`page fetch failed: ${response.status}`);
  return response.text();
}
