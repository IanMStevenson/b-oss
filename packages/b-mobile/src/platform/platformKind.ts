// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 Ian Stevenson

// The one place that knows which platform the app is hosted on. Everything else asks this module
// (directly, or through a capability built on it) rather than calling Capacitor.isNativePlatform()
// itself; an ESLint rule keeps it that way (b-oss#608, epic b-oss#605).
//
// Phase 1 (this file as first introduced): a pure routing change. `isCapacitorNative()` is exactly
// `Capacitor.isNativePlatform()`, so every call site behaves as before on Android and in a browser.

import { Capacitor } from '@capacitor/core';

export type PlatformKind = 'android' | 'ios' | 'web';

/** True when a Capacitor native shell (Android today, iOS later) hosts the app, i.e. when the
 * Capacitor plugins have real native implementations. Identical to Capacitor.isNativePlatform(). */
export function isCapacitorNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Which platform hosts the app. Anything that is not a Capacitor native shell is `web`; there is
 * no iOS project yet, so a native shell is Android. */
export function platformKind(): PlatformKind {
  if (!Capacitor.isNativePlatform()) return 'web';
  return Capacitor.getPlatform() === 'ios' ? 'ios' : 'android';
}
