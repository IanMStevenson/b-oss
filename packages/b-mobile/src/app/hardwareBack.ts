// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// Android system Back policy. Browse is the app's home screen: going "back" from it never makes
// sense, so Back there does nothing (no exit, no navigation; b-oss#302). Everywhere else Ionic's
// own handling (pop the route, or exit at the root) is left alone.

/** Above the router's own handler (priority 0), below Ionic's menu (99) and overlays (100), so an
 * open drawer or modal still closes on Back before this applies. */
export const BROWSE_BACK_PRIORITY = 1;

export function isBackSwallowedAt(pathname: string): boolean {
  return pathname === '/browse' || pathname === '/browse/';
}
