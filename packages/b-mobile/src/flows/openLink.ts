// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// b-oss#1002 — a link tapped inside notification text, a comment, an entry or a bio. A
// blipfoto.com journal link stays in the app; everything else opens in the browser as before.
//
// - `entry/{id}` and `me/followers/requests` are unambiguous: routed straight away.
// - A single bare path segment could be a username or a site page (`/help`), so it is tried as a
//   profile first (the same minimal, cached `user/profile` call the entry page's avatar uses). Any
//   failure — API code 101/103 (no such user), a network error, anything — hands the link to the
//   browser, so a wrong guess costs one request, never a dead end.
//
// Navigation and the browser are injected (this module imports neither react-router nor
// Capacitor), like deepLinkResolver.ts.

import { pathOf, resolveWebPathTarget } from '../data/notifications.js';
import { fetchAuthorAvatar } from '../data/users.js';
import { openUrl } from '../platform/browser.js';
import { routeDeepLink } from './deepLinkResolver.js';

function isBlipfotoLink(href: string): boolean {
  if (href.startsWith('/') && !href.startsWith('//')) return true;
  try {
    const { protocol, hostname } = new URL(href);
    return (
      (protocol === 'https:' || protocol === 'http:') &&
      (hostname.toLowerCase() === 'www.blipfoto.com' || hostname.toLowerCase() === 'blipfoto.com')
    );
  } catch {
    return false;
  }
}

export async function openLink(
  href: string,
  push: (path: string) => void,
  deps: {
    probeProfile?: (username: string) => Promise<unknown>;
    open?: (url: string) => Promise<void>;
  } = {},
): Promise<void> {
  const probeProfile = deps.probeProfile ?? fetchAuthorAvatar;
  const open = deps.open ?? openUrl;

  const target = isBlipfotoLink(href) ? resolveWebPathTarget(pathOf(href)) : null;
  if (!target) return open(href);

  if (target.kind === 'profile') {
    try {
      await probeProfile(target.username);
    } catch {
      return open(href);
    }
  }
  routeDeepLink(target, push);
}
