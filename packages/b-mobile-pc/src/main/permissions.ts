// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Which browser permission requests the shell grants (b-oss#670). Only the camera, only video, and
// only for the app's own origin; everything else is denied. Location is deliberately not here: the
// app does not use browser location on this shell (capabilities().location is `pick-only`).

import { APP_ORIGIN } from './app-protocol.js';

export interface PermissionRequest {
  permission: string;
  /** The URL that asked (Electron's `details.requestingUrl`). */
  requestingUrl: string | undefined;
  /** For `media`: what was asked for (`details.mediaTypes`). */
  mediaTypes: readonly string[] | undefined;
}

export function isAppOrigin(url: string | undefined): boolean {
  return url !== undefined && (url === APP_ORIGIN || url.startsWith(`${APP_ORIGIN}/`));
}

export function allowPermission(req: PermissionRequest): boolean {
  if (req.permission !== 'media') return false;
  if (!isAppOrigin(req.requestingUrl)) return false;
  const types = req.mediaTypes ?? [];
  return types.length > 0 && types.every((t) => t === 'video');
}
