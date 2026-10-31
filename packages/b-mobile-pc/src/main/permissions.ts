// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Which browser permission requests the shell grants, always for the app's own origin only; everything
// else is denied (deny by default). Two things are granted:
//  - `geolocation` (b-oss#672): "Show current location", requested only when the user taps the control;
//  - `media` limited to **video** (b-oss#670): the webcam capture view. Audio is never granted.
// Notifications and the rest go through the shell, not the page.

import { APP_ORIGIN } from './app-protocol.js';

export interface PermissionRequest {
  permission: string;
  /** The URL that asked (Electron's `details.requestingUrl`). */
  requestingUrl: string | undefined;
  /** For `media`: what was asked for (`details.mediaTypes`). */
  mediaTypes: readonly string[] | undefined;
}

/** Permissions granted wholesale to the app origin. Add to this list, never replace the deny-by-default. */
export const GRANTED_PERMISSIONS: ReadonlySet<string> = new Set(['geolocation']);

export function isAppOrigin(url: string | undefined): boolean {
  return url !== undefined && (url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`));
}

export function allowPermission(req: PermissionRequest): boolean {
  if (!isAppOrigin(req.requestingUrl)) return false;
  if (GRANTED_PERMISSIONS.has(req.permission)) return true;
  if (req.permission === 'media') {
    const types = req.mediaTypes ?? [];
    return types.length > 0 && types.every((t) => t === 'video');
  }
  return false;
}

/** For callers that have only the permission name and the URL (no media detail): never grants `media`. */
export function isPermissionGranted(permission: string, requestingUrl: string): boolean {
  return allowPermission({ permission, requestingUrl, mediaTypes: undefined });
}
