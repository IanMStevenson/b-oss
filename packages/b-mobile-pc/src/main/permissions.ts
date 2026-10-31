// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Which browser permission prompts the app origin may be granted (b-oss#672). Everything is denied
// except the ones listed here, and only for the app's own origin.

import { APP_ORIGIN } from './app-protocol.js';

/** Permissions the app origin is granted. Add to this list, never replace the deny-by-default. */
export const GRANTED_PERMISSIONS: ReadonlySet<string> = new Set(['geolocation']);

export function isPermissionGranted(permission: string, requestingUrl: string): boolean {
  if (!GRANTED_PERMISSIONS.has(permission)) return false;
  return requestingUrl === `${APP_ORIGIN}/` || requestingUrl.startsWith(`${APP_ORIGIN}/`);
}
