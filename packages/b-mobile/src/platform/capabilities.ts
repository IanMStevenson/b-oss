// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// What the hosting platform can do, as values rather than platform checks: screens and flows read
// these and hide or swap behaviour; they never ask "am I on Android?" (b-oss#608, epic b-oss#605).
// The record is deliberately small: a capability is added when something needs it. The shape and
// the per-platform values follow the iOS investigation's matrix (b-oss#607) so iOS fits later
// without reworking callers. Values for `ios` are therefore design intent, not tested behaviour.

import { platformKind, type PlatformKind } from './platformKind.js';

export interface PlatformCapabilities {
  api: {
    /** `direct`: the HTTP client talks to the real API host (native HTTP, or a production browser
     * build). `same-origin-proxy`: the host page proxies the API on its own origin (the desktop
     * shell, and `vite dev` in a browser), because the API sends no CORS headers. */
    access: 'direct' | 'same-origin-proxy';
  };
  auth: {
    /** A clean in-app sign-in (no shared cookies) exists, so a second account always sees the
     * login form. */
    embeddedAvailable: boolean;
    /** The user may choose the system browser instead (the "Use browser to sign in" setting).
     * When false and embedded is available, embedded is the only mechanism (desktop). */
    userCanChooseBrowser: boolean;
  };
  notifications: {
    /** How the user gets told about new comments and notifications. `push`: a remote push service
     * (b-push) over FCM/APNs, needing a separate read-only token. `polling`: the desktop shell polls
     * for unread counts with the account's own app token (no second token, no service). `none`:
     * not offered (a plain browser). */
    mechanism: 'push' | 'polling' | 'none';
  };
}

const TABLE: Record<PlatformKind, PlatformCapabilities> = {
  android: {
    api: { access: 'direct' },
    auth: { embeddedAvailable: true, userCanChooseBrowser: true },
    notifications: { mechanism: 'push' },
  },
  ios: {
    api: { access: 'direct' },
    auth: { embeddedAvailable: true, userCanChooseBrowser: true },
    notifications: { mechanism: 'push' },
  },
  desktop: {
    api: { access: 'same-origin-proxy' },
    auth: { embeddedAvailable: true, userCanChooseBrowser: false },
    notifications: { mechanism: 'polling' },
  },
  web: {
    // Overridden below: a dev server proxies the API, a production browser build cannot.
    api: { access: 'direct' },
    auth: { embeddedAvailable: false, userCanChooseBrowser: false },
    notifications: { mechanism: 'none' },
  },
};

export function capabilities(): PlatformCapabilities {
  const kind = platformKind();
  const base = TABLE[kind];
  if (kind === 'web' && import.meta.env.DEV) {
    return { ...base, api: { access: 'same-origin-proxy' } };
  }
  return base;
}
